/**
 * Pure ticket state machine (phase.md §6.1, F-3.4).
 *
 * NEW → ASSIGNED → ACCEPTED → IN_PROGRESS → PENDING_VERIFICATION → CLOSED
 *                      │            │                │
 *                      │            └─ ON_HOLD       └─ REOPENED → IN_PROGRESS
 *                      └─ REJECTED → NEW
 * Any open → CANCELLED (admin/close permission)
 */

export type MachineTicketStatus =
  | "new"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "on_hold"
  | "pending_verification"
  | "reopened"
  | "closed"
  | "cancelled"

export type TicketEvent =
  | { type: "assign"; assigneeId: string; reason?: string }
  | { type: "accept" }
  | { type: "reject"; reason?: string }
  | { type: "start" }
  | { type: "hold"; reason?: string }
  | { type: "resume" }
  | { type: "submit"; note?: string; attachmentCount?: number }
  | { type: "verify_close"; note?: string }
  | { type: "reopen"; reason?: string }
  | { type: "cancel"; reason?: string; duplicateOf?: string }

export type TicketEventType = TicketEvent["type"]

export type TicketActor = {
  userId: string
  permissions: ReadonlySet<string>
}

export type TicketStateSnapshot = {
  status: MachineTicketStatus
  assigneeId: string | null
  requiresResolutionEvidence?: boolean
}

export type TransitionResult =
  | {
      ok: true
      nextStatus: MachineTicketStatus
      activityType: string
      clearAssignee?: boolean
      incrementReopen?: boolean
      pauseSla?: boolean
      resumeSla?: boolean
      markAccepted?: boolean
      markResolved?: boolean
    }
  | {
      ok: false
      code: "FORBIDDEN" | "CONFLICT" | "VALIDATION"
      message: string
      field?: string
    }

const REQUIRED_PERMISSION: Record<TicketEventType, readonly string[]> = {
  assign: ["ticket:assign"],
  accept: ["ticket:accept"],
  reject: ["ticket:accept"],
  start: ["ticket:work"],
  hold: ["ticket:work"],
  resume: ["ticket:work"],
  submit: ["ticket:work"],
  verify_close: ["ticket:verify", "ticket:close"],
  reopen: ["ticket:verify", "ticket:assign"],
  cancel: ["ticket:close"],
}

const ALLOWED_FROM: Record<TicketEventType, readonly MachineTicketStatus[]> = {
  assign: ["new", "assigned", "accepted", "in_progress", "on_hold", "reopened"],
  accept: ["new", "assigned"],
  reject: ["assigned"],
  start: ["assigned", "accepted", "reopened"],
  hold: ["accepted", "in_progress"],
  resume: ["on_hold"],
  submit: ["accepted", "in_progress", "reopened"],
  verify_close: ["pending_verification"],
  reopen: ["pending_verification", "closed"],
  cancel: [
    "new",
    "assigned",
    "accepted",
    "in_progress",
    "on_hold",
    "pending_verification",
    "reopened",
  ],
}

function hasAny(perms: ReadonlySet<string>, needed: readonly string[]) {
  return needed.some((p) => perms.has(p))
}

const trimmed = (v: string | undefined) => (v ?? "").trim()

export function transitionTicket(
  ticket: TicketStateSnapshot,
  event: TicketEvent,
  actor: TicketActor,
): TransitionResult {
  if (!hasAny(actor.permissions, REQUIRED_PERMISSION[event.type])) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You don't have permission to perform this action on the ticket.",
    }
  }

  if (!ALLOWED_FROM[event.type].includes(ticket.status)) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `Cannot ${event.type.replaceAll("_", " ")} a ticket that is ${ticket.status.replaceAll("_", " ")}.`,
    }
  }

  switch (event.type) {
    case "assign": {
      if (!trimmed(event.assigneeId)) {
        return { ok: false, code: "VALIDATION", field: "assigneeId", message: "Choose a teammate." }
      }
      const isReassign = !!ticket.assigneeId && ticket.assigneeId !== event.assigneeId
      if (isReassign && !trimmed(event.reason)) {
        return {
          ok: false,
          code: "VALIDATION",
          field: "reason",
          message: "Give a reason when reassigning a ticket.",
        }
      }
      return {
        ok: true,
        nextStatus: "assigned",
        activityType: isReassign ? "ticket.reassigned" : "ticket.assigned",
      }
    }

    case "accept":
      return {
        ok: true,
        nextStatus: "accepted",
        activityType: "ticket.accepted",
        markAccepted: true,
      }

    case "reject":
      if (!trimmed(event.reason)) {
        return {
          ok: false,
          code: "VALIDATION",
          field: "reason",
          message: "Give a reason for rejecting this assignment.",
        }
      }
      return {
        ok: true,
        nextStatus: "new",
        activityType: "ticket.rejected",
        clearAssignee: true,
      }

    case "start":
      return {
        ok: true,
        nextStatus: "in_progress",
        activityType: "ticket.started",
        markAccepted: true,
      }

    case "hold":
      if (!trimmed(event.reason)) {
        return {
          ok: false,
          code: "VALIDATION",
          field: "reason",
          message: "Give a reason for putting the ticket on hold.",
        }
      }
      return {
        ok: true,
        nextStatus: "on_hold",
        activityType: "ticket.held",
        pauseSla: true,
      }

    case "resume":
      return {
        ok: true,
        nextStatus: "in_progress",
        activityType: "ticket.resumed",
        resumeSla: true,
      }

    case "submit":
      if (!trimmed(event.note)) {
        return {
          ok: false,
          code: "VALIDATION",
          field: "note",
          message: "Describe what was done to resolve the issue.",
        }
      }
      if (ticket.requiresResolutionEvidence && (event.attachmentCount ?? 0) < 1) {
        return {
          ok: false,
          code: "VALIDATION",
          field: "attachments",
          message: "This category requires at least one resolution photo before closing.",
        }
      }
      return {
        ok: true,
        nextStatus: "pending_verification",
        activityType: "ticket.submitted",
        markResolved: true,
      }

    case "verify_close":
      return {
        ok: true,
        nextStatus: "closed",
        activityType: "ticket.closed",
      }

    case "reopen":
      if (!trimmed(event.reason)) {
        return {
          ok: false,
          code: "VALIDATION",
          field: "reason",
          message: "Explain what still needs work before reopening.",
        }
      }
      return {
        ok: true,
        nextStatus: "reopened",
        activityType: "ticket.reopened",
        incrementReopen: true,
      }

    case "cancel":
      return {
        ok: true,
        nextStatus: "cancelled",
        activityType: event.duplicateOf ? "ticket.merged" : "ticket.cancelled",
      }
  }
}

const UI_ORDER: readonly TicketEventType[] = [
  "accept",
  "start",
  "hold",
  "resume",
  "submit",
  "verify_close",
  "reopen",
  "reject",
  "cancel",
]

/** Events the UI should offer for a ticket in `status`, given the viewer's permissions. */
export function availableTicketEvents(
  status: MachineTicketStatus,
  permissions: ReadonlySet<string>,
): TicketEventType[] {
  return UI_ORDER.filter(
    (ev) => ALLOWED_FROM[ev].includes(status) && hasAny(permissions, REQUIRED_PERMISSION[ev]),
  )
}
