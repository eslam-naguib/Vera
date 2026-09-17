import test from "node:test";
import assert from "node:assert";
import { validateConfigSchema } from "../lib/schema.mjs";
import { ConfigurationError } from "../lib/errors.mjs";

test("validateConfigSchema: accepts valid full config", () => {
  const valid = {
    model: "gpt-5.6-sol",
    effort: "high",
    base_url: "https://api.code.signor.ai/v1",
    cockpit_port: 5050,
    max_retries: 3,
  };
  assert.strictEqual(validateConfigSchema(valid), true);
});

test("validateConfigSchema: rejects unknown property", () => {
  assert.throws(
    () => validateConfigSchema({ unknown_prop: "invalid" }),
    (err) => err instanceof ConfigurationError && err.message.includes("Unknown configuration property")
  );
});

test("validateConfigSchema: rejects invalid effort", () => {
  assert.throws(
    () => validateConfigSchema({ effort: "super_fast" }),
    (err) => err instanceof ConfigurationError && err.message.includes("Invalid effort")
  );
});

test("validateConfigSchema: rejects invalid base_url", () => {
  assert.throws(
    () => validateConfigSchema({ base_url: "ftp://invalid-url" }),
    (err) => err instanceof ConfigurationError && err.message.includes("base_url")
  );
});

test("validateConfigSchema: rejects out-of-range port", () => {
  assert.throws(
    () => validateConfigSchema({ cockpit_port: 80 }),
    (err) => err instanceof ConfigurationError && err.message.includes("cockpit_port")
  );
});
