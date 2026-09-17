export class SignorError extends Error {
  constructor(message, code = "SIGNOR_ERROR", statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends SignorError {
  constructor(message = "Authentication failed. Please verify your Signor API key.") {
    super(message, "AUTHENTICATION_ERROR", 401);
  }
}

export class RateLimitError extends SignorError {
  constructor(message = "Rate limit reached on AI Provider. Please retry shortly.", retryAfter = null) {
    super(message, "RATE_LIMIT_ERROR", 429);
    this.retryAfter = retryAfter;
  }
}

export class ProviderTimeoutError extends SignorError {
  constructor(message = "AI Provider request timed out.", timeoutMs = null) {
    super(message, "PROVIDER_TIMEOUT", 504);
    this.timeoutMs = timeoutMs;
  }
}

export class ModelUnavailableError extends SignorError {
  constructor(modelId, statusCode = 503) {
    super(`Model '${modelId}' is currently unavailable upstream (HTTP ${statusCode}).`, "MODEL_UNAVAILABLE", statusCode);
    this.modelId = modelId;
  }
}

export class ConfigurationError extends SignorError {
  constructor(message, invalidFields = []) {
    super(message, "CONFIG_ERROR", 400);
    this.invalidFields = invalidFields;
  }
}

export class SecurityError extends SignorError {
  constructor(message = "Security policy violation detected.") {
    super(message, "SECURITY_VIOLATION", 403);
  }
}

export class SandboxSecurityError extends SecurityError {
  constructor(message) {
    super(message);
    this.code = "SANDBOX_SECURITY_VIOLATION";
  }
}
