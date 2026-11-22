export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error"
  | "idempotency_error"
  | "api_error";

const STATUS: Record<ErrorType, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  permission_error: 403,
  not_found_error: 404,
  idempotency_error: 409,
  rate_limit_error: 429,
  api_error: 500,
};

export class ApiError extends Error {
  readonly type: ErrorType;
  readonly code: string;
  readonly status: number;
  constructor(type: ErrorType, code: string, message: string, status?: number) {
    super(message);
    this.type = type;
    this.code = code;
    this.status = status ?? STATUS[type];
  }
}

export const errorBody = (e: { type: string; code: string; message: string }, requestId: string) => ({
  error: { type: e.type, code: e.code, message: e.message, request_id: requestId },
});
