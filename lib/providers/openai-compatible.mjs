import zlib from "node:zlib";
import { BaseProviderAdapter } from "./base.mjs";
import { validateProviderUrl } from "../security.mjs";
import { AGENTIC_TOOLS, executeTool } from "../tools.mjs";
import { EFFORT_MAP } from "../config.mjs";
import { recordToolCall } from "../db.mjs";
import { 
  SignorError, 
  AuthenticationError, 
  RateLimitError, 
  ProviderTimeoutError, 
  SecurityError 
} from "../errors.mjs";

export class OpenAICompatibleAdapter extends BaseProviderAdapter {
  constructor(providerId = "openai", meta = {}) {
    super(providerId, {
      name: meta.name || "OpenAI Compatible",
      defaultBaseUrl: meta.defaultBaseUrl || "https://api.openai.com/v1",
      defaultModel: meta.defaultModel || "gpt-4o",
      ...meta,
    });
    this.allowLocal = meta.allowLocal || false;
  }

  resolveEndpoint(baseUrl) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/+$/, "");
    return base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  }

  async validateConnection(config) {
    const base = (config.base_url || this.defaultBaseUrl).replace(/\/+$/, "");
    const endpoint = this.resolveEndpoint(base);
    const start = Date.now();

    const body = JSON.stringify({
      model: config.model || this.defaultModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
      temperature: 0.1,
    });

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.api_key}`,
          "Accept-Encoding": "identity",
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { valid: true, status: "live", latencyMs, httpStatus: res.status };
      }
      return { valid: false, status: "error", latencyMs, httpStatus: res.status, error: `HTTP ${res.status}` };
    } catch (err) {
      return { valid: false, status: "down", latencyMs: Date.now() - start, error: err.message };
    }
  }

  async call(messages, options = {}, config = {}) {
    const effortParams = EFFORT_MAP[config.effort] || EFFORT_MAP.high;
    const endpoint = this.resolveEndpoint(config.base_url);

    // SSRF Check
    const urlCheck = validateProviderUrl(endpoint, { allowLocal: this.allowLocal });
    if (!urlCheck.valid) {
      throw new SecurityError(`SSRF Block for [${this.name}]: ${urlCheck.reason}`);
    }

    const projectDir = options.projectDir || process.cwd();
    const runId = options.runId || null;
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
        model: config.model || this.defaultModel,
        messages: currentMessages,
        temperature,
        max_tokens,
        stream: shouldStream,
      };

      if (enableTools && !forceFinalText && iterations < maxToolIterations) {
        payload.tools = AGENTIC_TOOLS;
        payload.tool_choice = "auto";
        payload.stream = false;
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
            // Streaming mode
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
                if (fullContent && fullContent.trim().length > 200) {
                  if (!options.silent && !options.noStdout) {
                    console.log(`\n[${this.name}] Stream timeout reached, rescued accumulated content.`);
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
                return fullContent;
              }

              // Fallback to non-streaming if stream was empty
              payload.stream = false;
              body = JSON.stringify(payload);
              continue;
            }

            // Non-streaming response
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
              throw new SignorError(`[${this.name}] No response message returned.`, "CONTRACT_ERROR", 502);
            }

            // Tool calls
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
                try { if (runId) recordToolCall(runId, name, args, result, "success", projectDir); } catch {}
                currentMessages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  name,
                  content: result,
                });
              }
              break;
            }

            let content = message.content || message.reasoning_content || message.thought || "";
            if (!content.trim() && iterations < maxToolIterations && currentMessages.some(m => m.role === "tool")) {
              currentMessages.push({
                role: "user",
                content: "بناءً على نتائج الأدوات والملفات التي فحصتها، اكتب الآن التقرير المعماري والخطة الشاملة والمفصلة باللغة العربية بصيغة Markdown."
              });
              forceFinalText = true;
              break;
            }

            if (!options.silent && !options.noStdout) {
              process.stdout.write(content);
            }
            return content;
          }

          const errText = await response.text().catch(() => "");
          if (payload.tools && (response.status === 400 || response.status === 500 || response.status === 502)) {
            delete payload.tools;
            delete payload.tool_choice;
            body = JSON.stringify(payload);
            continue;
          }

          const typedErr = this.classifyError(response.status, errText, config.model || this.defaultModel);
          if (typedErr instanceof AuthenticationError || typedErr instanceof SecurityError) {
            throw typedErr;
          }

          lastErr = typedErr;
          let backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
          if (typedErr instanceof RateLimitError && typedErr.retryAfter) {
            backoffMs = Math.min(typedErr.retryAfter * 1000, 10000);
          }

          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
          throw lastErr;
        } catch (e) {
          let errToHandle = e;
          if (e.name === "TimeoutError" || e.name === "AbortError" || e.message?.includes("timed out")) {
            errToHandle = new ProviderTimeoutError(`[${this.name}] Request timed out after ${timeoutMs}ms`, timeoutMs);
          }
          lastErr = errToHandle;
          if (errToHandle instanceof AuthenticationError || errToHandle instanceof SecurityError) {
            throw errToHandle;
          }
          if (attempt < maxRetries) {
            const backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
          throw lastErr;
        }
      }
    }

    throw new SignorError(`[${this.name}] Maximum conversation turns exceeded.`, "INTERNAL_ERROR", 500);
  }
}
