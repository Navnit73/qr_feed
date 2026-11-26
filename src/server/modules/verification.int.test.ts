import { describe, expect, it } from "vitest"
import { resolveTenantContext } from "@/server/auth/context"
import { listCategories, updateCategory } from "@/server/modules/categories"
import { getPublicTicket, submitFeedback, submitRequesterFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import { sweepAutoClose } from "@/server/modules/sla"
import { updateTenantSettings } from "@/server/modules/tenants"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Phase 5 verification & closure workflow (F-5.1–F-5.4)", () => {
  it("enforces evidence, supports reopen + close, requester feedback, and N-day auto-close", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "admin-v", email: "admin@v.test", name: "Admin V" },
      {
        orgName: "Verify Hotel",
        industry: "hotel",
        branchName: "Jaipur",
        timezone: "Asia/Kolkata",
      },
    )
    const ctx = (await resolveTenantContext("admin-v", tenant._id))!
    const loc = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "Suite 1",
    })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "hotel")

    // Require resolution photo evidence on category 0
    await updateCategory(ctx, cats[0]._id, {
      label: cats[0].label,
      defaultSeverity: cats[0].defaultSeverity,
      requiresRCA: false,
      requiresResolutionEvidence: true,
      active: true,
    })

    const sub = await submitFeedback(
      qr.shortCode,
      { categoryId: cats[0]._id.toHexString(), description: "Broken lamp", consent: "on" },
      { ip: "127.0.0.1", limits: null },
    )
    const ticket = (await queryTickets(ctx, { q: sub.number })).items[0]

    await applyTicketTransition(ctx, ticket._id, { type: "accept" })
    await applyTicketTransition(ctx, ticket._id, { type: "start" })

    // F-5.1: submitting without evidence fails
    await expect(
      applyTicketTransition(ctx, ticket._id, { type: "submit", note: "Fixed lamp" }),
    ).rejects.toThrow(/photo/i)

    // Submitting with evidence succeeds
    await applyTicketTransition(ctx, ticket._id, {
      type: "submit",
      note: "Replaced lamp bulb and tested",
      resolutionAttachments: ["att-1"],
    })

    // F-5.2: verifier reopens with instructions -> increments reopenCount
    await applyTicketTransition(ctx, ticket._id, {
      type: "reopen",
      reason: "Shade is still loose",
    })
    const reopened = (await queryTickets(ctx, { q: sub.number })).items[0]
    expect(reopened.status).toBe("reopened")
    expect(reopened.reopenCount).toBe(1)

    // Resubmit & approve/close
    await applyTicketTransition(ctx, ticket._id, { type: "start" })
    await applyTicketTransition(ctx, ticket._id, {
      type: "submit",
      note: "Secured lamp shade",
    })
    await applyTicketTransition(ctx, ticket._id, {
      type: "verify_close",
      note: "Inspected & approved",
    })

    // F-5.3: requester submits post-closure feedback once
    await submitRequesterFeedback(sub.trackingToken, {
      resolved: true,
      rating: 5,
      comment: "Fast and friendly fix!",
    })
    const pub = await getPublicTicket(sub.trackingToken)
    expect(pub?.requesterFeedback).toMatchObject({
      resolved: true,
      rating: 5,
      comment: "Fast and friendly fix!",
    })
    // Second submission rejected
    await expect(
      submitRequesterFeedback(sub.trackingToken, { resolved: false, rating: 1 }),
    ).rejects.toThrow(/already/i)

    // F-5.4: auto-close after N days of pending_verification
    await updateTenantSettings(ctx, { autoCloseDays: 3 })
    const sub2 = await submitFeedback(
      qr.shortCode,
      { categoryId: cats[1]._id.toHexString(), description: "AC noisy", consent: "on" },
      { ip: "127.0.0.1", limits: null },
    )
    const t2 = (await queryTickets(ctx, { q: sub2.number })).items[0]
    await applyTicketTransition(ctx, t2._id, { type: "accept" })
    await applyTicketTransition(ctx, t2._id, { type: "submit", note: "Cleaned filter" })

    const future = new Date(Date.now() + 4 * 86_400_000)
    const closedCount = await sweepAutoClose(future)
    expect(closedCount).toBe(1)

    const afterAuto = (await queryTickets(ctx, { q: sub2.number })).items[0]
    expect(afterAuto.status).toBe("closed")
  })
})
