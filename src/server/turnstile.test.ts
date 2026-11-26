// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { verifyTurnstile } from "@/server/turnstile"

afterEach(() => vi.unstubAllGlobals())

describe("verifyTurnstile()", () => {
  it("passes when no secret is configured (local dev, tests)", async () => {
    expect(await verifyTurnstile({ secret: undefined, token: null, ip: "1.1.1.1" })).toBe(true)
  })

  it("fails without a token when a secret is configured", async () => {
    expect(await verifyTurnstile({ secret: "s", token: null, ip: "1.1.1.1" })).toBe(false)
  })

  it("asks Cloudflare and trusts its answer", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await verifyTurnstile({ secret: "s", token: "t", ip: "1.1.1.1" })).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("challenges.cloudflare.com")
    expect(String(init.body)).toContain("response=t")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: false })),
    )
    expect(await verifyTurnstile({ secret: "s", token: "t", ip: "1.1.1.1" })).toBe(false)
  })

  it("fails closed if Cloudflare is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network")
      }),
    )
    expect(await verifyTurnstile({ secret: "s", token: "t", ip: "1.1.1.1" })).toBe(false)
  })
})
