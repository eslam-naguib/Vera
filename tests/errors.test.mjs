import test from "node:test";
import assert from "node:assert";
import {
  SignorError,
  AuthenticationError,
  RateLimitError,
  ProviderTimeoutError,
  ModelUnavailableError,
  ConfigurationError
} from "../lib/errors.mjs";

test("errors: typed error status codes and codes", () => {
  const authErr = new AuthenticationError();
  assert.strictEqual(authErr.statusCode, 401);
  assert.strictEqual(authErr.code, "AUTHENTICATION_ERROR");

  const rateErr = new RateLimitError();
  assert.strictEqual(rateErr.statusCode, 429);
  assert.strictEqual(rateErr.code, "RATE_LIMIT_ERROR");

  const timeoutErr = new ProviderTimeoutError();
  assert.strictEqual(timeoutErr.statusCode, 504);
  assert.strictEqual(timeoutErr.code, "PROVIDER_TIMEOUT");

  const modelErr = new ModelUnavailableError("gpt-6-astra", 503);
  assert.strictEqual(modelErr.statusCode, 503);
  assert.strictEqual(modelErr.modelId, "gpt-6-astra");
  assert.strictEqual(modelErr.code, "MODEL_UNAVAILABLE");
});
