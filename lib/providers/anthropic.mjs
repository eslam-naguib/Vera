import { BaseProviderAdapter } from "./base.mjs";
import { validateProviderUrl } from "../security.mjs";
import { EFFORT_MAP } from "../config.mjs";
import { 
  SignorError, 
  AuthenticationError, 
  RateLimitError, 
  ProviderTimeoutError, 
  SecurityError 
} from "../errors.mjs";

export class AnthropicProviderAdapter extends BaseProviderAdapter {
  constructor(providerId = "anthropic", meta = {}) {
    super(providerId, {
      name: meta.name || "Anthropic",
      defaultBaseUrl: meta.defaultBaseUrl || "https://api.anthropic.com/v1",
      defaultModel: meta.defaultModel || "claude-3-7-sonnet-20250219",
      ...meta,
    });
  }

  resolveEndpoint(baseUrl) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/+$/, "");
    return base.endsWith("/messages") ? base : `${base}/messages`;
  }

  /**
   * Adapts standard messages into Anthropic's { system, messages: [...] } schema.
   */
  adaptMessages(messages) {
    let systemPrompt = "";
    const adapted = [];

    for (const m of messages) {
      if (m.role === "system") {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${m.content}` : m.content;
      } else {
        const role = m.role === "assistant" ? "assistant" : "user";
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        
        // Ensure non-empty content
        if (content.trim()) {
          // Anthropic requires alternating roles; merge consecutive same-role messages
          const prev = adapted[adapted.length - 1];
          if (prev && prev.role === role) {
            prev.content += `\n\n${content}`;
          } else {
            adapted.push({ role, content });
          }
        }
      }
    }

    // Anthropic requires messages to start with a user message
    if (adapted.length === 0 || adapted[0].role !== "user") {
      adapted.unshift({ role: "user", content: "Hello" });
    }

    return { system: systemPrompt || undefined, messages: adapted };
  }

  async validateConnection(config) {
    const endpoint = this.resolveEndpoint(config.base_url);
    const start = Date.now();

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.api_key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model || this.defaultModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
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

    const urlCheck = validateProviderUrl(endpoint);
    if (!urlCheck.valid) {
      throw new SecurityError(`SSRF Block for Anthropic: ${urlCheck.reason}`);
    }

    const temperature = options.temperature ?? effortParams.temperature;
    const max_tokens = options.max_tokens ?? effortParams.max_tokens;
    const timeoutMs = options.timeout ?? (options.stream !== false ? Math.max(effortParams.timeout, 420000) : effortParams.timeout);
    const shouldStream = options.stream !== false;

    const { system, messages: anthropicMessages } = this.adaptMessages(messages);

    const payload = {
      model: config.model || this.defaultModel,
      messages: anthropicMessages,
      max_tokens,
      temperature,
      stream: shouldStream,
    };
    if (system) {
      payload.system = system;
    }

    const body = JSON.stringify(payload);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.api_key,
          "anthropic-version": "2023-06-01",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw this.classifyError(response.status, errText, config.model || this.defaultModel);
      }

      if (shouldStream && response.body) {
        let fullContent = "";
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                const dataStr = trimmed.slice(6).trim();
                try {
                  const parsed = JSON.parse(dataStr);
                  // Anthropic SSE token extraction
                  if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                    const token = parsed.delta.text || "";
                    if (token) {
                      fullContent += token;
                      if (!options.silent && !options.noStdout) {
                        process.stdout.write(token);
                      }
                      if (typeof options.onToken === "function") {
                        options.onToken(token);
                      }
                    }
                  }
                } catch {}
              }
            }
          }
        } catch (streamErr) {
          if (fullContent && fullContent.trim().length > 200) {
            console.log("\n[Anthropic] Stream timeout reached, rescued accumulated content.");
          } else {
            throw streamErr;
          }
        }

        return fullContent;
      }

      // Non-streaming
      const data = await response.json();
      const contentBlock = data.content?.[0];
      const text = contentBlock?.text || "";

      if (!options.silent && !options.noStdout) {
        process.stdout.write(text);
      }
      return text;
    } catch (err) {
      if (err instanceof SignorError) throw err;
      if (err.name === "TimeoutError" || err.message?.includes("timed out")) {
        throw new ProviderTimeoutError(`[Anthropic] Request timed out after ${timeoutMs}ms`, timeoutMs);
      }
      throw new SignorError(`[Anthropic] Request failed: ${err.message}`, "PROVIDER_ERROR", 500);
    }
  }
}
