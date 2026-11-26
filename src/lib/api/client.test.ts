// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { apiFetch, unwrap } from "@/lib/api/client"
import { ApiError } from "@/lib/api/errors"

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl))
}

afterEach(() => vi.unstubAllGlobals())

describe("apiFetch()", () => {
  it("returns the success envelope", async () => {
    mockFetch(async () => Response.json({ ok: true, data: { id: 1 } }))
    expect(await apiFetch<{ id: number }>("/api/x")).toEqual({ ok: true, data: { id: 1 } })
  })

  it("returns the failure envelope from the server unchanged", async () => {
    const error = { code: "NOT_FOUND", message: "Gone" }
    mockFetch(async () => Response.json({ ok: false, error }, { status: 404 }))
    expect(await apiFetch("/api/x")).toEqual({ ok: false, error })
  })

  it("sends a JSON body with the right header", async () => {
    mockFetch(async () => Response.json({ ok: true, data: null }))
    await apiFetch("/api/x", { method: "POST", json: { name: "Lobby" } })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.body).toBe('{"name":"Lobby"}')
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json")
  })

  it("never throws on a network failure", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch")
    })
    const res = await apiFetch("/api/x")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe("NETWORK")
  })

  it("treats a non-JSON response as an internal error", async () => {
    mockFetch(async () => new Response("<html>502</html>", { status: 502 }))
    const res = await apiFetch("/api/x")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe("INTERNAL")
  })
})

describe("unwrap()", () => {
  it("returns data on success", () => {
    expect(unwrap({ ok: true, data: 5 })).toBe(5)
  })

  it("throws an ApiError on failure", () => {
    expect(() => unwrap({ ok: false, error: { code: "FORBIDDEN", message: "No" } })).toThrow(
      ApiError,
    )
  })
})
