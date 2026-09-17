import zlib from "node:zlib";
import { recordHealthCheck } from "./db.mjs";

export const KNOWN_MODELS = [
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "Signor AI", tier: "flagship", description: "Lead System Architect & QA Auditor", default: true },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "Signor AI", tier: "flagship", description: "Deep Infrastructure & Scalability" },
  { id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI", tier: "speed", description: "High-Accuracy Balanced Logic" },
  { id: "gpt-5-codex", name: "GPT-5 Codex", provider: "OpenAI", tier: "code", description: "Specialized Code Synthesis & Refactoring" },
];

let healthCache = {};

export async function pingModel(modelId, config) {
  const base = config.base_url.replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  const body = JSON.stringify({
    model: modelId,
    messages: [
      { role: "user", content: "hi" }
    ],
    max_tokens: 5,
    temperature: 0.1,
    stream: false
  });

  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.api_key}`,
        "Accept-Encoding": "identity",
      },
      body,
      signal: AbortSignal.timeout(35000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const result = {
        model: modelId,
        status: latencyMs > 8000 ? "slow" : "live",
        latencyMs,
        lastChecked: new Date().toISOString(),
        error: null,
      };
      healthCache[modelId] = result;
      try { recordHealthCheck(modelId, result.status, latencyMs, 200); } catch {}
      return result;
    }

    let errCode = "error";
    let errMsg = `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      errCode = "unauthorized";
      errMsg = "API Key Invalid or Expired";
    } else if (res.status === 404) {
      errCode = "not_found";
      errMsg = "Model not found on provider";
    } else if (res.status === 429) {
      errCode = "rate_limited";
      errMsg = "Rate limited";
    }

    const result = {
      model: modelId,
      status: errCode,
      latencyMs,
      lastChecked: new Date().toISOString(),
      error: errMsg,
    };
    healthCache[modelId] = result;
    try { recordHealthCheck(modelId, errCode, latencyMs, res.status); } catch {}
    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isTimeout = err.name === "TimeoutError" || err.message?.includes("timeout");
    const result = {
      model: modelId,
      status: isTimeout ? "timeout" : "down",
      latencyMs,
      lastChecked: new Date().toISOString(),
      error: err.message,
    };
    healthCache[modelId] = result;
    try { recordHealthCheck(modelId, result.status, latencyMs, 0); } catch {}
    return result;
  }
}

export async function fetchRemoteModels(config) {
  const base = config.base_url.replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.api_key}`,
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      if (rawList.length > 0) {
        return rawList.map(item => {
          const id = item.id || item.name;
          const known = KNOWN_MODELS.find(k => k.id === id);
          if (known) return { ...known, is_remote: true };
          return {
            id,
            name: item.name || id,
            provider: item.owned_by || "Signor Gateway",
            tier: "balanced",
            description: `Dynamic model discovered from ${config.base_url}`,
            is_remote: true,
          };
        });
      }
    }
  } catch {
    // Fallback when remote models endpoint is unreachable
  }

  // Return verified catalog with explicit is_fallback flag
  return KNOWN_MODELS.map(m => ({ ...m, is_fallback: true }));
}

/**
 * Checks all models with bounded concurrency to prevent flood.
 */
export async function checkAllModels(config, modelList = KNOWN_MODELS, concurrency = 3) {
  const results = [];
  for (let i = 0; i < modelList.length; i += concurrency) {
    const chunk = modelList.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(m => pingModel(m.id, config)));
    for (let j = 0; j < chunkResults.length; j++) {
      const r = chunkResults[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          model: chunk[j].id,
          status: "down",
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
          error: r.reason?.message || "Unknown error",
        });
      }
    }
  }
  return results;
}

export function getCachedHealth() {
  return healthCache;
}
