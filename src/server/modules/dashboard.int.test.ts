import { describe, expect, it } from "vitest"
import { getDashboard } from "@/server/modules/dashboard"
import { submitFeedback } from "@/server/modules/intake"
import { createQrCode, resolvePublicQr } from "@/server/modules/qr-codes"
import { setupTestDb } from "@/test/db"
import { orgWithRoom } from "@/test/fixtures"

setupTestDb()

const noLimits = { ip: "203.0.113.7", limits: null }

describe("getDashboard()", () => {
  it("summarises the workspace for an org admin", async () => {
    const { ctx, room } = await orgWithRoom({ industry: "hotel" })
    const qr = await createQrCode(ctx, room._id)
    const pub = (await resolvePublicQr(qr.shortCode))!
    const cat = (key: string) => pub.categories.find((c) => c.key === key)!.id
    const report = (key: string, extra: Record<string, unknown> = {}) =>
      submitFeedback(
        qr.shortCode,
        { categoryId: cat(key), rating: "4", consent: "on", urgency: "normal", ...extra },
        noLimits,
      )
    await report("housekeeping")
    await report("housekeeping") // merges into the open ticket
    await report("maintenance", { rating: "2", urgency: "urgent" })

    const d = await getDashboard(ctx)

    expect(d.workspace).toMatchObject({
      branches: 1,
      locations: 2,
      qrCodes: 1,
      members: 1,
      plan: "trial",
    })
    expect(d.tickets).not.toBeNull()
    const t = d.tickets!
    expect(t.open).toBe(2)
    expect(t.highPriorityOpen).toBe(1)
    expect(t.newThisWeek).toBe(2)
    expect(t.avgRating).toBe(3)
    expect(t.trend).toHaveLength(14)
    expect(t.trend.at(-1)!.reports).toBe(2)
    expect(t.topLocations[0]).toEqual({ name: "Washroom F2", parent: "Floor 2", count: 3 })
    expect(t.recent).toHaveLength(2)
    expect(typeof t.recent[0].id).toBe("string")
  })

  it("leaves out what the viewer may not see", async () => {
    const { ctx } = await orgWithRoom()
    const d = await getDashboard({ ...ctx, permissions: new Set(["branch:read"]) })
    expect(d.tickets).toBeNull()
    expect(d.workspace.members).toBeNull()
    expect(d.workspace.qrCodes).toBeNull()
    expect(d.workspace.branches).toBe(1)
  })
})
