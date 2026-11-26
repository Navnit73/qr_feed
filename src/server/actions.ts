import "server-only"
import { unstable_rethrow } from "next/navigation"
import { ApiError, type ApiResponse } from "@/lib/api/errors"

/** What every form action returns: the API envelope, or null before the first submit. */
export type ActionState<T = unknown> = ApiResponse<T> | null

/**
 * Wraps a server action body so it always returns the envelope: ApiError → its code and field
 * errors, anything else → a bare INTERNAL. redirect() and notFound() still work.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    unstable_rethrow(err)
    if (err instanceof ApiError) {
      return {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details && { details: err.details }),
        },
      }
    }
    console.error("[action]", err)
    return {
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    }
  }
}

/** FormData → plain object; repeated keys (checkbox groups) become arrays. */
export function formObject(form: FormData, arrays: string[] = []) {
  const out: Record<string, unknown> = {}
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$ACTION")) continue
    out[key] = arrays.includes(key) ? form.getAll(key) : form.get(key)
  }
  for (const key of arrays) out[key] ??= []
  return out
}
