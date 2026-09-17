import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { validateConfigSchema } from "./schema.mjs";
import { resolveSecret, storeSecretKey, maskSecret } from "./secrets.mjs";
import { atomicWriteFileSync } from "./atomic.mjs";

export const EFFORT_MAP = {
  low: { temperature: 0.3, max_tokens: 1500, timeout: 60000, label: "Low (Fast & Concise)" },
  medium: { temperature: 0.2, max_tokens: 3000, timeout: 180000, label: "Medium (Balanced)" },
  high: { temperature: 0.15, max_tokens: 5000, timeout: 420000, label: "High (Deep Architecture)" },
  ultra: { temperature: 0.1, max_tokens: 8000, timeout: 600000, label: "Ultra (Maximum Rigor & Scope)" },
};

export const DEFAULTS = {
  provider_name: "Signor AI",
  provider_id: "signor",
  base_url: "https://api.code.signor.ai/v1",
  api_key: "",
  model: "gpt-5.6-sol",
  effort: "high",
  cockpit_port: 5050,
  max_retries: 3,
};

export function getGlobalConfigDir() {
  const home = os.homedir();
  return path.join(home, ".signor");
}

export function getGlobalConfigFile() {
  return path.join(getGlobalConfigDir(), "config.json");
}

export function getLocalConfigFile(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (true) {
    const candidate = path.join(curr, ".signor", "config.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
}

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [k, ...rest] = trimmed.split("=");
    env[k.trim()] = rest.join("=").trim();
  }
  const mapped = {};
  if (env.SOL_BASE_URL) mapped.base_url = env.SOL_BASE_URL;
  if (env.SOL_API_KEY) mapped.api_key = env.SOL_API_KEY;
  if (env.SOL_MODEL) mapped.model = env.SOL_MODEL;
  if (env.SOL_PROVIDER_NAME) mapped.provider_name = env.SOL_PROVIDER_NAME;
  if (env.SOL_PROVIDER_ID) mapped.provider_id = env.SOL_PROVIDER_ID;
  if (env.SOL_EFFORT) mapped.effort = env.SOL_EFFORT;
  return mapped;
}

export function loadLegacyEnv(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (true) {
    const p1 = path.join(curr, "sol", ".env.sol");
    if (fs.existsSync(p1)) return parseEnvFile(p1);
    const p2 = path.join(curr, ".env.sol");
    if (fs.existsSync(p2)) return parseEnvFile(p2);
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return {};
}

export function loadConfig(cliOverrides = {}, startDir = process.cwd()) {
  // 0. Hardcoded safe defaults
  const resolved = { ...DEFAULTS };

  // 1. Legacy .env.sol
  const legacyEnv = loadLegacyEnv(startDir);
  Object.assign(resolved, legacyEnv);

  // 2. Global user config (~/.signor/config.json)
  const globalPath = getGlobalConfigFile();
  if (fs.existsSync(globalPath)) {
    try {
      const gData = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
      Object.assign(resolved, gData);
    } catch {
      // ignore invalid json
    }
  }

  // 3. Local project config (.signor/config.json)
  const localPath = getLocalConfigFile(startDir);
  if (localPath && fs.existsSync(localPath)) {
    try {
      const lData = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      Object.assign(resolved, lData);
    } catch {
      // ignore invalid json
    }
  }

  // 4. CLI overrides
  for (const [k, v] of Object.entries(cliOverrides)) {
    if (v !== undefined && v !== null && v !== "") {
      resolved[k] = v;
    }
  }

  // Resolve secret from SecretStore if api_key is empty
  if (!resolved.api_key) {
    resolved.api_key = resolveSecret(resolved.secret_ref, startDir);
  }

  // Normalize effort
  if (!EFFORT_MAP[resolved.effort]) {
    resolved.effort = "high";
  }

  return resolved;
}

export function saveGlobalConfig(updates) {
  try {
    validateConfigSchema(updates);
    const dir = getGlobalConfigDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = getGlobalConfigFile();
    let current = {};
    if (fs.existsSync(filePath)) {
      try {
        current = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {}
    }
    const toSave = { ...updates };
    if (toSave.api_key) {
      toSave.secret_ref = "env:SIGNOR_API_KEY";
      delete toSave.api_key;
    }
    const merged = { ...current, ...toSave };
    delete merged.api_key;
    atomicWriteFileSync(filePath, JSON.stringify(merged, null, 2));
    return { success: true, path: filePath, config: merged };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function saveLocalConfig(updates, projectDir = process.cwd()) {
  try {
    validateConfigSchema(updates);
    const dir = path.join(path.resolve(projectDir), ".signor");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, "config.json");
    let current = {};
    if (fs.existsSync(filePath)) {
      try {
        current = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {}
    }
    const toSave = { ...updates };
    if (toSave.api_key) {
      storeSecretKey(toSave.api_key, projectDir);
      toSave.secret_ref = "file:.key";
      delete toSave.api_key;
    }
    const merged = { ...current, ...toSave };
    delete merged.api_key;
    atomicWriteFileSync(filePath, JSON.stringify(merged, null, 2));
    return { success: true, path: filePath, config: merged };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function maskConfig(config) {
  if (!config) return {};
  const safe = { ...config };
  if (safe.api_key) {
    safe.api_key_masked = maskSecret(safe.api_key);
    delete safe.api_key;
  } else {
    safe.api_key_masked = "(غير معين)";
  }
  return safe;
}
