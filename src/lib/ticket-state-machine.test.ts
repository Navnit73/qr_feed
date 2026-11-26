// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  availableTicketEvents,
  transitionTicket,
  type TicketActor,
  type TicketStateSnapshot,
} from "./ticket-state-machine"

const admin: TicketActor = {
  userId: "u-admin",
  permissions: new Set([
    "ticket:read",
    "ticket:create",
    "ticket:assign",
    "ticket:accept",
    "ticket:work",
    "ticket:verify",
    "ticket:close",
  ]),
}
const staff: TicketActor = {
  userId: "u-staff",
  permissions: new Set(["ticket:read", "ticket:accept", "ticket:work"]),
}
const verifier: TicketActor = {
  userId: "u-verifier",
  permissions: new Set(["ticket:read", "ticket:verify", "ticket:close"]),
}
const viewer: TicketActor = {
  userId: "u-viewer",
  permissions: new Set(["ticket:read"]),
}

const snap = (overrides: Partial<TicketStateSnapshot> = {}): TicketStateSnapshot => ({
  status: "new",
  assigneeId: null,
  requiresResolutionEvidence: false,
  ...overrides,
})

describe("ticket state machine (F-3.4 / T-SM-1)", () => {
  it("walks the happy path: new -> assigned -> accepted -> in_progress -> pending_verification -> closed", () => {
    const r1 = transitionTicket(
      snap({ status: "new" }),
      { type: "assign", assigneeId: "u-staff" },
      admin,
    )
    expect(r1).toMatchObject({ ok: true, nextStatus: "assigned", activityType: "ticket.assigned" })

    const r2 = transitionTicket(
      snap({ status: "assigned", assigneeId: "u-staff" }),
      { type: "accept" },
      staff,
    )
    expect(r2).toMatchObject({ ok: true, nextStatus: "accepted", activityType: "ticket.accepted" })

    const r3 = transitionTicket(
      snap({ status: "accepted", assigneeId: "u-staff" }),
      { type: "start" },
      staff,
    )
    expect(r3).toMatchObject({
      ok: true,
      nextStatus: "in_progress",
      activityType: "ticket.started",
    })

    const r4 = transitionTicket(
      snap({ status: "in_progress", assigneeId: "u-staff" }),
      { type: "submit", note: "Replaced tap washer" },
      staff,
    )
    expect(r4).toMatchObject({
      ok: true,
      nextStatus: "pending_verification",
      activityType: "ticket.submitted",
    })

    const r5 = transitionTicket(
      snap({ status: "pending_verification", assigneeId: "u-staff" }),
      { type: "verify_close", note: "Checked in person" },
      verifier,
    )
    expect(r5).toMatchObject({ ok: true, nextStatus: "closed", activityType: "ticket.closed" })
  })

  it("requires a reason for hold, reject, reassignment and reopen", () => {
    const noHold = transitionTicket(
      snap({ status: "in_progress" }),
      { type: "hold", reason: "  " },
      staff,
    )
    expect(noHold).toMatchObject({ ok: false, code: "VALIDATION", field: "reason" })

    const okHold = transitionTicket(
      snap({ status: "in_progress" }),
      { type: "hold", reason: "Waiting for spare valve" },
      staff,
    )
    expect(okHold).toMatchObject({ ok: true, nextStatus: "on_hold", pauseSla: true })

    const okResume = transitionTicket(snap({ status: "on_hold" }), { type: "resume" }, staff)
    expect(okResume).toMatchObject({ ok: true, nextStatus: "in_progress", resumeSla: true })

    const noReject = transitionTicket(
      snap({ status: "assigned", assigneeId: "u-staff" }),
      { type: "reject" },
      staff,
    )
    expect(noReject).toMatchObject({ ok: false, code: "VALIDATION", field: "reason" })

    const okReject = transitionTicket(
      snap({ status: "assigned", assigneeId: "u-staff" }),
      { type: "reject", reason: "Wrong department" },
      staff,
    )
    expect(okReject).toMatchObject({ ok: true, nextStatus: "new", clearAssignee: true })

    const noReassign = transitionTicket(
      snap({ status: "in_progress", assigneeId: "u-staff" }),
      { type: "assign", assigneeId: "u-other" },
      admin,
    )
    expect(noReassign).toMatchObject({ ok: false, code: "VALIDATION", field: "reason" })

    const okReassign = transitionTicket(
      snap({ status: "in_progress", assigneeId: "u-staff" }),
      { type: "assign", assigneeId: "u-other", reason: "Shift handover" },
      admin,
    )
    expect(okReassign).toMatchObject({
      ok: true,
      nextStatus: "assigned",
      activityType: "ticket.reassigned",
    })

    const noReopen = transitionTicket(
      snap({ status: "pending_verification" }),
      { type: "reopen" },
      verifier,
    )
    expect(noReopen).toMatchObject({ ok: false, code: "VALIDATION", field: "reason" })

    const okReopen = transitionTicket(
      snap({ status: "pending_verification" }),
      { type: "reopen", reason: "Leak still visible" },
      verifier,
    )
    expect(okReopen).toMatchObject({ ok: true, nextStatus: "reopened", incrementReopen: true })
  })

  it("enforces resolution remarks and evidence when category requires it", () => {
    const missingNote = transitionTicket(snap({ status: "in_progress" }), { type: "submit" }, staff)
    expect(missingNote).toMatchObject({ ok: false, code: "VALIDATION", field: "note" })

    const missingEvidence = transitionTicket(
      snap({ status: "in_progress", requiresResolutionEvidence: true }),
      { type: "submit", note: "Fixed", attachmentCount: 0 },
      staff,
    )
    expect(missingEvidence).toMatchObject({ ok: false, code: "VALIDATION", field: "attachments" })

    const withEvidence = transitionTicket(
      snap({ status: "in_progress", requiresResolutionEvidence: true }),
      { type: "submit", note: "Fixed", attachmentCount: 1 },
      staff,
    )
    expect(withEvidence).toMatchObject({ ok: true, nextStatus: "pending_verification" })
  })

  it("blocks invalid transitions and missing permissions", () => {
    // Cannot close directly from new
    expect(
      transitionTicket(snap({ status: "new" }), { type: "verify_close" }, admin),
    ).toMatchObject({
      ok: false,
      code: "CONFLICT",
    })
    // Cannot transition out of cancelled
    expect(transitionTicket(snap({ status: "cancelled" }), { type: "start" }, admin)).toMatchObject(
      {
        ok: false,
        code: "CONFLICT",
      },
    )
    // Staff cannot verify_close or cancel
    expect(
      transitionTicket(snap({ status: "pending_verification" }), { type: "verify_close" }, staff),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" })
    expect(transitionTicket(snap({ status: "new" }), { type: "cancel" }, staff)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    })
    // Viewer gets no events
    expect(availableTicketEvents("in_progress", viewer.permissions)).toEqual([])
    expect(availableTicketEvents("in_progress", staff.permissions)).toEqual(["hold", "submit"])
    expect(availableTicketEvents("pending_verification", verifier.permissions)).toEqual([
      "verify_close",
      "reopen",
      "cancel",
    ])
  })
})
