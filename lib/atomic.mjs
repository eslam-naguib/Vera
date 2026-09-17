import fs from "node:fs";
import path from "node:path";

/**
 * Thread/process safe atomic file writer using unique nonce and renameSync.
 */
export function atomicWriteFileSync(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const tmpFile = `${filePath}.${nonce}.tmp`;

  try {
    fs.writeFileSync(tmpFile, content, {
      encoding: options.encoding || "utf-8",
      mode: options.mode || 0o644,
    });

    // Atomic replace
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
    throw err;
  }
}

/**
 * Safely reads a file or returns fallback if it doesn't exist or is locked.
 */
export function safeReadFileSync(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return fallback;
  }
}
