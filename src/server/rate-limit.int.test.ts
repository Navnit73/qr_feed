import { describe, expect, it } from "vitest"
import { rateLimit } from "@/server/rate-limit"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("rateLimit()", () => {
  it("allows up to the limit in a window, then blocks", async () => {
    const key = "ip:1.2.3.4"
    const results = []
    for (let i = 0; i < 4; i++) results.push(await rateLimit({ key, limit: 3, windowMs: 60_000 }))
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false])
    expect(results[3].retryAfterSec).toBeGreaterThan(0)
  })

  it("counts keys separately", async () => {
    await rateLimit({ key: "a", limit: 1, windowMs: 60_000 })
    expect((await rateLimit({ key: "b", limit: 1, windowMs: 60_000 })).ok).toBe(true)
  })

  it("holds under concurrent bursts", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => rateLimit({ key: "burst", limit: 5, windowMs: 60_000 })),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(5)
  })
})
