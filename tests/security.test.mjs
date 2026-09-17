import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import { resolveSafePath } from "../lib/security.mjs";
import { validateProviderUrl } from "../lib/security.mjs";
import { maskConfig } from "../lib/config.mjs";
import { resolveSecret, maskSecret, containsLeakedKey } from "../lib/secrets.mjs";

test("security: blocks path traversal escaping root", () => {
  const root = process.cwd();
  assert.throws(
    () => resolveSafePath("../../../etc/passwd", root),
    (err) => err.message.includes("escapes project root")
  );
});

test("security: blocks reading raw .env and secret files", () => {
  const root = process.cwd();
  assert.throws(
    () => resolveSafePath(".env", root),
    (err) => err.message.includes("blocked")
  );
  assert.throws(
    () => resolveSafePath(".env.local", root),
    (err) => err.message.includes("blocked")
  );
  assert.throws(
    () => resolveSafePath("private.key", root),
    (err) => err.message.includes("blocked")
  );
  assert.throws(
    () => resolveSafePath(".npmrc", root),
    (err) => err.message.includes("blocked")
  );
});

test("security: allows legitimate project files", () => {
  const root = process.cwd();
  const safe = resolveSafePath("package.json", root);
  assert.strictEqual(safe, path.resolve(root, "package.json"));
});

test("security: maskConfig removes raw api_key and masks properly", () => {
  const input = {
    api_key: "sk-mocktest1234567890abcdef9876",
    model: "gpt-5.6-sol"
  };
  const masked = maskConfig(input);
  assert.strictEqual(masked.api_key, undefined);
  assert.strictEqual(masked.api_key_masked, "sk-m...9876");
});

test("security: validateProviderUrl blocks SSRF, private IPs, and cloud metadata", () => {
  // Loopback
  assert.strictEqual(validateProviderUrl("http://localhost:8080").valid, false);
  assert.strictEqual(validateProviderUrl("http://127.0.0.1:5050").valid, false);

  // Cloud metadata endpoint
  assert.strictEqual(validateProviderUrl("http://169.254.169.254/latest/meta-data").valid, false);

  // Private IPv4 ranges
  assert.strictEqual(validateProviderUrl("https://10.0.0.1/v1").valid, false);
  assert.strictEqual(validateProviderUrl("https://172.20.0.1/v1").valid, false);
  assert.strictEqual(validateProviderUrl("https://192.168.1.1/v1").valid, false);

  // Internal TLD
  assert.strictEqual(validateProviderUrl("https://cluster.internal/v1").valid, false);

  // Plain HTTP without SSL
  assert.strictEqual(validateProviderUrl("http://api.external.com/v1").valid, false);

  // Legitimate HTTPS public API
  const valid = validateProviderUrl("https://api.code.signor.ai/v1");
  assert.strictEqual(valid.valid, true);
});

test("security: SecretStore and leak detection", () => {
  process.env.TEST_SECRET_VAR = "sk-mock-env-secret-key-1234";
  const resolved = resolveSecret("env:TEST_SECRET_VAR");
  assert.strictEqual(resolved, "sk-mock-env-secret-key-1234");
  delete process.env.TEST_SECRET_VAR;

  assert.strictEqual(maskSecret("sk-mock-env-secret-key-1234"), "sk-m...1234");
  assert.strictEqual(containsLeakedKey("Here is my secret sk-dummy1234567890abcdef9876543210fedcba"), true);
  assert.strictEqual(containsLeakedKey("No secrets here"), false);
});
