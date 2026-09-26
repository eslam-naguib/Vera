import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const BLOCKED_CREDENTIAL_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.key$/i,
  /\.pem$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /credentials(\.json)?$/i,
  /secrets?\.json$/i,
  /^\.git$/i,
];

/**
 * Validates provider base URL against SSRF attacks.
 * Rejects private IPs, loopback, link-local, and cloud metadata endpoints.
 */
export function validateProviderUrl(urlStr, options = {}) {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, reason: "Provider URL is required." };
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: "Malformed URL syntax." };
  }

  // Force HTTPS unless explicitly overridden or local provider
  const allowLocal = options.allowLocal === true;
  const allowHttp = process.env.SIGNOR_ALLOW_INSECURE_HTTP === "1" || allowLocal;
  if (parsed.protocol !== "https:" && (!allowHttp || parsed.protocol !== "http:")) {
    return { valid: false, reason: "Provider URL must use HTTPS protocol." };
  }

  const host = parsed.hostname.toLowerCase();

  // Loopback check
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.")) {
    if (!allowHttp && !allowLocal) {
      return { valid: false, reason: "Loopback addresses (localhost/127.0.0.1) are forbidden for provider URLs." };
    }
  }

  // Cloud metadata endpoint (AWS/GCP/Azure link-local: 169.254.169.254)
  if (host === "169.254.169.254" || host.startsWith("169.254.")) {
    return { valid: false, reason: "Cloud metadata link-local addresses (169.254.x.x) are forbidden." };
  }

  // Private IPv4 ranges
  const ipv4Parts = host.split(".").map(Number);
  if (ipv4Parts.length === 4 && !ipv4Parts.some(isNaN)) {
    const [b0, b1] = ipv4Parts;
    // 10.0.0.0/8
    if (b0 === 10) return { valid: false, reason: "Private network 10.0.0.0/8 is forbidden." };
    // 172.16.0.0/12 (172.16 to 172.31)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return { valid: false, reason: "Private network 172.16.0.0/12 is forbidden." };
    // 192.168.0.0/16
    if (b0 === 192 && b1 === 168) return { valid: false, reason: "Private network 192.168.0.0/16 is forbidden." };
  }

  // Internal domain TLDs
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    return { valid: false, reason: "Internal or local domains (.local, .internal, .lan) are forbidden." };
  }

  return { valid: true, sanitizedUrl: parsed.origin + parsed.pathname.replace(/\/+$/, "") };
}

/**
 * Validates that requested path stays within project root, resolving symlinks/junctions
 * via realpath to prevent symlink traversal escape.
 */
export function resolveSafePath(requestedPath, projectDir = process.cwd()) {
  if (!requestedPath || typeof requestedPath !== "string") {
    throw new Error("Invalid path parameter: path must be a non-empty string.");
  }

  const cleanProjectDir = path.resolve(projectDir);
  let realProjectDir = cleanProjectDir;
  try {
    realProjectDir = fs.realpathSync(cleanProjectDir);
  } catch {}

  const candidate = path.resolve(cleanProjectDir, requestedPath);

  // Check if candidate escapes project root textually
  const rel = path.relative(cleanProjectDir, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Security Violation: Path '${requestedPath}' escapes project root.`);
  }

  // Symlink escape check: If file or directory exists, verify its real canonical path
  if (fs.existsSync(candidate)) {
    try {
      const realCandidate = fs.realpathSync(candidate);
      const realRel = path.relative(realProjectDir, realCandidate);
      if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
        throw new Error(`Security Violation: Symlink '${requestedPath}' escapes project boundary to '${realCandidate}'.`);
      }
    } catch (err) {
      if (err.message.includes("Security Violation")) throw err;
    }
  }

  // Check for sensitive credential file patterns
  const basename = path.basename(candidate);
  for (const pattern of BLOCKED_CREDENTIAL_PATTERNS) {
    if (pattern.test(basename)) {
      throw new Error(`Security Violation: Access to sensitive file '${basename}' is blocked.`);
    }
  }

  return candidate;
}
