import { 
  SignorError, 
  AuthenticationError, 
  RateLimitError, 
  ProviderTimeoutError, 
  ModelUnavailableError, 
  SecurityError 
} from "../errors.mjs";

/**
 * Base abstract adapter for all AI providers in Signor AI.
 */
export class BaseProviderAdapter {
  constructor(providerId, providerMeta = {}) {
    this.providerId = providerId;
    this.name = providerMeta.name || providerId;
    this.defaultBaseUrl = providerMeta.defaultBaseUrl || "";
    this.defaultModel = providerMeta.defaultModel || "";
  }

  /**
   * Normalizes incoming OpenAI-style messages.
   */
  normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.map(m => ({
      role: m.role || "user",
      content: typeof m.content === "string" ? m.content : (m.content ? JSON.stringify(m.content) : "")
    }));
  }

  /**
   * Map HTTP status codes or error messages to typed Signor errors.
   */
  classifyError(status, errText = "", modelId = "") {
    if (status === 401 || status === 403) {
      return new AuthenticationError(`[${this.name}] Authentication failed (HTTP ${status}): ${errText}`);
    }
    if (status === 429) {
      return new RateLimitError(`[${this.name}] Rate limit reached (HTTP 429): ${errText}`);
    }
    if (status >= 500) {
      return new ModelUnavailableError(modelId || this.defaultModel, status);
    }
    return new SignorError(`[${this.name}] Request failed (HTTP ${status}): ${errText}`, "PROVIDER_ERROR", status);
  }

  /**
   * Validates connectivity to the provider.
   */
  async validateConnection(config) {
    throw new Error(`validateConnection() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Performs completion call (streaming or non-streaming).
   */
  async call(messages, options, config) {
    throw new Error(`call() must be implemented by ${this.constructor.name}`);
  }
}
