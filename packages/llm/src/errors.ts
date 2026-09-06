export interface LLMErrorDetails {
  provider?: string;
  model?: string;
  statusCode?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  rawError?: unknown;
  param?: string;
}

export class LLMError extends Error {
  public readonly code: string;
  public readonly provider?: string;
  public readonly model?: string;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;
  public readonly rawError?: unknown;

  constructor(message: string, code = 'LLM_ERROR', details: LLMErrorDetails = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.provider = details.provider;
    this.model = details.model;
    this.statusCode = details.statusCode;
    this.retryable = details.retryable ?? false;
    this.rawError = details.rawError;
  }
}

export class RateLimitError extends LLMError {
  public readonly retryAfterMs?: number;

  constructor(message: string, details: LLMErrorDetails = {}) {
    super(message, 'RATE_LIMIT_ERROR', {
      ...details,
      statusCode: details.statusCode || 429,
      retryable: true,
    });
    this.retryAfterMs = details.retryAfterMs;
  }
}

export class AuthError extends LLMError {
  constructor(message: string, details: LLMErrorDetails = {}) {
    super(message, 'AUTH_ERROR', {
      ...details,
      statusCode: details.statusCode || 401,
      retryable: false,
    });
  }
}

export class InvalidRequestError extends LLMError {
  public readonly param?: string;

  constructor(message: string, details: LLMErrorDetails = {}) {
    super(message, 'INVALID_REQUEST_ERROR', {
      ...details,
      statusCode: details.statusCode || 400,
      retryable: false,
    });
    this.param = details.param;
  }
}

export class ProviderTimeoutError extends LLMError {
  public readonly timeoutMs?: number;

  constructor(message: string, timeoutMs?: number, details: LLMErrorDetails = {}) {
    super(message, 'PROVIDER_TIMEOUT_ERROR', {
      ...details,
      statusCode: details.statusCode || 408,
      retryable: true,
    });
    this.timeoutMs = timeoutMs;
  }
}

export class ContextWindowExceededError extends LLMError {
  public readonly maxTokens?: number;
  public readonly requestedTokens?: number;

  constructor(
    message: string,
    options?: { maxTokens?: number; requestedTokens?: number } & LLMErrorDetails,
  ) {
    super(message, 'CONTEXT_WINDOW_EXCEEDED_ERROR', {
      ...options,
      statusCode: options?.statusCode || 400,
      retryable: false,
    });
    this.maxTokens = options?.maxTokens;
    this.requestedTokens = options?.requestedTokens;
  }
}

export class ProviderUnavailableError extends LLMError {
  constructor(message: string, details: LLMErrorDetails = {}) {
    super(message, 'PROVIDER_UNAVAILABLE_ERROR', {
      ...details,
      statusCode: details.statusCode || 503,
      retryable: true,
    });
  }
}

