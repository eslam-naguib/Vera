import { OpenAICompatibleAdapter } from "./openai-compatible.mjs";

export class GeminiProviderAdapter extends OpenAICompatibleAdapter {
  constructor(providerId = "gemini", meta = {}) {
    super(providerId, {
      name: meta.name || "Google Gemini",
      defaultBaseUrl: meta.defaultBaseUrl || "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: meta.defaultModel || "gemini-2.5-pro",
      ...meta,
    });
  }
}
