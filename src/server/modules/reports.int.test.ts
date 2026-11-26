import { describe, expect, it } from "vitest"
import { resolveTenantContext } from "@/server/auth/context"
import { createBranch } from "@/server/modules/branches"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import {
  createSavedReport,
  exportReportCsv,
  getAnalyticsReport,
  getNotificationPreferences,
  listSavedReports,
  saveNotificationPreferences,
} from "@/server/modules/reports"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Phase 8 analytics, exports & notification preferences (F-8.1–F-8.4)", () => {
  it("computes analytics, branch comparison, heatmap, CSV exports, saved reports and user preferences", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "admin-rep", email: "admin@rep.test", name: "Admin Rep" },
      { orgName: "Chain Hotels", industry: "hotel", branchName: "Delhi", timezone: "Asia/Kolkata" },
    )
    const ctx = (await resolveTenantContext("admin-rep", tenant._id))!
    const b2 = await createBranch(ctx, { name: "Mumbai", timezone: "Asia/Kolkata" })

    const loc1 = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "Lobby",
    })
    const loc2 = await createLocation(ctx, { branchId: b2._id, type: "location", name: "Pool" })
    const qr1 = await createQrCode(ctx, loc1._id)
    const qr2 = await createQrCode(ctx, loc2._id)
    const cats = await listCategories(ctx, "hotel")

    const s1 = await submitFeedback(
      qr1.shortCode,
      {
        categoryId: cats[0]._id.toHexString(),
        description: 'Wet floor, "urgent"',
        rating: 2,
        consent: "on",
      },
      { ip: "127.0.0.1", limits: null },
    )
    await submitFeedback(
      qr2.shortCode,
      {
        categoryId: cats[1]._id.toHexString(),
        description: "Pool towel empty",
        rating: 4,
        consent: "on",
      },
      { ip: "127.0.0.1", limits: null },
    )

    // Close first ticket so MTTR is computed
    const t1 = (await queryTickets(ctx, { q: s1.number })).items[0]
    await applyTicketTransition(ctx, t1._id, { type: "accept" })
    await applyTicketTransition(ctx, t1._id, { type: "submit", note: "Dried floor" })
    await applyTicketTransition(ctx, t1._id, { type: "verify_close" })

    const report = await getAnalyticsReport(ctx, { rangeDays: 30 })
    expect(report.kpis.totalTickets).toBe(2)
    expect(report.kpis.closedTickets).toBe(1)
    expect(report.kpis.avgRating).toBe(3)
    expect(report.branchComparison).toHaveLength(2)
    expect(report.heatmap.length).toBeGreaterThanOrEqual(2)
    expect(report.byCategory.length).toBeGreaterThanOrEqual(2)

    // CSV export with proper quoting of quotes/commas
    const csv = await exportReportCsv(ctx, "tickets", 30)
    expect(csv).toContain(s1.number)
    expect(csv).toContain('""urgent""')

    // Saved reports
    await createSavedReport(ctx, {
      name: "Weekly Chain Executive",
      rangeDays: 7,
      schedule: "weekly",
      recipients: ["exec@chain.test"],
    })
    expect((await listSavedReports(ctx)).length).toBe(1)

    // Notification preferences
    await saveNotificationPreferences(ctx, {
      channels: { in_app: true, email: true, sms: false, whatsapp: false, push: false },
      events: { assigned: true, escalated: true, verification: true, capaDue: true, digest: true },
      digestMode: "daily",
      quietHours: { enabled: true, start: "22:00", end: "07:00", timezone: "Asia/Kolkata" },
    })
    const prefs = await getNotificationPreferences(ctx)
    expect(prefs.digestMode).toBe("daily")
    expect(prefs.quietHours?.enabled).toBe(true)
  })
})
