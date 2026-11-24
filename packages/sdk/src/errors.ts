/** Everything this SDK throws extends BriesaError, so one `instanceof` catches it all. */
export class BriesaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BriesaError";
  }
}

export interface ApiErrorBody { type: string; code: string; message: string; request_id?: string }

/** The API answered with an error. `code` is the stable, machine-readable reason; `requestId` is what to quote to support. */
export class APIError extends BriesaError {
  readonly status: number;
  /** `invalid_request_error`, `authentication_error`, `permission_error`, `not_found_error`, `idempotency_error`, `rate_limit_error` or `api_error`. */
  readonly type: string;
  readonly code: string;
  readonly requestId: string | null;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "APIError";
    this.status = status;
    this.type = body.type;
    this.code = body.code;
    this.requestId = body.request_id ?? null;
  }
}
export class InvalidRequestError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "InvalidRequestError"; } }
export class AuthenticationError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "AuthenticationError"; } }
/** 403: the key lacks a scope or a pack, or (for a publishable key) the origin or route is not allowed. */
export class PermissionError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "PermissionError"; } }
/** 402 `subscription_required`: live keys need an active subscription. */
export class SubscriptionRequiredError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "SubscriptionRequiredError"; } }
export class NotFoundError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "NotFoundError"; } }
/** 409: the Idempotency-Key was reused with a different request (`idempotency_key_reused`) or is still running (`request_in_progress`). */
export class IdempotencyError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "IdempotencyError"; } }
/** 429: `rate_limited` (retry after `retryAfterSeconds`) or `monthly_cap_reached` (raise the key's cap). */
export class RateLimitError extends APIError {
  readonly retryAfterSeconds: number | null;
  constructor(s: number, b: ApiErrorBody, retryAfterSeconds: number | null) { super(s, b); this.name = "RateLimitError"; this.retryAfterSeconds = retryAfterSeconds; }
}
export class InternalServerError extends APIError { constructor(s: number, b: ApiErrorBody) { super(s, b); this.name = "InternalServerError"; } }

/** No usable response arrived: DNS, TLS, connection reset, offline. */
export class ConnectionError extends BriesaError {
  constructor(message = "Could not reach the Briesa API.", options?: { cause?: unknown }) { super(message, options); this.name = "ConnectionError"; }
}
export class TimeoutError extends ConnectionError {
  constructor(timeoutMs: number) { super(`The request timed out after ${timeoutMs} ms.`); this.name = "TimeoutError"; }
}
/** The caller's own AbortSignal fired. */
export class AbortedError extends BriesaError {
  constructor() { super("The request was aborted."); this.name = "AbortedError"; }
}

/** Maps an HTTP error to the most specific error class. Bodies that are not the API's error format (a proxy's HTML page) still produce an APIError. */
export function makeApiError(status: number, data: unknown, retryAfterSeconds: number | null): APIError {
  const e = (data && typeof data === "object" ? (data as { error?: Partial<ApiErrorBody> }).error : undefined) ?? {};
  const body: ApiErrorBody = {
    type: typeof e.type === "string" ? e.type : "api_error",
    code: typeof e.code === "string" ? e.code : `http_${status}`,
    message: typeof e.message === "string" ? e.message : `Request failed with status ${status}.`,
    request_id: typeof e.request_id === "string" ? e.request_id : undefined,
  };
  if (status === 400) return new InvalidRequestError(status, body);
  if (status === 401) return new AuthenticationError(status, body);
  if (status === 402) return new SubscriptionRequiredError(status, body);
  if (status === 403) return new PermissionError(status, body);
  if (status === 404) return new NotFoundError(status, body);
  if (status === 409) return new IdempotencyError(status, body);
  if (status === 429) return new RateLimitError(status, body, retryAfterSeconds);
  if (status >= 500) return new InternalServerError(status, body);
  return new APIError(status, body);
}
