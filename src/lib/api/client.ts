import { ApiError, type ApiResponse } from "@/lib/api/errors"

type ApiFetchInit = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit }

/**
 * Calls one of our API routes and always resolves to the envelope, never throws, so callers
 * handle failure with a plain `if (!res.ok)`. Use `unwrap()` when you would rather throw.
 */
export async function apiFetch<T>(
  input: string | URL,
  { json, headers, ...init }: ApiFetchInit = {},
): Promise<ApiResponse<T>> {
  const h = new Headers(headers)
  if (json !== undefined) h.set("content-type", "application/json")
  h.set("accept", "application/json")

  let res: Response
  try {
    res = await fetch(input, {
      ...init,
      headers: h,
      body: json !== undefined ? JSON.stringify(json) : init.body,
    })
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK", message: "You appear to be offline. Check your connection." },
    }
  }

  try {
    const body = (await res.json()) as ApiResponse<T>
    if (typeof body === "object" && body !== null && "ok" in body) return body
  } catch {
    // Fall through: proxies and crashes return HTML, not our envelope.
  }
  return {
    ok: false,
    error: { code: "INTERNAL", message: `Unexpected response from the server (${res.status}).` },
  }
}

export function unwrap<T>(res: ApiResponse<T>): T {
  if (res.ok) return res.data
  throw new ApiError(res.error.code, res.error.message, res.error.details)
}
