import "server-only"
import type { Filter, ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { SEVERITIES } from "@/lib/feedback-presets"
import {
  transitionTicket,
  type TicketEvent,
  type TicketEventType,
} from "@/lib/ticket-state-machine"
import { appendAudit } from "@/server/audit/audit-log"
import { nextSequence } from "@/server/db/counters"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { pickAssignee } from "@/server/modules/assignment"
import { notifyUser } from "@/server/modules/notifications"
import { computeInitialTicketSla } from "@/server/modules/sla"
import { assertCan } from "@/server/rbac/ability"
import {
  categories,
  locations,
  members,
  OPEN_TICKET_STATUSES,
  savedViews,
  TICKET_STATUSES,
  ticketActivities,
  ticketComments,
  tickets,
  type TicketDoc,
  type TicketStatus,
} from "@/server/repositories"
import { objectId } from "@/server/validation"

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export type TicketQueryFilters = {
  page?: number
  pageSize?: number
  status?: string
  severity?: string
  branchId?: string
  categoryId?: string
  assigneeId?: string
  mine?: boolean
  q?: string
}

export async function queryTickets(ctx: TenantContext, filters: TicketQueryFilters = {}) {
  assertCan(ctx, "ticket:read")
  const query: Filter<TicketDoc> = {}

  if (filters.status === "open") {
    query.status = { $in: OPEN_TICKET_STATUSES }
  } else if (filters.status === "closed_all") {
    query.status = { $in: ["closed", "cancelled"] }
  } else if (filters.status && (TICKET_STATUSES as readonly string[]).includes(filters.status)) {
    query.status = filters.status as TicketStatus
  }

  if (filters.severity && (SEVERITIES as readonly string[]).includes(filters.severity)) {
    query.severity = filters.severity as TicketDoc["severity"]
  }

  if (filters.branchId) {
    const bid = parseInput(objectId, filters.branchId)
    query.branchId = bid
  }

  if (filters.categoryId) {
    const cid = parseInput(objectId, filters.categoryId)
    query.categoryId = cid
  }

  if (filters.mine) {
    query["assignee.userId"] = ctx.actorId
  } else if (filters.assigneeId === "unassigned") {
    query.$or = [{ assignee: null }, { assignee: { $exists: false } }]
  } else if (filters.assigneeId) {
    query["assignee.userId"] = filters.assigneeId
  }

  if (filters.q && filters.q.trim()) {
    const rx = new RegExp(escapeRegex(filters.q.trim().slice(0, 80)), "i")
    const searchClause = [
      { number: rx },
      { description: rx },
      { categoryName: rx },
      { locationPath: rx },
      { tags: rx },
    ]
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchClause }]
      delete query.$or
    } else {
      query.$or = searchClause
    }
  }

  return tickets.forTenant(ctx).paginate(query, {
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 25,
    sort: { createdAt: -1 },
  })
}

async function actorName(ctx: TenantContext): Promise<string> {
  const m = await members.forTenant({ ...ctx, branchScope: "all" }).findOne({ userId: ctx.actorId })
  return m?.name ?? "Staff"
}

export async function getTicketDetail(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "ticket:read")
  const id = parseInput(objectId, idRaw)
  const ticket = await tickets.forTenant(ctx).findById(id)
  if (!ticket) throw new ApiError("NOT_FOUND", "Ticket not found.")

  const [comments, activities, category, activeMembers] = await Promise.all([
    ticketComments.forTenant(ctx).find({ ticketId: ticket._id }, { sort: { createdAt: 1 } }),
    ticketActivities.forTenant(ctx).find({ ticketId: ticket._id }, { sort: { at: 1, _id: 1 } }),
    categories.forTenant({ ...ctx, branchScope: "all" }).findById(ticket.categoryId),
    members
      .forTenant({ ...ctx, branchScope: "all" })
      .find({ status: "active" }, { sort: { name: 1 } }),
  ])

  const repeatCount30d = await tickets.forTenant(ctx).count({
    locationId: ticket.locationId,
    categoryId: ticket.categoryId,
    createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) },
  })

  const rcaRecommended =
    Boolean(category?.requiresRCA) ||
    ticket.severity === "critical" ||
    (ticket.currentLevel ?? 1) >= 3 ||
    repeatCount30d >= 3

  return {
    ticket,
    comments,
    activities,
    category,
    members: activeMembers,
    repeatCount30d,
    rcaRecommended,
  }
}

const manualTicketSchema = z.object({
  locationId: objectId,
  categoryId: objectId,
  severity: z.enum(SEVERITIES).default("medium"),
  description: z.string().trim().min(3, "Describe the issue").max(2000),
  assigneeId: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  attachments: z.array(z.string()).max(5).default([]),
})

export async function createManualTicket(
  ctx: TenantContext,
  raw: z.input<typeof manualTicketSchema>,
) {
  assertCan(ctx, "ticket:create")
  const input = parseInput(manualTicketSchema, raw)
  const loc = await locations.forTenant(ctx).findById(input.locationId)
  if (!loc || loc.status !== "active") throw new ApiError("NOT_FOUND", "Location not found.")
  assertCan(ctx, "ticket:create", { branchId: loc.branchId })

  const cat = await categories.forTenant({ ...ctx, branchScope: "all" }).findById(input.categoryId)
  if (!cat) throw new ApiError("NOT_FOUND", "Category not found.")

  let assignee: { userId: string; name: string } | null = null
  if (input.assigneeId) {
    const m = await members
      .forTenant({ ...ctx, branchScope: "all" })
      .findOne({ userId: input.assigneeId, status: "active" })
    if (!m)
      throw new ApiError("VALIDATION", "Unknown teammate.", {
        assigneeId: ["Pick an active member"],
      })
    assignee = { userId: m.userId, name: m.name }
  }

  const nameOfActor = await actorName(ctx)
  const ticket = await withTransaction(async (session) => {
    if (!assignee) {
      assignee = await pickAssignee(
        ctx,
        {
          branchId: loc.branchId,
          locationId: loc._id,
          categoryId: cat._id,
          severity: input.severity,
        },
        session,
      )
    }

    const now = new Date()
    const year = now.getUTCFullYear()
    const seq = await nextSequence(`${ctx.tenantId.toHexString()}:tickets:${year}`, session)
    const number = `TKT-${year}-${String(seq).padStart(6, "0")}`
    const initialSla = await computeInitialTicketSla(
      ctx,
      { branchId: loc.branchId, categoryId: cat._id, severity: input.severity, createdAt: now },
      session,
    )
    const initialStatus: TicketStatus = assignee ? "assigned" : "new"

    const created = await tickets.forTenant(ctx).insertOne(
      {
        branchId: loc.branchId,
        locationId: loc._id,
        locationPath: loc.path,
        qrCodeId: null,
        number,
        source: "manual",
        categoryId: cat._id,
        categoryName: cat.label,
        severity: input.severity,
        status: initialStatus,
        rating: null,
        description: input.description,
        reporter: { anonymous: false, name: nameOfActor },
        trackingTokenHashes: [],
        reportCount: 1,
        lastReportedAt: now,
        attachments: input.attachments,
        assignee,
        currentLevel: 1,
        slaPolicyId: initialSla?.slaPolicyId ?? null,
        sla: initialSla?.sla ?? null,
        tags: input.tags,
        reopenCount: 0,
      },
      { session },
    )

    await ticketActivities.forTenant(ctx).insertOne(
      {
        branchId: loc.branchId,
        ticketId: created._id,
        type: "ticket.created",
        actorId: ctx.actorId,
        actorName: nameOfActor,
        at: now,
        after: {
          status: initialStatus,
          severity: input.severity,
          assignee: assignee?.name ?? null,
        },
      },
      { session },
    )

    await appendAudit(
      ctx,
      {
        action: "ticket.created",
        entity: "ticket",
        entityId: created._id,
        after: { number, source: "manual", location: loc.path },
      },
      { session },
    )
    return created
  })

  if (ticket.assignee && ticket.assignee.userId !== ctx.actorId) {
    await notifyUser(ctx, {
      userId: ticket.assignee.userId,
      type: "ticket.assigned",
      title: `Assigned ${ticket.number} · ${ticket.categoryName}`,
      body: `${ticket.locationPath.join(" › ")}: ${ticket.description.slice(0, 140)}`,
      href: `/tickets/${ticket._id.toHexString()}`,
    })
  }

  return ticket
}

export async function applyTicketTransition(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  event: TicketEvent & { resolutionAttachments?: string[] },
) {
  const id = parseInput(objectId, idRaw)
  const existing = await tickets.forTenant(ctx).findById(id)
  if (!existing) throw new ApiError("NOT_FOUND", "Ticket not found.")

  const cat = await categories
    .forTenant({ ...ctx, branchScope: "all" })
    .findById(existing.categoryId)
  const resAttachments = event.resolutionAttachments ?? []
  const machineEvent: TicketEvent =
    event.type === "submit"
      ? {
          ...event,
          attachmentCount: resAttachments.length + (existing.resolutionAttachments?.length ?? 0),
        }
      : event

  const check = transitionTicket(
    {
      status: existing.status,
      assigneeId: existing.assignee?.userId ?? null,
      requiresResolutionEvidence: Boolean(cat?.requiresResolutionEvidence),
    },
    machineEvent,
    { userId: ctx.actorId, permissions: ctx.permissions },
  )

  if (!check.ok) {
    throw new ApiError(
      check.code,
      check.message,
      check.field ? { [check.field]: [check.message] } : undefined,
    )
  }

  let nextAssignee = existing.assignee ?? null
  if (event.type === "assign") {
    const target = await members
      .forTenant({ ...ctx, branchScope: "all" })
      .findOne({ userId: event.assigneeId, status: "active" })
    if (!target) {
      throw new ApiError("VALIDATION", "Selected teammate is not active.", {
        assigneeId: ["Pick an active teammate"],
      })
    }
    nextAssignee = { userId: target.userId, name: target.name }
  } else if (check.clearAssignee) {
    nextAssignee = null
  } else if (event.type === "accept" && !nextAssignee) {
    nextAssignee = { userId: ctx.actorId, name: await actorName(ctx) }
  }

  const now = new Date()
  const whoName = await actorName(ctx)
  const $set: Record<string, unknown> = {
    status: check.nextStatus,
    assignee: nextAssignee,
  }
  const $inc: Record<string, number> = {}

  if (check.incrementReopen) $inc.reopenCount = 1
  if (event.type === "submit") {
    $set.resolutionNote = event.note?.trim() ?? ""
    $set.submittedForVerificationAt = now
    if (resAttachments.length > 0) {
      $set.resolutionAttachments = [...(existing.resolutionAttachments ?? []), ...resAttachments]
    }
  }
  if (check.nextStatus === "closed") {
    $set.closedAt = now
  }
  if (event.type === "cancel" && event.duplicateOf) {
    $set.duplicateOf = event.duplicateOf.trim()
  }

  // Handle SLA timestamps & pause/resume clock cleanly
  if (existing.sla) {
    const nextSla = { ...existing.sla }
    if (check.markAccepted && !nextSla.acceptedAt) {
      nextSla.acceptedAt = now
    }
    if (check.markResolved) {
      nextSla.resolvedAt = now
    }
    if (check.pauseSla && !nextSla.pausedAt) {
      nextSla.pausedAt = now
    }
    if (check.resumeSla && nextSla.pausedAt) {
      const delta = Math.max(0, now.getTime() - new Date(nextSla.pausedAt).getTime())
      nextSla.pausedMs = (nextSla.pausedMs ?? 0) + delta
      nextSla.resolveDueAt = new Date(new Date(nextSla.resolveDueAt).getTime() + delta)
      if (!nextSla.acceptedAt) {
        nextSla.acceptDueAt = new Date(new Date(nextSla.acceptDueAt).getTime() + delta)
      }
      nextSla.pausedAt = null
    }
    if (check.incrementReopen) {
      // Restart SLA resolution clock on reopen (+2 hours minimum grace or original window)
      const graceMs = 2 * 60 * 60 * 1000
      nextSla.resolvedAt = null
      nextSla.pausedAt = null
      if (new Date(nextSla.resolveDueAt).getTime() < now.getTime() + graceMs) {
        nextSla.resolveDueAt = new Date(now.getTime() + graceMs)
      }
      nextSla.breached = false
    }
    $set.sla = nextSla
  }

  const note =
    "reason" in event && event.reason
      ? event.reason.trim()
      : "note" in event && event.note
        ? event.note.trim()
        : undefined

  const updated = await withTransaction(async (session) => {
    const doc = await tickets.forTenant(ctx).updateOne(
      { _id: existing._id },
      {
        $set,
        ...(Object.keys($inc).length ? { $inc } : {}),
      },
      { session },
    )

    await ticketActivities.forTenant(ctx).insertOne(
      {
        branchId: existing.branchId,
        ticketId: existing._id,
        type: check.activityType,
        actorId: ctx.actorId,
        actorName: whoName,
        at: now,
        before: { status: existing.status, assignee: existing.assignee?.name ?? null },
        after: { status: check.nextStatus, assignee: nextAssignee?.name ?? null },
        ...(note ? { note } : {}),
      },
      { session },
    )

    await appendAudit(
      ctx,
      {
        action: check.activityType,
        entity: "ticket",
        entityId: existing._id,
        before: { status: existing.status, assignee: existing.assignee?.userId ?? null },
        after: {
          status: check.nextStatus,
          assignee: nextAssignee?.userId ?? null,
          ...(note ? { note } : {}),
        },
      },
      { session },
    )

    return doc!
  })

  // Send targeted notifications outside transaction
  if (event.type === "assign" && nextAssignee && nextAssignee.userId !== ctx.actorId) {
    await notifyUser(ctx, {
      userId: nextAssignee.userId,
      type: check.activityType,
      title: `Assigned ${existing.number} · ${existing.categoryName}`,
      body: note
        ? `${existing.locationPath.join(" › ")} — ${note}`
        : existing.locationPath.join(" › "),
      href: `/tickets/${existing._id.toHexString()}`,
    })
  } else if (
    check.nextStatus === "reopened" &&
    nextAssignee &&
    nextAssignee.userId !== ctx.actorId
  ) {
    await notifyUser(ctx, {
      userId: nextAssignee.userId,
      type: "ticket.reopened",
      title: `Reopened ${existing.number} · ${existing.categoryName}`,
      body: note || "Ticket was reopened during verification.",
      href: `/tickets/${existing._id.toHexString()}`,
    })
  } else if (check.nextStatus === "pending_verification") {
    // Notify verifiers / org admins in the tenant
    const verifiers = await members
      .forTenant({ ...ctx, branchScope: "all" })
      .find({ status: "active", roles: { $in: ["verifier", "org_admin", "branch_admin"] } })
    for (const v of verifiers.slice(0, 5)) {
      if (v.userId === ctx.actorId) continue
      await notifyUser(ctx, {
        userId: v.userId,
        type: "ticket.submitted",
        title: `Ready to verify ${existing.number}`,
        body: `${whoName} submitted ${existing.locationPath.at(-1)} (${existing.categoryName}) for closure.`,
        href: `/tickets/${existing._id.toHexString()}`,
      })
    }
  }

  return updated
}

const commentSchema = z.object({
  body: z.string().trim().min(1, "Write a remark first").max(2000),
  visibility: z.enum(["internal", "public"]).default("internal"),
  attachments: z.array(z.string()).max(5).default([]),
})

export async function addTicketComment(
  ctx: TenantContext,
  ticketIdRaw: ObjectId | string,
  raw: z.input<typeof commentSchema>,
) {
  assertCan(ctx, "ticket:read")
  const ticketId = parseInput(objectId, ticketIdRaw)
  const ticket = await tickets.forTenant(ctx).findById(ticketId)
  if (!ticket) throw new ApiError("NOT_FOUND", "Ticket not found.")
  assertCan(ctx, "ticket:work", { branchId: ticket.branchId })

  const input = parseInput(commentSchema, raw)
  const whoName = await actorName(ctx)
  const now = new Date()

  const comment = await withTransaction(async (session) => {
    const doc = await ticketComments.forTenant(ctx).insertOne(
      {
        branchId: ticket.branchId,
        ticketId: ticket._id,
        authorId: ctx.actorId,
        authorName: whoName,
        body: input.body,
        visibility: input.visibility,
        attachments: input.attachments,
      },
      { session },
    )
    await ticketActivities.forTenant(ctx).insertOne(
      {
        branchId: ticket.branchId,
        ticketId: ticket._id,
        type: "comment.added",
        actorId: ctx.actorId,
        actorName: whoName,
        at: now,
        note: input.body,
        meta: { visibility: input.visibility, attachments: input.attachments.length },
      },
      { session },
    )
    return doc
  })

  if (ticket.assignee && ticket.assignee.userId !== ctx.actorId) {
    await notifyUser(ctx, {
      userId: ticket.assignee.userId,
      type: "comment.added",
      title: `New remark on ${ticket.number}`,
      body: `${whoName}: ${input.body.slice(0, 140)}`,
      href: `/tickets/${ticket._id.toHexString()}`,
    })
  }

  return comment
}

export async function updateTicketTags(
  ctx: TenantContext,
  ticketIdRaw: ObjectId | string,
  rawTags: string[],
) {
  const ticketId = parseInput(objectId, ticketIdRaw)
  const ticket = await tickets.forTenant(ctx).findById(ticketId)
  if (!ticket) throw new ApiError("NOT_FOUND", "Ticket not found.")
  assertCan(ctx, "ticket:work", { branchId: ticket.branchId })
  const tags = [...new Set(rawTags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
  return withTransaction(async (session) => {
    const updated = await tickets
      .forTenant(ctx)
      .updateOne({ _id: ticket._id }, { $set: { tags } }, { session })
    await appendAudit(
      ctx,
      {
        action: "ticket.tags_updated",
        entity: "ticket",
        entityId: ticket._id,
        before: { tags: ticket.tags ?? [] },
        after: { tags },
      },
      { session },
    )
    return updated!
  })
}

const bulkSchema = z.object({
  ticketIds: z.array(objectId).min(1, "Select at least one ticket").max(50),
  action: z.enum(["assign", "cancel"]),
  assigneeId: z.string().optional(),
  reason: z.string().trim().max(500).optional(),
})

export async function bulkUpdateTickets(ctx: TenantContext, raw: z.input<typeof bulkSchema>) {
  const input = parseInput(bulkSchema, raw)
  let updated = 0
  for (const tid of input.ticketIds) {
    const ev: TicketEvent =
      input.action === "assign"
        ? {
            type: "assign",
            assigneeId: input.assigneeId ?? "",
            reason: input.reason || "Bulk assignment",
          }
        : { type: "cancel", reason: input.reason || "Bulk cancelled" }
    await applyTicketTransition(ctx, tid, ev)
    updated++
  }
  return updated
}

// ── Saved views ─────────────────────────────────────────────────────────────────────

const savedViewSchema = z.object({
  name: z.string().trim().min(2, "Name your view").max(60),
  shared: z.boolean().default(false),
  filters: z
    .object({
      status: z.string().optional(),
      severity: z.string().optional(),
      branchId: z.string().optional(),
      categoryId: z.string().optional(),
      assigneeId: z.string().optional(),
      q: z.string().optional(),
    })
    .default({}),
})

export async function listSavedViews(ctx: TenantContext) {
  assertCan(ctx, "ticket:read")
  return savedViews
    .forTenant(ctx)
    .find({ $or: [{ ownerId: ctx.actorId }, { shared: true }] }, { sort: { name: 1 } })
}

export async function createSavedView(ctx: TenantContext, raw: z.input<typeof savedViewSchema>) {
  assertCan(ctx, "ticket:read")
  const input = parseInput(savedViewSchema, raw)
  return savedViews.forTenant(ctx).insertOne({
    name: input.name,
    ownerId: ctx.actorId,
    shared: input.shared,
    filters: input.filters,
  })
}

export async function deleteSavedView(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "ticket:read")
  const id = parseInput(objectId, idRaw)
  const ok = await savedViews
    .forTenant(ctx)
    .deleteOne({ _id: id, $or: [{ ownerId: ctx.actorId }, { shared: true }] })
  if (!ok) throw new ApiError("NOT_FOUND", "Saved view not found.")
}

export type { TicketEventType }
