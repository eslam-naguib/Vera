import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { 
  getProviderAdapter, 
  resolveProviderConfig, 
  listSupportedProviders,
  SUPPORTED_PROVIDERS,
  BaseProviderAdapter,
  OpenAICompatibleAdapter,
  AnthropicProviderAdapter,
  GeminiProviderAdapter,
  OllamaProviderAdapter
} from "../lib/providers/index.mjs";

import { 
  resolveProviderSecret, 
  storeProviderSecretKey 
} from "../lib/secrets.mjs";

import { validateProviderUrl } from "../lib/security.mjs";
import { AuthenticationError, RateLimitError, ModelUnavailableError } from "../lib/errors.mjs";

test("providers: getProviderAdapter returns correct adapter instances", () => {
  const signorAdapter = getProviderAdapter("signor");
  assert.ok(signorAdapter instanceof OpenAICompatibleAdapter);
  assert.strictEqual(signorAdapter.providerId, "signor");

  const openaiAdapter = getProviderAdapter("openai");
  assert.ok(openaiAdapter instanceof OpenAICompatibleAdapter);
  assert.strictEqual(openaiAdapter.providerId, "openai");

  const anthropicAdapter = getProviderAdapter("anthropic");
  assert.ok(anthropicAdapter instanceof AnthropicProviderAdapter);
  assert.strictEqual(anthropicAdapter.providerId, "anthropic");

  const geminiAdapter = getProviderAdapter("gemini");
  assert.ok(geminiAdapter instanceof GeminiProviderAdapter);
  assert.strictEqual(geminiAdapter.providerId, "gemini");

  const ollamaAdapter = getProviderAdapter("ollama");
  assert.ok(ollamaAdapter instanceof OllamaProviderAdapter);
  assert.strictEqual(ollamaAdapter.providerId, "ollama");
  assert.strictEqual(ollamaAdapter.allowLocal, true);
});

test("providers: resolveProviderConfig correctly merges root and provider-specific configurations", () => {
  const rootConfig = {
    provider_id: "signor",
    base_url: "https://api.code.signor.ai/v1",
    model: "gpt-6-astra",
    effort: "high",
    providers: {
      anthropic: {
        model: "claude-3-7-sonnet-20250219",
        effort: "ultra",
      },
    },
  };

  const signorConfig = resolveProviderConfig("signor", rootConfig);
  assert.strictEqual(signorConfig.provider_id, "signor");
  assert.strictEqual(signorConfig.model, "gpt-6-astra");
  assert.strictEqual(signorConfig.effort, "high");

  const anthropicConfig = resolveProviderConfig("anthropic", rootConfig);
  assert.strictEqual(anthropicConfig.provider_id, "anthropic");
  assert.strictEqual(anthropicConfig.model, "claude-3-7-sonnet-20250219");
  assert.strictEqual(anthropicConfig.effort, "ultra");
  assert.strictEqual(anthropicConfig.base_url, "https://api.anthropic.com/v1");
});

test("providers: Anthropic adapter adapts OpenAI messages into Anthropic schema", () => {
  const adapter = new AnthropicProviderAdapter();

  const messages = [
    { role: "system", content: "You are an expert engineer." },
    { role: "user", content: "Hello world" },
    { role: "user", content: "Second user note" },
    { role: "assistant", content: "Understood." }
  ];

  const adapted = adapter.adaptMessages(messages);
  assert.strictEqual(adapted.system, "You are an expert engineer.");
  assert.strictEqual(adapted.messages.length, 2);
  assert.strictEqual(adapted.messages[0].role, "user");
  assert.ok(adapted.messages[0].content.includes("Hello world"));
  assert.ok(adapted.messages[0].content.includes("Second user note"));
  assert.strictEqual(adapted.messages[1].role, "assistant");
  assert.strictEqual(adapted.messages[1].content, "Understood.");

  // Endpoint resolution
  assert.strictEqual(adapter.resolveEndpoint("https://api.anthropic.com/v1"), "https://api.anthropic.com/v1/messages");
  assert.strictEqual(adapter.resolveEndpoint("https://api.anthropic.com/v1/messages"), "https://api.anthropic.com/v1/messages");
});

test("providers: resolveProviderSecret checks provider-specific environment variables and keys", () => {
  const origOpenAI = process.env.OPENAI_API_KEY;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;

  try {
    process.env.OPENAI_API_KEY = "sk-test-openai-123456";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-789012";

    const openaiSecret = resolveProviderSecret("openai");
    assert.strictEqual(openaiSecret, "sk-test-openai-123456");

    const anthropicSecret = resolveProviderSecret("anthropic");
    assert.strictEqual(anthropicSecret, "sk-ant-test-789012");
  } finally {
    if (origOpenAI !== undefined) process.env.OPENAI_API_KEY = origOpenAI;
    else delete process.env.OPENAI_API_KEY;

    if (origAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = origAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
  }
});

test("providers: SSRF validation permits local Ollama loopback only when allowLocal is true", () => {
  const ollamaUrl = "http://127.0.0.1:11434/v1/chat/completions";

  // Without allowLocal: blocked
  const resBlocked = validateProviderUrl(ollamaUrl, { allowLocal: false });
  assert.strictEqual(resBlocked.valid, false);

  // With allowLocal: allowed
  const resAllowed = validateProviderUrl(ollamaUrl, { allowLocal: true });
  assert.strictEqual(resAllowed.valid, true);

  // Cloud metadata endpoint must always be blocked
  const resMeta = validateProviderUrl("http://169.254.169.254/latest/meta-data", { allowLocal: true });
  assert.strictEqual(resMeta.valid, false);
});

test("providers: BaseProviderAdapter correctly normalizes messages and classifies errors", () => {
  const adapter = new BaseProviderAdapter("test-provider", { name: "TestProvider", defaultModel: "test-model" });

  const normalized = adapter.normalizeMessages([
    { role: "user", content: "hi" },
    { role: "assistant", content: { text: "hello" } },
    { role: "system" }
  ]);
  assert.strictEqual(normalized.length, 3);
  assert.strictEqual(normalized[0].content, "hi");
  assert.strictEqual(normalized[1].content, '{"text":"hello"}');
  assert.strictEqual(normalized[2].content, "");

  const authErr = adapter.classifyError(401, "Unauthorized");
  assert.ok(authErr instanceof AuthenticationError);

  const rateErr = adapter.classifyError(429, "Too many requests");
  assert.ok(rateErr instanceof RateLimitError);

  const serverErr = adapter.classifyError(503, "Service unavailable", "test-model");
  assert.ok(serverErr instanceof ModelUnavailableError);
});
