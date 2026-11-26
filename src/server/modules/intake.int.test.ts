import { describe, expect, it } from "vitest"
import { createBranch } from "@/server/modules/branches"
import { createLocation } from "@/server/modules/locations"
import {
  getPublicTicket,
  listTicketActivities,
  listTickets,
  submitFeedback,
  ticketStats,
} from "@/server/modules/intake"
import { createQrCode, resolvePublicQr, revokeQrCode } from "@/server/modules/qr-codes"
import { resolveAccess } from "@/server/rbac/ability"
import { testContext, setupTestDb } from "@/test/db"
import { errorCode, orgWithRoom } from "@/test/fixtures"

setupTestDb()

const year = new Date().getUTCFullYear()
const noLimits = { ip: "203.0.113.7", limits: null }

async function scenario(industry: "hotel" | "hospital" = "hotel") {
  const org = await orgWithRoom({ industry })
  const qr = await createQrCode(org.ctx, org.room._id)
  const pub = (await resolvePublicQr(qr.shortCode))!
  const cat = (key: string) => pub.categories.find((c) => c.key === key)!.id
  return { ...org, qr, pub, cat }
}

const form = (categoryId: string, extra: Record<string, unknown> = {}) => ({
  categoryId,
  rating: "2",
  description: "Floor is wet near the sinks",
  urgency: "normal",
  consent: "on",
  ...extra,
})

describe("submitFeedback()", () => {
  it("creates a numbered ticket for the QR's location", async () => {
    const { ctx, qr, cat } = await scenario()
    const res = await submitFeedback(qr.shortCode, form(cat("housekeeping")), noLimits)
    expect(res.duplicate).toBe(false)
    expect(res.number).toBe(`TKT-${year}-000001`)
    expect(res.trackingToken.length).toBeGreaterThanOrEqual(40)

    const { items } = await listTickets(ctx)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      number: `TKT-${year}-000001`,
      status: "new",
      source: "qr",
      categoryName: "Housekeeping",
      locationPath: ["Floor 2", "Washroom F2"],
      rating: 2,
      reportCount: 1,
    })
  })

  it("numbers tickets per tenant", async () => {
    const a = await scenario()
    const b = await scenario()
    await submitFeedback(a.qr.shortCode, form(a.cat("housekeeping")), noLimits)
    const second = await submitFeedback(a.qr.shortCode, form(a.cat("maintenance")), noLimits)
    const otherTenant = await submitFeedback(b.qr.shortCode, form(b.cat("housekeeping")), noLimits)
    expect(second.number).toBe(`TKT-${year}-000002`)
    expect(otherTenant.number).toBe(`TKT-${year}-000001`)
  })

  it("merges a repeat report into the open ticket instead of opening another", async () => {
    const { ctx, qr, cat } = await scenario()
    const first = await submitFeedback(qr.shortCode, form(cat("housekeeping")), noLimits)
    const again = await submitFeedback(
      qr.shortCode,
      form(cat("housekeeping"), { rating: "1" }),
      noLimits,
    )
    expect(again.duplicate).toBe(true)
    expect(again.number).toBe(first.number)
    const { items } = await listTickets(ctx)
    expect(items).toHaveLength(1)
    expect(items[0].reportCount).toBe(2)
    // Each reporter keeps their own tracking link.
    expect((await getPublicTicket(again.trackingToken))?.number).toBe(first.number)
    expect((await getPublicTicket(first.trackingToken))?.number).toBe(first.number)
    const kinds = (await listTicketActivities(ctx, items[0]._id)).map((a) => a.type)
    expect(kinds).toEqual(["ticket.created", "report.added"])
  })

  it("sets severity from the category and the urgency flag", async () => {
    const { ctx, qr, cat } = await scenario("hospital")
    await submitFeedback(qr.shortCode, form(cat("waiting_time")), noLimits)
    await submitFeedback(qr.shortCode, form(cat("cleanliness"), { urgency: "urgent" }), noLimits)
    await submitFeedback(qr.shortCode, form(cat("safety")), noLimits)
    const sev = Object.fromEntries(
      (await listTickets(ctx)).items.map((t) => [t.categoryName, t.severity]),
    )
    expect(sev).toMatchObject({
      "Waiting time": "low",
      Cleanliness: "high",
      "Safety concern": "high",
    })
  })

  it("keeps contact details optional, and private", async () => {
    const { ctx, qr, cat } = await scenario()
    const res = await submitFeedback(
      qr.shortCode,
      form(cat("housekeeping"), {
        name: "Ravi",
        email: "ravi@guest.test",
        phone: "+91 98765 43210",
      }),
      noLimits,
    )
    const [ticket] = (await listTickets(ctx)).items
    expect(ticket.reporter).toMatchObject({
      anonymous: false,
      name: "Ravi",
      email: "ravi@guest.test",
    })
    const pub = await getPublicTicket(res.trackingToken)
    expect(JSON.stringify(pub)).not.toContain("ravi@guest.test")
    expect(pub).toMatchObject({
      status: "new",
      locationName: "Washroom F2",
      categoryName: "Housekeeping",
    })
  })

  it("validates input field by field", async () => {
    const { qr, cat } = await scenario()
    const err = await submitFeedback(
      qr.shortCode,
      { categoryId: "nope", rating: "9", email: "not-an-email", urgency: "normal" },
      noLimits,
    ).catch((e) => e)
    expect(err.code).toBe("VALIDATION")
    expect(Object.keys(err.details).sort()).toEqual(["categoryId", "consent", "email", "rating"])

    const empty = await submitFeedback(
      qr.shortCode,
      { categoryId: cat("housekeeping"), urgency: "normal", consent: "on" },
      noLimits,
    ).catch((e) => e)
    expect(empty.code).toBe("VALIDATION")
    expect(Object.keys(empty.details)).toEqual(["description"])
  })

  // BUG-003: a blank submit said "Invalid input: expected string" instead of asking for a category.
  it("asks for a category in plain words when none is picked", async () => {
    const { qr } = await scenario()
    const err = await submitFeedback(qr.shortCode, { urgency: "normal" }, noLimits).catch((e) => e)
    expect(err.details.categoryId).toEqual(["Choose what the issue is about"])
    expect(err.details.consent).toEqual(["Please confirm before sending"])
  })

  it("rejects unknown and revoked codes", async () => {
    const { ctx, qr, cat } = await scenario()
    expect(await errorCode(submitFeedback("zzzzzzzzzz", form(cat("other")), noLimits))).toBe(
      "NOT_FOUND",
    )
    await revokeQrCode(ctx, qr._id)
    expect(await errorCode(submitFeedback(qr.shortCode, form(cat("other")), noLimits))).toBe(
      "NOT_FOUND",
    )
  })

  it("rate-limits per IP and per code", async () => {
    const { qr, cat } = await scenario()
    const limits = { perIp: 2, perQr: 100, windowMs: 60_000 }
    const opts = { ip: "198.51.100.1", limits }
    await submitFeedback(qr.shortCode, form(cat("housekeeping")), opts)
    await submitFeedback(qr.shortCode, form(cat("maintenance")), opts)
    expect(await errorCode(submitFeedback(qr.shortCode, form(cat("other")), opts))).toBe(
      "RATE_LIMITED",
    )
    // A different visitor is unaffected.
    const other = await submitFeedback(qr.shortCode, form(cat("other")), {
      ip: "198.51.100.2",
      limits,
    })
    expect(other.number).toMatch(/^TKT-/)
  })

  it("rejects a failed bot check when Turnstile is configured", async () => {
    const { qr, cat } = await scenario()
    const res = submitFeedback(qr.shortCode, form(cat("other")), {
      ...noLimits,
      turnstile: { secret: "configured", token: null },
    })
    expect(await errorCode(res)).toBe("FORBIDDEN")
  })
})

describe("tracking and admin views", () => {
  it("returns null for an unknown tracking token", async () => {
    expect(await getPublicTicket("not-a-real-token")).toBeNull()
  })

  it("shows branch-scoped staff only their branches' tickets", async () => {
    const { ctx, tenant, branch, qr, cat } = await scenario()
    const other = await createBranch(ctx, { name: "Mumbai", timezone: "Asia/Kolkata" })
    const lobby = await createLocation(ctx, {
      branchId: other._id,
      type: "location",
      name: "Lobby",
    })
    const otherQr = await createQrCode(ctx, lobby._id)
    const otherPub = (await resolvePublicQr(otherQr.shortCode))!
    await submitFeedback(qr.shortCode, form(cat("housekeeping")), noLimits)
    await submitFeedback(otherQr.shortCode, form(otherPub.categories[0].id), noLimits)

    const staff = testContext({
      tenantId: tenant._id,
      ...resolveAccess({ roles: ["l1_staff"], branchIds: [branch._id] }, []),
    })
    expect((await listTickets(staff)).items.map((t) => t.locationPath.at(-1))).toEqual([
      "Washroom F2",
    ])
    expect((await listTickets(ctx)).items).toHaveLength(2)
  })

  it("summarises open tickets and average rating", async () => {
    const { ctx, qr, cat } = await scenario()
    await submitFeedback(qr.shortCode, form(cat("housekeeping"), { rating: "2" }), noLimits)
    await submitFeedback(qr.shortCode, form(cat("maintenance"), { rating: "4" }), noLimits)
    expect(await ticketStats(ctx)).toEqual({ open: 2, avgRating: 3, last24h: 2 })
  })

  it("needs ticket:read to list", async () => {
    const { tenant } = await scenario()
    const noRead = testContext({ tenantId: tenant._id, permissions: new Set(), branchScope: "all" })
    expect(await errorCode(listTickets(noRead))).toBe("FORBIDDEN")
  })
})
