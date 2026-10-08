import test from "node:test";
import assert from "node:assert";
import { getProviderAdapter } from "../lib/providers/registry.mjs";
import { SignorError } from "../lib/errors.mjs";

test("no_mock_prod: blocks mock provider when NODE_ENV is production", () => {
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";

    assert.throws(
      () => getProviderAdapter("mock"),
      (err) => {
        assert.ok(err instanceof SignorError);
        assert.strictEqual(err.code, "PROD_MOCK_FORBIDDEN");
        assert.match(err.message, /Mock providers forbidden in production/);
        return true;
      }
    );

    assert.throws(
      () => getProviderAdapter("openai", { isMock: true }),
      (err) => {
        assert.ok(err instanceof SignorError);
        assert.strictEqual(err.code, "PROD_MOCK_FORBIDDEN");
        return true;
      }
    );
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});

test("no_mock_prod: permits legitimate production adapters", () => {
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const adapter = getProviderAdapter("signor");
    assert.strictEqual(adapter.providerId, "signor");
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});
