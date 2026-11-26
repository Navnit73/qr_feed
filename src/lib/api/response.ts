import {
  ApiError,
  STATUS_BY_CODE,
  type ApiErrorCode,
  type ApiFailure,
  type ApiSuccess,
  type FieldErrors,
  type PageMeta,
} from "@/lib/api/errors"

/** Success envelope: `{ ok: true, data, meta? }`. */
export function ok<T>(data: T, init: { status?: number; meta?: PageMeta } = {}): Response {
  const body: ApiSuccess<T> = init.meta ? { ok: true, data, meta: init.meta } : { ok: true, data }
  return Response.json(body, { status: init.status ?? 200 })
}

/** Failure envelope: `{ ok: false, error: { code, message, details? } }`. */
export function fail(code: ApiErrorCode, message: string, details?: FieldErrors): Response {
  const error: ApiFailure["error"] = details ? { code, message, details } : { code, message }
  return Response.json({ ok: false, error } satisfies ApiFailure, {
    status: STATUS_BY_CODE[code] || 500,
  })
}

export function pageMeta({
  total,
  page,
  pageSize,
}: {
  total: number
  page: number
  pageSize: number
}): PageMeta {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

type RouteContext = { params: Promise<Record<string, string | string[]>> }
type Handler = (req: Request, ctx: RouteContext) => Promise<Response>

/**
 * Wraps a route handler so every response uses the envelope. Throw `ApiError` for expected
 * failures. Anything else is logged and returned as a bare INTERNAL error, because raw
 * messages can carry connection strings or tenant data.
 */
export function withApi(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.details)
      console.error("[api]", req.method, new URL(req.url).pathname, err)
      return fail("INTERNAL", "Something went wrong. Please try again.")
    }
  }
}
