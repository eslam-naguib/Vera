import { OpenAICompatibleAdapter } from "./openai-compatible.mjs";

export class OllamaProviderAdapter extends OpenAICompatibleAdapter {
  constructor(providerId = "ollama", meta = {}) {
    super(providerId, {
      name: meta.name || "Ollama (Local LLM)",
      defaultBaseUrl: meta.defaultBaseUrl || "http://127.0.0.1:11434/v1",
      defaultModel: meta.defaultModel || "llama3",
      allowLocal: true,
      ...meta,
    });
  }
}
