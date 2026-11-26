import { describe, expect, it } from "vitest"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { createAssignmentRule } from "@/server/modules/assignment"
import { listCategories } from "@/server/modules/categories"
import { getPublicTicket, listTicketActivities, submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import {
  listNotifications,
  markAllRead,
  unreadNotificationCount,
} from "@/server/modules/notifications"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import {
  addTicketComment,
  applyTicketTransition,
  bulkUpdateTickets,
  createSavedView,
  getTicketDetail,
  listSavedViews,
  queryTickets,
} from "@/server/modules/tickets"
import { members } from "@/server/repositories"
import { setupTestDb } from "@/test/db"

setupTestDb()

async function seedWorkspace() {
  const { tenant, branch } = await createOrganization(
    { id: "admin-1", email: "admin@p3.test", name: "Admin One" },
    { orgName: "P3 Hotel", industry: "hotel", branchName: "Delhi", timezone: "Asia/Kolkata" },
  )
  const ctx = (await resolveTenantContext("admin-1", tenant._id))!
  await members.forTenant(ctx).insertOne({
    userId: "staff-1",
    email: "staff1@p3.test",
    name: "Ravi L1",
    roles: ["l1_staff"],
    branchIds: [branch._id],
    status: "active",
  })
  await members.forTenant(ctx).insertOne({
    userId: "staff-2",
    email: "staff2@p3.test",
    name: "Meera L1",
    roles: ["l1_staff"],
    branchIds: [branch._id],
    status: "active",
  })
  const staff1Ctx = (await resolveTenantContext("staff-1", tenant._id))!
  const loc = await createLocation(ctx, {
    branchId: branch._id,
    type: "location",
    name: "Room 305",
  })
  const qr = await createQrCode(ctx, loc._id)
  const cats = await listCategories(ctx, "hotel")
  return { tenant, branch, ctx, staff1Ctx, loc, qr, cats }
}

describe("Phase 3 ticketing core, assignment & notifications", () => {
  it("auto-assigns via round-robin rule, runs lifecycle transitions, tracks timeline & notifications", async () => {
    const { ctx, staff1Ctx, branch, qr, cats } = await seedWorkspace()

    await createAssignmentRule(ctx, {
      name: "Housekeeping round robin",
      priority: 1,
      conditions: { branchId: branch._id.toHexString(), categoryId: cats[0]._id.toHexString() },
      strategy: "round_robin",
      userIds: ["staff-1", "staff-2"],
    })

    const sub1 = await submitFeedback(
      qr.shortCode,
      {
        categoryId: cats[0]._id.toHexString(),
        description: "Towels missing",
        rating: 2,
        consent: "on",
        email: "guest@example.com",
      },
      { ip: "127.0.0.1", limits: null },
    )

    const { items } = await queryTickets(ctx, { q: sub1.number })
    expect(items).toHaveLength(1)
    const ticket = items[0]
    expect(ticket.status).toBe("assigned")
    expect(ticket.assignee?.userId).toBe("staff-1")

    // Staff-1 got an in-app notification
    expect(await unreadNotificationCount(staff1Ctx)).toBe(1)
    const notifs = await listNotifications(staff1Ctx)
    expect(notifs[0].title).toContain(sub1.number)
    await markAllRead(staff1Ctx)
    expect(await unreadNotificationCount(staff1Ctx)).toBe(0)

    // Lifecycle: accept -> start -> hold -> resume -> submit -> verify_close
    await applyTicketTransition(staff1Ctx, ticket._id, { type: "accept" })
    await applyTicketTransition(staff1Ctx, ticket._id, { type: "start" })
    await applyTicketTransition(staff1Ctx, ticket._id, {
      type: "hold",
      reason: "Waiting for linen cart",
    })
    await applyTicketTransition(staff1Ctx, ticket._id, { type: "resume" })

    // Add both internal and public comments
    await addTicketComment(staff1Ctx, ticket._id, {
      body: "Internal note: linen storage locked",
      visibility: "internal",
      attachments: [],
    })
    await addTicketComment(staff1Ctx, ticket._id, {
      body: "Fresh towels delivered to Room 305",
      visibility: "public",
      attachments: [],
    })

    // Public tracking page shows only public comment
    const pub = await getPublicTicket(sub1.trackingToken)
    expect(pub?.publicComments).toHaveLength(1)
    expect(pub?.publicComments?.[0].body).toContain("Fresh towels delivered")

    await applyTicketTransition(staff1Ctx, ticket._id, {
      type: "submit",
      note: "Delivered towels and cleaned bath",
    })
    await applyTicketTransition(ctx, ticket._id, {
      type: "verify_close",
      note: "Verified by housekeeping desk",
    })

    const detail = await getTicketDetail(ctx, ticket._id)
    expect(detail.ticket.status).toBe("closed")
    const acts = await listTicketActivities(ctx, ticket._id)
    expect(acts.map((a) => a.type)).toEqual(
      expect.arrayContaining([
        "ticket.created",
        "ticket.assigned",
        "ticket.accepted",
        "ticket.started",
        "ticket.held",
        "ticket.resumed",
        "comment.added",
        "ticket.submitted",
        "ticket.closed",
      ]),
    )

    const chain = await verifyChain(ctx)
    expect(chain.ok).toBe(true)
  })

  it("supports saved views and bulk assignment", async () => {
    const { ctx, qr, cats } = await seedWorkspace()
    const a = await submitFeedback(
      qr.shortCode,
      { categoryId: cats[0]._id.toHexString(), description: "Issue A", consent: "on" },
      { ip: "127.0.0.1", limits: null },
    )
    const b = await submitFeedback(
      qr.shortCode,
      { categoryId: cats[1]._id.toHexString(), description: "Issue B", consent: "on" },
      { ip: "127.0.0.1", limits: null },
    )
    const { items } = await queryTickets(ctx, {})
    expect(items.map((i) => i.number)).toEqual(expect.arrayContaining([a.number, b.number]))

    await bulkUpdateTickets(ctx, {
      ticketIds: items.map((i) => i._id.toHexString()),
      action: "assign",
      assigneeId: "staff-2",
      reason: "Morning shift bulk assign",
    })

    const after = await queryTickets(ctx, { assigneeId: "staff-2" })
    expect(after.items).toHaveLength(2)

    await createSavedView(ctx, {
      name: "Urgent open",
      shared: true,
      filters: { severity: "high", status: "open" },
    })
    const views = await listSavedViews(ctx)
    expect(views).toHaveLength(1)
    expect(views[0].name).toBe("Urgent open")
  })
})
