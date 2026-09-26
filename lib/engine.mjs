import zlib from "node:zlib";
import { EFFORT_MAP } from "./config.mjs";
import { AGENTIC_TOOLS, executeTool } from "./tools.mjs";
import { recordRunStart, recordRunFinish, recordToolCall } from "./db.mjs";
import { 
  SignorError, 
  AuthenticationError, 
  RateLimitError, 
  ProviderTimeoutError, 
  ModelUnavailableError, 
  SecurityError 
} from "./errors.mjs";
import { validateProviderUrl } from "./security.mjs";
import { getProviderAdapter, resolveProviderConfig } from "./providers/registry.mjs";
import { resolveProviderSecret } from "./secrets.mjs";

export async function callSignor(messages, options = {}, config = {}) {
  const providerId = (options.provider || config.provider_id || "signor").trim().toLowerCase();

  // If a dedicated external provider is requested (anthropic, openai, gemini, ollama, etc.)
  if (providerId !== "signor") {
    const adapter = getProviderAdapter(providerId);
    const resolvedConfig = resolveProviderConfig(providerId, config);
    if (!resolvedConfig.api_key) {
      resolvedConfig.api_key = resolveProviderSecret(providerId, config.secret_ref, options.projectDir);
    }
    return await adapter.call(messages, options, resolvedConfig);
  }

  const effortParams = EFFORT_MAP[config.effort] || EFFORT_MAP.high;
  const base = config.base_url.replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  // SSRF Protection: validate endpoint destination
  const urlCheck = validateProviderUrl(endpoint);
  if (!urlCheck.valid) {
    throw new SecurityError(`SSRF Block: Provider endpoint is invalid or prohibited: ${urlCheck.reason}`);
  }

  const projectDir = options.projectDir || process.cwd();
  const runId = options.runId || recordRunStart(options.kind || "command", config.model, config.effort, projectDir);
  const startTime = Date.now();

  const temperature = options.temperature ?? effortParams.temperature;
  const max_tokens = options.max_tokens ?? effortParams.max_tokens;
  const timeoutMs = options.timeout ?? (options.stream !== false ? Math.max(effortParams.timeout, 420000) : effortParams.timeout);
  const maxRetries = options.max_retries ?? (config.max_retries || 3);
  const enableTools = options.enableTools ?? false;

  let currentMessages = [...messages];
  let iterations = 0;
  let forceFinalText = false;
  const maxToolIterations = 12;

  while (iterations < maxToolIterations) {
    iterations++;

    const isFinalTextPhase = !enableTools || forceFinalText || iterations >= maxToolIterations;
    const shouldStream = isFinalTextPhase && options.stream !== false;

    const payload = {
      model: config.model,
      messages: currentMessages,
      temperature,
      max_tokens,
      stream: shouldStream,
    };

    // If approaching max iterations or forcing final text, do not attach tools
    if (enableTools && !forceFinalText && iterations < maxToolIterations) {
      payload.tools = AGENTIC_TOOLS;
      payload.tool_choice = "auto";
      payload.stream = false; // Always use reliable non-streaming for tool calling
    }

    let body = JSON.stringify(payload);
    let lastErr;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.api_key}`,
            "Accept-Encoding": "identity",
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          // If streaming was requested, read tokens live via SSE
          if (payload.stream && response.body) {
            let fullContent = "";
            const contentEncoding = (response.headers.get("content-encoding") || "").toLowerCase();
            let stream = response.body;
            if (contentEncoding === "br") {
              const { Readable } = await import("node:stream");
              stream = Readable.fromWeb(response.body).pipe(zlib.createBrotliDecompress());
            } else if (contentEncoding === "gzip" || contentEncoding === "deflate") {
              const { Readable } = await import("node:stream");
              stream = Readable.fromWeb(response.body).pipe(zlib.createGunzip());
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let streamFinished = false;

            try {
              for await (const chunk of stream) {
                if (streamFinished) break;
                const chunkStr = Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : decoder.decode(chunk, { stream: true });
                buffer += chunkStr;
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith("data: ")) {
                    const dataStr = trimmed.slice(6).trim();
                    if (dataStr === "[DONE]") {
                      streamFinished = true;
                      break;
                    }
                    try {
                      const parsed = JSON.parse(dataStr);
                      const delta = parsed.choices?.[0]?.delta;
                      const token = delta?.content || delta?.reasoning_content || delta?.reasoning || delta?.thought || parsed.choices?.[0]?.text || "";
                      if (token) {
                        fullContent += token;
                        if (!options.silent && !options.noStdout) {
                          process.stdout.write(token);
                        }
                        if (typeof options.onToken === "function") {
                          options.onToken(token);
                        }
                      }
                    } catch {}
                  }
                }
                if (streamFinished) break;
              }
            } catch (streamErr) {
              if (fullContent && fullContent.trim().length > 300) {
                if (!options.silent && !options.noStdout) {
                  console.log("\n[Signor] Stream interrupted by timeout, successfully rescued accumulated content.");
                }
                streamFinished = true;
              } else {
                throw streamErr;
              }
            } finally {
              try {
                if (typeof response.body.cancel === "function") {
                  response.body.cancel().catch(() => {});
                }
              } catch {}
            }

            if (fullContent && fullContent.trim()) {
              try {
                recordRunFinish(runId, "completed", Date.now() - startTime, null, null, projectDir);
              } catch {}
              return fullContent;
            }

            if (!options.silent) {
              console.log("[Signor] Streaming returned empty content, retrying in non-streaming mode...");
            }
            payload.stream = false;
            body = JSON.stringify(payload);
            continue;
          }

          const buf = Buffer.from(await response.arrayBuffer());
          let rawText;
          try {
            rawText = zlib.brotliDecompressSync(buf).toString();
          } catch {
            try {
              rawText = zlib.gunzipSync(buf).toString();
            } catch {
              rawText = buf.toString();
            }
          }
          const data = JSON.parse(rawText);
          const choice = data.choices?.[0];
          const message = choice?.message;

          if (!message) {
            throw new SignorError("No response message returned from Signor API.", "CONTRACT_ERROR", 502);
          }

          // Check if model requested tool calls
          if (message.tool_calls && message.tool_calls.length > 0 && enableTools) {
            currentMessages.push(message);

            for (const tc of message.tool_calls) {
              const name = tc.function.name;
              let args = {};
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {}

              if (!options.silent) {
                console.log(`\n  ⚡ [Tool Call] ${name}(${JSON.stringify(args).slice(0, 80)}...)`);
              }

              const result = await executeTool(name, args, projectDir);
              try { recordToolCall(runId, name, args, result, "success", projectDir); } catch {}
              currentMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                name,
                content: result,
              });
            }

            // Loop back to call API with tool results
            break;
          }

          // Plain text response
          let content = message.content || "";
          if (!content.trim() && (message.reasoning_content || message.reasoning || message.thought)) {
            content = message.reasoning_content || message.reasoning || message.thought;
          }

          // If content is empty after tool calls, force a final completion turn without tools
          if (!content.trim() && iterations < maxToolIterations && currentMessages.some(m => m.role === "tool")) {
            currentMessages.push({
              role: "user",
              content: "بناءً على نتائج الأدوات والملفات التي فحصتها، اكتب الآن التقرير المعماري والخطة الشاملة والمفصلة باللغة العربية بصيغة Markdown."
            });
            forceFinalText = true;
            break; // retry loop to get final text
          }

          if (!options.silent && !options.noStdout) {
            process.stdout.write(content);
          }

          try {
            recordRunFinish(runId, "completed", Date.now() - startTime, null, null, projectDir);
          } catch {}

          return content;
        }

        const errText = await response.text().catch(() => "");

        // If tools were enabled and upstream failed with 400, 500, or 502, disable tools and rebuild payload body
        if (payload.tools && (response.status === 400 || response.status === 500 || response.status === 502)) {
          if (!options.silent) {
            console.log(`[Signor] Model '${config.model}' does not support tool calling (HTTP ${response.status}). Retrying in direct prompt mode...`);
          }
          delete payload.tools;
          delete payload.tool_choice;
          body = JSON.stringify(payload); // Rebuild body with updated payload!
          continue;
        }

        // Map HTTP status to typed errors
        let typedErr;
        if (response.status === 401 || response.status === 403) {
          typedErr = new AuthenticationError(`Authentication failed with provider (HTTP ${response.status}): ${errText}`);
          throw typedErr; // Non-retryable
        } else if (response.status === 429) {
          const retryHeader = response.headers.get("retry-after");
          const retrySec = retryHeader ? parseInt(retryHeader, 10) : null;
          typedErr = new RateLimitError(`Provider rate limit reached (HTTP 429): ${errText}`, retrySec);
        } else if (response.status >= 500) {
          typedErr = new ModelUnavailableError(config.model, response.status);
        } else {
          typedErr = new SignorError(`Provider request failed (HTTP ${response.status}): ${errText}`, "PROVIDER_ERROR", response.status);
          throw typedErr; // Non-retryable
        }

        lastErr = typedErr;

        // Calculate backoff respecting Retry-After header
        let backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
        if (typedErr instanceof RateLimitError && typedErr.retryAfter) {
          backoffMs = Math.min(typedErr.retryAfter * 1000, 10000);
        }

        if (attempt < maxRetries) {
          if (!options.silent) {
            console.log(`[Signor] Retryable ${response.status} on attempt ${attempt}/${maxRetries}, retrying in ${Math.round(backoffMs)}ms...`);
          }
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        throw lastErr;
      } catch (e) {
        let errToHandle = e;
        if (e.name === "TimeoutError" || e.name === "AbortError" || e.message?.includes("timed out")) {
          errToHandle = new ProviderTimeoutError(`Provider request timed out after ${timeoutMs}ms`, timeoutMs);
        }

        lastErr = errToHandle;

        // Non-retryable errors abort loop immediately
        if (errToHandle instanceof AuthenticationError || errToHandle instanceof SecurityError) {
          try { recordRunFinish(runId, "failed", Date.now() - startTime, errToHandle.code, errToHandle.message, projectDir); } catch {}
          throw errToHandle;
        }

        if (attempt < maxRetries) {
          const backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
          if (!options.silent) {
            console.log(`[Signor] Request attempt ${attempt}/${maxRetries} failed: ${errToHandle.message}, retrying in ${Math.round(backoffMs)}ms...`);
          }
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        try { recordRunFinish(runId, "failed", Date.now() - startTime, errToHandle.code || "EXECUTION_ERROR", errToHandle.message, projectDir); } catch {}
        throw lastErr;
      }
    }

    if (iterations >= maxToolIterations) {
      throw new SignorError(`Exceeded maximum tool call iterations (${maxToolIterations})`, "TOOL_LOOP_EXCEEDED", 500);
    }
  }

  throw new SignorError("Unexpected end of conversation loop.", "INTERNAL_ERROR", 500);
}
