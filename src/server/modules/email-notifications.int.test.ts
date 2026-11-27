import { beforeEach, describe, expect, it } from "vitest"
import { resolveTenantContext } from "@/server/auth/context"
import { takeTestOutbox, type Mail } from "@/server/mail"
import { createAssignmentRule } from "@/server/modules/assignment"
import { submitFeedback } from "@/server/modules/intake"
import {
  acceptInvite,
  createInvite,
  createMemberWithPassword,
  setMemberStatus,
  updateMemberAccess,
  type IdentityProvider,
} from "@/server/modules/members"
import { createQrCode, resolvePublicQr } from "@/server/modules/qr-codes"
import { saveNotificationPreferences } from "@/server/modules/reports"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { members } from "@/server/repositories"
import { setupTestDb } from "@/test/db"
import { orgWithRoom } from "@/test/fixtures"

setupTestDb()

const noLimits = { ip: "203.0.113.9", limits: null }

beforeEach(() => {
  takeTestOutbox()
})

async function scenario() {
  const org = await orgWithRoom({ orgName: "Sunrise Hotels" })
  const owner = await members.forTenant(org.ctx).findOne({ userId: org.ctx.actorId })
  await members.forTenant(org.ctx).insertOne({
    userId: "staff-1",
    email: "staff1@x.test",
    name: "Ravi",
    roles: ["l1_staff"],
    branchIds: [org.branch._id],
    status: "active",
  })
  const staffCtx = (await resolveTenantContext("staff-1", org.tenant._id))!
  const qr = await createQrCode(org.ctx, org.room._id)
  const pub = (await resolvePublicQr(qr.shortCode))!
  const categoryId = pub.categories.find((c) => c.key === "housekeeping")!.id
  return { ...org, ownerEmail: owner!.email, staffCtx, qr, categoryId }
}

const report = (categoryId: string, extra: Record<string, unknown> = {}) => ({
  categoryId,
  rating: "2",
  description: "Floor is wet near the sinks",
  urgency: "normal",
  consent: "on",
  ...extra,
})

const to = (mails: Mail[], email: string) => mails.filter((m) => m.to === email)

describe("ticket emails", () => {
  it("emails the branch's assigners about a new ticket nobody was auto-assigned", async () => {
    const { qr, categoryId, ownerEmail } = await scenario()
    const res = await submitFeedback(
      qr.shortCode,
      report(categoryId, { email: "guest@example.com" }),
      noLimits,
    )
    const sent = takeTestOutbox()

    const [toOwner] = to(sent, ownerEmail)
    expect(toOwner.subject).toBe(`New ticket ${res.number} · Housekeeping`)
    expect(toOwner.html).toContain("Floor 2 › Washroom F2")
    expect(toOwner.html).toContain("Assign ticket")
    expect(toOwner.html).toContain("Sunrise Hotels")
    // L1 staff can't assign, so they aren't told about unassigned tickets.
    expect(to(sent, "staff1@x.test")).toEqual([])
    // The reporter gets a branded confirmation with their tracking link.
    expect(to(sent, "guest@example.com")[0].html).toContain(`/t/${res.trackingToken}`)

    // A repeat report merges into the open ticket and isn't news to anyone.
    await submitFeedback(qr.shortCode, report(categoryId), noLimits)
    expect(to(takeTestOutbox(), ownerEmail)).toEqual([])
  })

  it("emails only the assignee when the ticket is auto-assigned, and again when it closes", async () => {
    const { ctx, staffCtx, branch, qr, categoryId, ownerEmail } = await scenario()
    await createAssignmentRule(ctx, {
      name: "Housekeeping",
      priority: 1,
      conditions: { branchId: branch._id.toHexString(), categoryId },
      strategy: "round_robin",
      userIds: ["staff-1"],
    })
    const res = await submitFeedback(
      qr.shortCode,
      report(categoryId, { email: "guest@example.com" }),
      noLimits,
    )
    const sent = takeTestOutbox()
    expect(to(sent, "staff1@x.test").map((m) => m.subject)).toEqual([
      `New ticket ${res.number} · Housekeeping`,
    ])
    expect(to(sent, "staff1@x.test")[0].html).toContain("Open ticket")
    expect(to(sent, ownerEmail)).toEqual([])

    const { items } = await queryTickets(ctx, { q: res.number })
    const id = items[0]._id
    await applyTicketTransition(staffCtx, id, { type: "accept" })
    await applyTicketTransition(staffCtx, id, { type: "start" })
    await applyTicketTransition(staffCtx, id, { type: "submit", note: "Mopped and dried" })
    takeTestOutbox()
    await applyTicketTransition(ctx, id, { type: "verify_close", note: "Checked" })

    const closed = takeTestOutbox()
    expect(to(closed, "staff1@x.test").map((m) => m.subject)).toEqual([
      `Closed ${res.number} · Housekeeping`,
    ])
    expect(to(closed, "guest@example.com")[0].subject).toContain("Resolved")
  })

  it("respects the 'new tickets' preference", async () => {
    const { ctx, qr, categoryId, ownerEmail } = await scenario()
    await saveNotificationPreferences(ctx, {
      channels: { in_app: true, email: true, sms: false, whatsapp: false, push: false },
      events: {
        assigned: true,
        newTicket: false,
        escalated: true,
        verification: true,
        capaDue: true,
        digest: false,
      },
      digestMode: "instant",
    })
    await submitFeedback(qr.shortCode, report(categoryId), noLimits)
    expect(to(takeTestOutbox(), ownerEmail)).toEqual([])
  })
})

describe("account emails", () => {
  const identity: IdentityProvider = {
    async createPasswordUser() {
      return { id: "pw-user" }
    },
    async deleteUser() {},
  }

  it("welcomes a user created with a password, without ever emailing the password", async () => {
    const { ctx, branch } = await scenario()
    await createMemberWithPassword(
      ctx,
      {
        name: "Meera",
        email: "meera@x.test",
        password: "super-secret-pw",
        roles: ["l1_staff"],
        branchIds: [branch._id.toHexString()],
      },
      identity,
    )
    const [mail] = to(takeTestOutbox(), "meera@x.test")
    expect(mail.subject).toBe("You've been added to Sunrise Hotels")
    expect(mail.html).toContain("/sign-in")
    expect(mail.text).toContain("L1 staff")
    expect(mail.text + mail.html).not.toContain("super-secret-pw")
  })

  it("tells people when their roles change and when they are deactivated", async () => {
    const { ctx, branch } = await scenario()
    const { token } = await createInvite(ctx, {
      email: "asha@x.test",
      roles: ["l1_staff"],
      branchIds: [branch._id.toHexString()],
    })
    const invite = to(takeTestOutbox(), "asha@x.test")
    expect(invite).toEqual([]) // the invite email is sent by the action, with the link
    const m = await acceptInvite({ id: "asha", email: "asha@x.test", name: "Asha" }, token)

    await updateMemberAccess(ctx, m._id, {
      roles: ["l2_supervisor"],
      branchIds: [branch._id.toHexString()],
    })
    const [changed] = to(takeTestOutbox(), "asha@x.test")
    expect(changed.subject).toBe("Your access in Sunrise Hotels changed")
    expect(changed.text).toContain("L1 staff → L2 supervisor")

    // Saving with nothing changed sends nothing.
    await updateMemberAccess(ctx, m._id, {
      roles: ["l2_supervisor"],
      branchIds: [branch._id.toHexString()],
    })
    expect(to(takeTestOutbox(), "asha@x.test")).toEqual([])

    await setMemberStatus(ctx, m._id, "inactive")
    const [off] = to(takeTestOutbox(), "asha@x.test")
    expect(off.subject).toBe("Your access to Sunrise Hotels was removed")
  })
})
