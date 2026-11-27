import { describe, expect, it } from "vitest"
import { resolveTenantContext } from "@/server/auth/context"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { listNotifications } from "@/server/modules/notifications"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import { createSlaPolicy, listEscalationEvents, sweepSlaEscalations } from "@/server/modules/sla"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { members } from "@/server/repositories"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("SLA & escalation engine (F-4.1–F-4.7 / T-SLA-2)", () => {
  it("attaches policy, warns at 80%, escalates L1 -> L2 -> L3 idempotently, and pauses on hold", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "admin-sla", email: "admin@sla.test", name: "Admin" },
      {
        orgName: "SLA Hospital",
        industry: "hospital",
        branchName: "Pune",
        timezone: "Asia/Kolkata",
      },
    )
    const ctx = (await resolveTenantContext("admin-sla", tenant._id))!

    await members.forTenant(ctx).insertOne({
      userId: "u-l1",
      email: "l1@sla.test",
      name: "L1 Staff",
      roles: ["l1_staff"],
      branchIds: [branch._id],
      status: "active",
    })
    await members.forTenant(ctx).insertOne({
      userId: "u-l2",
      email: "l2@sla.test",
      name: "L2 Supervisor",
      roles: ["l2_supervisor"],
      branchIds: [branch._id],
      status: "active",
    })
    await members.forTenant(ctx).insertOne({
      userId: "u-l3",
      email: "l3@sla.test",
      name: "L3 Manager",
      roles: ["l3_manager"],
      branchIds: [branch._id],
      status: "active",
    })

    const l2Ctx = (await resolveTenantContext("u-l2", tenant._id))!
    const l3Ctx = (await resolveTenantContext("u-l3", tenant._id))!

    const loc = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "ICU Ward 1",
    })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "hospital")

    await createSlaPolicy(ctx, {
      name: "Hospital Standard SLA",
      businessHoursMode: "24x7",
      appliesTo: {},
      levels: [
        {
          level: 1,
          acceptWithinMin: 15,
          resolveWithinMin: 180,
          escalateAfterMin: 180,
          targetRole: "l1_staff",
          action: "both",
        },
        {
          level: 2,
          acceptWithinMin: 30,
          resolveWithinMin: 300,
          escalateAfterMin: 300,
          targetRole: "l2_supervisor",
          action: "both",
        },
        {
          level: 3,
          acceptWithinMin: 60,
          resolveWithinMin: 480,
          escalateAfterMin: 480,
          targetRole: "l3_manager",
          action: "both",
        },
      ],
    })

    const sub = await submitFeedback(
      qr.shortCode,
      {
        categoryId: cats[0]._id.toHexString(),
        description: "Oxygen regulator loose",
        consent: "on",
      },
      { ip: "127.0.0.1", limits: null },
    )
    const ticket = (await queryTickets(ctx, { q: sub.number })).items[0]
    expect(ticket.sla).toBeTruthy()
    expect(ticket.currentLevel).toBe(1)

    // 1. At 85% elapsed (153 min after creation): pre-breach warning fires once
    const tWarn = new Date(ticket.createdAt.getTime() + 153 * 60_000)
    const warnRun = await sweepSlaEscalations(tWarn)
    expect(warnRun.warned).toBeGreaterThanOrEqual(1)

    // 2. Simulate worker restart / missed Redis job at 185 min: concurrent sweepers escalate L1 -> L2 ONCE!
    const tL2 = new Date(ticket.createdAt.getTime() + 185 * 60_000)
    const [rA, rB] = await Promise.all([sweepSlaEscalations(tL2), sweepSlaEscalations(tL2)])
    expect(rA.escalated + rB.escalated).toBe(1)

    const afterL2 = (await queryTickets(ctx, { q: sub.number })).items[0]
    expect(afterL2.currentLevel).toBe(2)
    expect(afterL2.sla?.breached).toBe(true)
    expect(afterL2.assignee?.userId).toBe("u-l2")
    expect((await listNotifications(l2Ctx)).length).toBeGreaterThanOrEqual(1)

    // 3. Put ticket on hold: sweeper at 310 min MUST NOT escalate to L3 while paused!
    await applyTicketTransition(ctx, afterL2._id, { type: "accept" })
    await applyTicketTransition(ctx, afterL2._id, { type: "hold", reason: "Waiting on vendor" })
    const tHold = new Date(ticket.createdAt.getTime() + 310 * 60_000)
    const holdSweep = await sweepSlaEscalations(tHold)
    expect(holdSweep.escalated).toBe(0)

    // 4. Resume and advance past L2->L3 threshold: escalates to L3 idempotently
    await applyTicketTransition(ctx, afterL2._id, { type: "resume" })
    const tL3 = new Date(Date.now() + 600 * 60_000)
    await sweepSlaEscalations(tL3)
    await sweepSlaEscalations(tL3) // second pass must be no-op

    const afterL3 = (await queryTickets(ctx, { q: sub.number })).items[0]
    expect(afterL3.currentLevel).toBe(3)
    expect(afterL3.assignee?.userId).toBe("u-l3")
    expect((await listNotifications(l3Ctx)).length).toBeGreaterThanOrEqual(1)

    const events = await listEscalationEvents(ctx, afterL3._id)
    expect(events.map((e) => `${e.fromLevel}->${e.toLevel}`)).toEqual(["1->2", "2->3"])
  })

  it("scopes manual SLA sweeps to the requested tenantId without affecting other tenants", async () => {
    const orgA = await createOrganization(
      { id: "admin-a", email: "a@sla.test", name: "Admin A" },
      { orgName: "Org A", industry: "hotel", branchName: "A1", timezone: "UTC" },
    )
    const orgB = await createOrganization(
      { id: "admin-b", email: "b@sla.test", name: "Admin B" },
      { orgName: "Org B", industry: "hotel", branchName: "B1", timezone: "UTC" },
    )
    const ctxA = (await resolveTenantContext("admin-a", orgA.tenant._id))!
    const ctxB = (await resolveTenantContext("admin-b", orgB.tenant._id))!

    for (const [ctx, branch] of [
      [ctxA, orgA.branch],
      [ctxB, orgB.branch],
    ] as const) {
      await createSlaPolicy(ctx, {
        name: "Fast SLA",
        businessHoursMode: "24x7",
        appliesTo: {},
        levels: [
          {
            level: 1,
            acceptWithinMin: 10,
            resolveWithinMin: 30,
            escalateAfterMin: 30,
            targetRole: "org_admin",
            action: "notify",
          },
          {
            level: 2,
            acceptWithinMin: 15,
            resolveWithinMin: 60,
            escalateAfterMin: 60,
            targetRole: "org_admin",
            action: "notify",
          },
          {
            level: 3,
            acceptWithinMin: 30,
            resolveWithinMin: 120,
            escalateAfterMin: 120,
            targetRole: "org_admin",
            action: "notify",
          },
        ],
      })
      const loc = await createLocation(ctx, {
        branchId: branch._id,
        type: "location",
        name: "Lobby",
      })
      const qr = await createQrCode(ctx, loc._id)
      const cats = await listCategories(ctx, "hotel")
      await submitFeedback(
        qr.shortCode,
        { categoryId: cats[0]._id.toHexString(), description: "Issue", consent: "on" },
        { ip: "127.0.0.1", limits: null },
      )
    }

    const future = new Date(Date.now() + 45 * 60_000)
    const res = await sweepSlaEscalations(future, { tenantId: orgA.tenant._id })
    expect(res.escalated).toBe(1)

    const ticketA = (await queryTickets(ctxA, {})).items[0]
    const ticketB = (await queryTickets(ctxB, {})).items[0]
    expect(ticketA.currentLevel).toBe(2)
    expect(ticketB.currentLevel).toBe(1)
  })
})
