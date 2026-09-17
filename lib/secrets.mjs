import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Resolves a secret based on a secret_ref or standard environment/file fallbacks.
 * Never logs or exposes raw secrets.
 */
export function resolveSecret(secretRef, projectDir = process.cwd()) {
  if (secretRef) {
    if (secretRef.startsWith("env:")) {
      const varName = secretRef.slice(4);
      return process.env[varName] || "";
    }
    if (secretRef.startsWith("file:")) {
      const sub = secretRef.slice(5);
      const candidates = [
        path.join(projectDir, ".signor", sub),
        path.join(projectDir, sub),
        path.join(os.homedir(), ".signor", sub),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            return fs.readFileSync(cand, "utf-8").trim();
          } catch {}
        }
      }
    }
  }

  // Fallbacks: Environment variables
  if (process.env.SIGNOR_API_KEY) return process.env.SIGNOR_API_KEY.trim();
  if (process.env.SOL_API_KEY) return process.env.SOL_API_KEY.trim();

  // Fallbacks: .signor/.key files
  const localKey = path.join(projectDir, ".signor", ".key");
  if (fs.existsSync(localKey)) {
    try {
      return fs.readFileSync(localKey, "utf-8").trim();
    } catch {}
  }

  const globalKey = path.join(os.homedir(), ".signor", ".key");
  if (fs.existsSync(globalKey)) {
    try {
      return fs.readFileSync(globalKey, "utf-8").trim();
    } catch {}
  }

  return "";
}

/**
 * Safely writes an API key to a protected .signor/.key file with 0o600 permissions.
 */
export function storeSecretKey(secretValue, projectDir = process.cwd()) {
  const signorDir = path.join(projectDir, ".signor");
  if (!fs.existsSync(signorDir)) {
    fs.mkdirSync(signorDir, { recursive: true });
  }
  const keyPath = path.join(signorDir, ".key");
  fs.writeFileSync(keyPath, secretValue.trim() + "\n", { mode: 0o600, encoding: "utf-8" });
  return "file:.key";
}

/**
 * Mask secret string for safe display and logging.
 */
export function maskSecret(val) {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.length <= 8) return "********";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Scans text for exposed API key tokens.
 */
export function containsLeakedKey(text) {
  if (typeof text !== "string") return false;
  return /sk-[a-zA-Z0-9_-]{24,}/.test(text);
}
