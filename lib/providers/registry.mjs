import { OpenAICompatibleAdapter } from "./openai-compatible.mjs";
import { AnthropicProviderAdapter } from "./anthropic.mjs";
import { GeminiProviderAdapter } from "./gemini.mjs";
import { OllamaProviderAdapter } from "./ollama.mjs";

export const SUPPORTED_PROVIDERS = {
  signor: {
    id: "signor",
    name: "Signor AI Gateway",
    defaultBaseUrl: "https://api.code.signor.ai/v1",
    defaultModel: "gpt-5.6-sol",
    type: "openai-compatible",
    envKey: "SIGNOR_API_KEY",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    type: "openai-compatible",
    envKey: "OPENAI_API_KEY",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-7-sonnet-20250219",
    type: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-pro",
    type: "gemini",
    envKey: "GEMINI_API_KEY",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local LLM)",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3",
    type: "ollama",
    allowLocal: true,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.7-sonnet",
    type: "openai-compatible",
    envKey: "OPENROUTER_API_KEY",
  },
  groq: {
    id: "groq",
    name: "Groq LPU",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    type: "openai-compatible",
    envKey: "GROQ_API_KEY",
  }
};

/**
 * Returns an instance of the provider adapter based on provider ID.
 */
export function getProviderAdapter(providerId = "signor", overrides = {}) {
  const normId = (providerId || "signor").trim().toLowerCase();
  const meta = SUPPORTED_PROVIDERS[normId] || {
    id: normId,
    name: normId,
    defaultBaseUrl: overrides.base_url || "https://api.openai.com/v1",
    defaultModel: overrides.model || "gpt-4o",
    type: "openai-compatible",
  };

  switch (meta.type) {
    case "anthropic":
      return new AnthropicProviderAdapter(normId, { ...meta, ...overrides });
    case "gemini":
      return new GeminiProviderAdapter(normId, { ...meta, ...overrides });
    case "ollama":
      return new OllamaProviderAdapter(normId, { ...meta, ...overrides });
    case "openai-compatible":
    default:
      return new OpenAICompatibleAdapter(normId, { ...meta, ...overrides });
  }
}

/**
 * Resolves configuration for a specific provider by merging root config, provider map, and defaults.
 */
export function resolveProviderConfig(providerId = "signor", rootConfig = {}) {
  const normId = (providerId || "signor").trim().toLowerCase();
  const meta = SUPPORTED_PROVIDERS[normId] || {};

  const providerSection = rootConfig.providers?.[normId] || {};
  
  // If provider matches root config provider, inherit root config values
  const isDefaultProvider = normId === (rootConfig.provider_id || "signor");

  const baseUrl = providerSection.base_url || (isDefaultProvider ? rootConfig.base_url : meta.defaultBaseUrl) || meta.defaultBaseUrl;
  const model = providerSection.model || (isDefaultProvider ? rootConfig.model : meta.defaultModel) || meta.defaultModel;
  const apiKey = providerSection.api_key || (isDefaultProvider ? rootConfig.api_key : "") || "";
  const effort = providerSection.effort || rootConfig.effort || "medium";

  return {
    provider_id: normId,
    provider_name: meta.name || normId,
    base_url: baseUrl,
    model: model,
    api_key: apiKey,
    effort: effort,
    max_retries: rootConfig.max_retries || 3,
  };
}

export function listSupportedProviders() {
  return Object.values(SUPPORTED_PROVIDERS);
}
