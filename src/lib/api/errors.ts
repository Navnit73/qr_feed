/**
 * The one list of API error codes. Server handlers throw `ApiError`, the client reads `code`.
 * Keep it small: UI branches on these, so each must mean something the user can act on.
 */
export const STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  // Client-side only: the request never reached the server.
  NETWORK: 0,
} as const

export type ApiErrorCode = keyof typeof STATUS_BY_CODE

/** Field name → messages, e.g. `{ email: ["Enter a valid email"] }`. */
export type FieldErrors = Record<string, string[]>

export type PageMeta = { total: number; page: number; pageSize: number; totalPages: number }

export type ApiSuccess<T> = { ok: true; data: T; meta?: PageMeta }
export type ApiFailure = {
  ok: false
  error: { code: ApiErrorCode; message: string; details?: FieldErrors }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: FieldErrors

  constructor(code: ApiErrorCode, message: string, details?: FieldErrors) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}
