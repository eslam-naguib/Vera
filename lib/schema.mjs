import { ConfigurationError } from "./errors.mjs";
import { validateProviderUrl } from "./security.mjs";

const VALID_EFFORTS = ["low", "medium", "high", "ultra"];
const ALLOWED_CONFIG_KEYS = new Set([
  "provider_name",
  "provider_id",
  "base_url",
  "api_key",
  "secret_ref",
  "model",
  "effort",
  "cockpit_port",
  "max_retries",
  "enabled_models",
  "project_name"
]);

export function validateConfigSchema(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new ConfigurationError("Configuration must be a valid JSON object.");
  }

  const errors = [];

  // Check for unknown keys
  for (const key of Object.keys(config)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) {
      errors.push(`Unknown configuration property: '${key}'`);
    }
  }

  // Validate base_url via SSRF protection
  if (config.base_url !== undefined && config.base_url !== null) {
    const urlCheck = validateProviderUrl(config.base_url);
    if (!urlCheck.valid) {
      errors.push(`base_url validation failed: ${urlCheck.reason}`);
    }
  }

  // Validate secret_ref
  if (config.secret_ref !== undefined && config.secret_ref !== null) {
    if (typeof config.secret_ref !== "string" || (!config.secret_ref.startsWith("env:") && !config.secret_ref.startsWith("file:"))) {
      errors.push("secret_ref must be a string formatted as 'env:VARIABLE_NAME' or 'file:PATH'");
    }
  }

  // Validate effort
  if (config.effort !== undefined && config.effort !== null) {
    if (!VALID_EFFORTS.includes(config.effort)) {
      errors.push(`Invalid effort '${config.effort}'. Must be one of: ${VALID_EFFORTS.join(", ")}`);
    }
  }

  // Validate cockpit_port
  if (config.cockpit_port !== undefined && config.cockpit_port !== null) {
    const port = Number(config.cockpit_port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      errors.push("cockpit_port must be an integer between 1024 and 65535");
    }
  }

  // Validate max_retries
  if (config.max_retries !== undefined && config.max_retries !== null) {
    const retries = Number(config.max_retries);
    if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
      errors.push("max_retries must be an integer between 0 and 10");
    }
  }

  // Validate model
  if (config.model !== undefined && config.model !== null) {
    if (typeof config.model !== "string" || config.model.trim() === "") {
      errors.push("model must be a non-empty string identifier");
    }
  }

  // Validate enabled_models
  if (config.enabled_models !== undefined && config.enabled_models !== null) {
    if (!Array.isArray(config.enabled_models)) {
      errors.push("enabled_models must be an array of model ID strings");
    }
  }

  if (errors.length > 0) {
    throw new ConfigurationError(`Configuration Validation Failed:\n- ${errors.join("\n- ")}`, errors);
  }

  return true;
}
