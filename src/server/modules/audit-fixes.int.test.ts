import { ObjectId } from "mongodb"
import { beforeAll, describe, expect, it, inject } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { resolveTenantContext } from "@/server/auth/context"
import { createAssignmentRule } from "@/server/modules/assignment"
import {
  completeAudit,
  createAuditTemplate,
  scheduleAudit,
  sweepRecurringAudits,
} from "@/server/modules/audits"
import { archiveBranch, createBranch, updateBranch } from "@/server/modules/branches"
import { listCategories } from "@/server/modules/categories"
import { getDashboard } from "@/server/modules/dashboard"
import { ensureDemoWorkspace } from "@/server/modules/demo"
import { getPublicTicket, submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { sweepDataRetention } from "@/server/modules/platform"
import { createQrCode } from "@/server/modules/qr-codes"
import {
  closeRca,
  createCapa,
  createRca,
  linkTicketToRca,
  signRcaApproval,
  updateCapaActionStatus,
  verifyCapaEffectiveness,
} from "@/server/modules/rca-capa"
import { createSavedReport, sweepScheduledReports } from "@/server/modules/reports"
import { sweepOverdueCapas } from "@/server/modules/sla"
import { setTenantLimits } from "@/server/modules/tenants"
import { createManualTicket, mergeTicket } from "@/server/modules/tickets"
import { attachments, capas, members, qrCodes, tickets } from "@/server/repositories"
import { sweepOrphanAttachments } from "@/server/storage"
import { setupTestDb } from "@/test/db"

setupTestDb()

beforeAll(() => {
  process.env.MONGODB_URI = inject("mongoUri")
  process.env.BETTER_AUTH_SECRET = "test-secret-for-audit-fixes-integration-suite-32chars"
  process.env.BETTER_AUTH_URL = "http://localhost:3000"
})

describe("Audit fixes, feature completions & background sweepers", () => {
  it("seeds the demo workspace idempotently without duplicating records", async () => {
    const first = await ensureDemoWorkspace()
    const second = await ensureDemoWorkspace()
    expect(second.tenantId).toBe(first.tenantId)

    const adminMember = (await members
      .unscoped()
      .findOne({ email: first.email, status: "active" }))!
    const ctx = (await resolveTenantContext(adminMember.userId, new ObjectId(first.tenantId)))!
    expect(ctx).not.toBeNull()
    const ticketCount = await tickets.forTenant(ctx).count({})
    expect(ticketCount).toBe(10)

    const dash = await getDashboard(ctx, { days: 30 })
    expect(dash.branches.length).toBe(2)
    expect(dash.tickets?.trend).toHaveLength(30)
    expect(dash.tickets?.open).toBeGreaterThan(0)
  })

  it("enforces monthlyTickets plan limit on public intake and manual tickets", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "lim-admin", email: "lim@test.io", name: "Limit Admin" },
      { orgName: "Limit Org", industry: "hotel", branchName: "Main", timezone: "UTC" },
    )
    const ctx = (await resolveTenantContext("lim-admin", tenant._id))!
    await setTenantLimits({
      actorId: "super-1",
      tenantId: tenant._id,
      plan: "trial",
      limits: { branches: 2, users: 5, locations: 20, monthlyTickets: 1 },
    })

    const loc = await createLocation(ctx, { branchId: branch._id, type: "location", name: "Lobby" })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "hotel")

    // First ticket succeeds
    await createManualTicket(ctx, {
      locationId: loc._id.toHexString(),
      categoryId: cats[0]._id.toHexString(),
      severity: "medium",
      description: "First ticket within limit",
    })

    // Second manual ticket blocked by monthlyTickets limit
    await expect(
      createManualTicket(ctx, {
        locationId: loc._id.toHexString(),
        categoryId: cats[1]._id.toHexString(),
        severity: "low",
        description: "Second ticket exceeds limit",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })

    // Public intake on another category also blocked
    await expect(
      submitFeedback(
        qr.shortCode,
        {
          categoryId: cats[1]._id.toHexString(),
          description: "Public ticket exceeds limit",
          consent: "on",
        },
        { ip: "10.0.0.1", limits: null },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("merges duplicate tickets, transfers tracking tokens, and links/closes RCA in stage order", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "m-admin", email: "m@test.io", name: "Merge Admin" },
      { orgName: "Merge Org", industry: "hospital", branchName: "Central", timezone: "UTC" },
    )
    const ctx = (await resolveTenantContext("m-admin", tenant._id))!
    const loc1 = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "OPD 1",
    })
    const loc2 = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "OPD 2",
    })
    const qr1 = await createQrCode(ctx, loc1._id)
    const qr2 = await createQrCode(ctx, loc2._id)
    const cats = await listCategories(ctx, "hospital")

    const t1 = await submitFeedback(
      qr1.shortCode,
      { categoryId: cats[0]._id.toHexString(), description: "Water leak A", consent: "on" },
      { ip: "10.0.0.2", limits: null },
    )
    const t2 = await submitFeedback(
      qr2.shortCode,
      { categoryId: cats[0]._id.toHexString(), description: "Water leak B", consent: "on" },
      { ip: "10.0.0.3", limits: null },
    )

    const t2Doc = (await tickets.forTenant(ctx).findOne({ number: t2.number }))!
    const merged = await mergeTicket(ctx, t2Doc._id, t1.number, "Same burst pipe")
    expect(merged.source.status).toBe("cancelled")
    expect(merged.source.duplicateOf).toBe(t1.number)

    // Reporter #2's original tracking token now resolves to target ticket t1
    const pub = await getPublicTicket(t2.trackingToken)
    expect(pub?.number).toBe(t1.number)
    expect(pub?.reportCount).toBe(2)

    // RCA linking, ordered approvals (Owner -> Reviewer -> Approver), CAPA verify, and Close
    const rca = await createRca(ctx, {
      title: "Pipe leak RCA",
      method: "5why",
      problemStatement: "Repeated pipe leaks in OPD corridor",
    })
    await linkTicketToRca(ctx, rca._id, t1.number)

    // Reviewer before owner is rejected
    await expect(
      signRcaApproval(ctx, rca._id, { stage: "reviewer", decision: "approved" }),
    ).rejects.toBeInstanceOf(ApiError)

    await signRcaApproval(ctx, rca._id, { stage: "owner", decision: "approved" })
    await signRcaApproval(ctx, rca._id, { stage: "reviewer", decision: "approved" })
    await signRcaApproval(ctx, rca._id, { stage: "approver", decision: "approved" })

    const capa = await createCapa(ctx, {
      rcaId: rca._id.toHexString(),
      title: "Replace valve",
      type: "corrective",
      actions: [
        {
          title: "Install brass valve",
          ownerId: "m-admin",
          dueDate: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ],
    })
    // Cannot close RCA before CAPA effectiveness is verified
    await expect(closeRca(ctx, rca._id)).rejects.toMatchObject({ code: "CONFLICT" })

    await updateCapaActionStatus(ctx, capa._id, capa.actions[0].id, "completed")
    await verifyCapaEffectiveness(ctx, capa._id, {
      recurred: false,
      result: "effective",
      evidence: "No leaks over inspection period",
    })
    const closed = await closeRca(ctx, rca._id)
    expect(closed.status).toBe("closed")
  })

  it("handles least_loaded + location subtree assignment, branch settings/archive, and all background sweepers", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "sw-admin", email: "sw@test.io", name: "Sweeper Admin" },
      { orgName: "Sweeper Org", industry: "clinic", branchName: "North", timezone: "Asia/Kolkata" },
    )
    const ctx = (await resolveTenantContext("sw-admin", tenant._id))!

    // Update branch business hours & holidays, add second branch, archive second branch
    await updateBranch(ctx, branch._id, {
      holidays: ["2026-01-26"],
      businessHours: {
        days: {
          "0": { enabled: false, start: "09:00", end: "18:00" },
          "1": { enabled: true, start: "08:00", end: "20:00" },
          "2": { enabled: true, start: "08:00", end: "20:00" },
          "3": { enabled: true, start: "08:00", end: "20:00" },
          "4": { enabled: true, start: "08:00", end: "20:00" },
          "5": { enabled: true, start: "08:00", end: "20:00" },
          "6": { enabled: true, start: "09:00", end: "14:00" },
        },
      },
    })
    const branch2 = await createBranch(ctx, { name: "South", timezone: "Asia/Kolkata" })
    const b2Loc = await createLocation(ctx, {
      branchId: branch2._id,
      type: "location",
      name: "Desk",
    })
    await createQrCode(ctx, b2Loc._id)
    await archiveBranch(ctx, branch2._id)
    expect(await qrCodes.forTenant(ctx).count({ branchId: branch2._id, status: "active" })).toBe(0)
    // Last active branch cannot be archived
    await expect(archiveBranch(ctx, branch._id)).rejects.toMatchObject({ code: "CONFLICT" })

    // Location subtree + least_loaded assignment inside transaction
    await members.forTenant(ctx).insertOne({
      userId: "tech-a",
      email: "a@sw.test",
      name: "Tech A",
      roles: ["l1_staff"],
      branchIds: [branch._id],
      status: "active",
    })
    await members.forTenant(ctx).insertOne({
      userId: "tech-b",
      email: "b@sw.test",
      name: "Tech B",
      roles: ["l1_staff"],
      branchIds: [branch._id],
      status: "active",
    })
    const floor = await createLocation(ctx, { branchId: branch._id, type: "floor", name: "F1" })
    const room = await createLocation(ctx, {
      branchId: branch._id,
      parentId: floor._id,
      type: "location",
      name: "Room 101",
    })
    const cats = await listCategories(ctx, "clinic")
    await createAssignmentRule(ctx, {
      name: "F1 Least Loaded",
      priority: 1,
      conditions: { locationId: floor._id.toHexString() },
      strategy: "least_loaded",
      userIds: ["tech-a", "tech-b"],
    })
    const tA = await createManualTicket(ctx, {
      locationId: room._id.toHexString(),
      categoryId: cats[0]._id.toHexString(),
      severity: "medium",
      description: "First F1 issue",
    })
    const tB = await createManualTicket(ctx, {
      locationId: room._id.toHexString(),
      categoryId: cats[0]._id.toHexString(),
      severity: "medium",
      description: "Second F1 issue",
    })
    expect(tA.assignee?.userId).not.toBe(tB.assignee?.userId)

    // Repository aggregate enforces tenant isolation
    const otherTenant = await createOrganization(
      { id: "other-admin", email: "other@test.io", name: "Other" },
      { orgName: "Other Org", industry: "clinic", branchName: "West", timezone: "UTC" },
    )
    const otherCtx = (await resolveTenantContext("other-admin", otherTenant.tenant._id))!
    const aggOther = await tickets
      .forTenant(otherCtx)
      .aggregate<{ count: number }>([{ $count: "count" }])
    expect(aggOther).toEqual([])

    // Overdue CAPA sweeper
    const rca = await createRca(ctx, {
      title: "Overdue CAPA RCA",
      method: "5why",
      problemStatement: "Testing overdue CAPA reminder",
    })
    const capa = await createCapa(ctx, {
      rcaId: rca._id.toHexString(),
      title: "Overdue plan",
      type: "corrective",
      actions: [
        {
          title: "Late action",
          ownerId: "tech-a",
          dueDate: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        },
      ],
    })
    const capaSweep = await sweepOverdueCapas(new Date())
    expect(capaSweep.reminded).toBeGreaterThanOrEqual(1)
    const reloadedCapa = await capas.forTenant(ctx).findById(capa._id)
    expect(reloadedCapa?.actions[0].remindedAt).toBeInstanceOf(Date)

    // Scheduled report sweeper
    await createSavedReport(ctx, {
      name: "Daily Ops Digest",
      rangeDays: 7,
      schedule: "daily",
      recipients: ["gm@sw.test"],
    })
    const repSweep = await sweepScheduledReports(new Date())
    expect(repSweep).toBeGreaterThanOrEqual(1)

    // Recurring audit auto-schedules next cycle on completion & via sweeper
    const tpl = await createAuditTemplate(ctx, {
      name: "Safety Walk",
      standard: "ISO 45001",
      items: [{ clause: "8.1", section: "Ops", question: "Are exits clear?" }],
    })
    const aud = await scheduleAudit(ctx, {
      branchId: branch._id.toHexString(),
      templateId: tpl._id.toHexString(),
      title: "Weekly Safety",
      recurrence: "weekly",
      scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
    })
    await completeAudit(ctx, aud._id)
    const audSweep = await sweepRecurringAudits(new Date())
    expect(audSweep).toBe(0) // already scheduled by completeAudit

    // Retention & orphan attachment sweepers run cleanly
    const retSweep = await sweepDataRetention(new Date())
    expect(retSweep).toBeGreaterThanOrEqual(0)

    // Orphan attachment older than 24h gets cleaned up
    await attachments.forTenant(ctx).insertOne({
      scope: "ticket",
      filename: "orphan.png",
      contentType: "image/png",
      size: 12,
      storageKey: `nonexistent/${new ObjectId().toHexString()}.png`,
      uploadedBy: "sw-admin",
      claimed: false,
    })
    const orphanRes = await sweepOrphanAttachments(new Date(Date.now() + 48 * 3_600_000), 24)
    expect(orphanRes).toBeGreaterThanOrEqual(1)
  })
})
