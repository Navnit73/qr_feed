import { describe, expect, it } from "vitest"
import { resolveTenantContext } from "@/server/auth/context"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import { queryTickets } from "@/server/modules/tickets"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Phase 10 public intake burst load test (F-10.3)", () => {
  it("handles a 20-request concurrent burst across categories with unique numbers and rate-limit protection", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "owner-load", email: "owner@load.test", name: "Load Owner" },
      { orgName: "Stadium Mall", industry: "mall", branchName: "Arena", timezone: "Asia/Kolkata" },
    )
    const ctx = (await resolveTenantContext("owner-load", tenant._id))!
    const cats = await listCategories(ctx, "mall")

    // Create 10 distinct locations with QR codes and fire 10 concurrent reports simultaneously
    const qrs: { shortCode: string }[] = []
    for (let i = 0; i < 10; i++) {
      const loc = await createLocation(ctx, {
        branchId: branch._id,
        type: "location",
        name: `Gate ${i + 1}`,
      })
      qrs.push(await createQrCode(ctx, loc._id))
    }

    const burst = await Promise.all(
      qrs.map((qr, i) =>
        submitFeedback(
          qr.shortCode,
          {
            categoryId: cats[i % cats.length]._id.toHexString(),
            description: `Burst report #${i + 1}`,
            rating: (i % 5) + 1,
            consent: "on",
          },
          { ip: `10.0.0.${i + 1}`, limits: { perIp: 10, perQr: 60, windowMs: 60_000 } },
        ),
      ),
    )

    const numbers = new Set(burst.map((b) => b.number))
    expect(numbers.size).toBe(10)
    expect((await queryTickets(ctx, { pageSize: 50 })).items).toHaveLength(10)

    // Verify per-IP rate limit blocks an abusive burst from a single IP
    const spamResults = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        submitFeedback(
          qrs[0].shortCode,
          {
            categoryId: cats[0]._id.toHexString(),
            description: `Spam #${i}`,
            consent: "on",
          },
          { ip: "198.51.100.77", limits: { perIp: 5, perQr: 60, windowMs: 60_000 } },
        ),
      ),
    )
    const okCount = spamResults.filter((r) => r.status === "fulfilled").length
    const rejectedCount = spamResults.filter((r) => r.status === "rejected").length
    expect(okCount).toBe(5)
    expect(rejectedCount).toBe(3)

    // High-concurrency distinct burst (50 concurrent pushes, dedupe disabled) yields 50 unique ticket numbers
    const highBurst = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        submitFeedback(
          qrs[i % qrs.length].shortCode,
          {
            categoryId: cats[i % cats.length]._id.toHexString(),
            description: `High concurrency distinct #${i + 1}`,
            rating: (i % 5) + 1,
            consent: "on",
          },
          { ip: `10.1.0.${i + 1}`, limits: null, dedupe: false },
        ),
      ),
    )
    expect(new Set(highBurst.map((b) => b.number)).size).toBe(50)
    expect(highBurst.every((b) => !b.duplicate)).toBe(true)
  })
})
