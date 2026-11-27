import "server-only"
import { ObjectId, type Filter } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { SEVERITIES } from "@/lib/feedback-presets"
import type { TicketRow } from "@/lib/ticket-display"
import {
  transitionTicket,
  type TicketEvent,
  type TicketEventType,
} from "@/lib/ticket-state-machine"
import { appendAudit } from "@/server/audit/audit-log"
import { nextSequence } from "@/server/db/counters"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { pickAssignee } from "@/server/modules/assignment"
import { membersWhoCan, notifyReporterClosure, notifyUser } from "@/server/modules/notifications"
import { dispatchWebhookEvent } from "@/server/modules/platform"
import { computeInitialTicketSla } from "@/server/modules/sla"
import { assertWithinLimit, getTenant } from "@/server/modules/tenants"
import { assertCan, can, resolveAccess } from "@/server/rbac/ability"
import {
  attachments,
  categories,
  locations,
  members,
  OPEN_TICKET_STATUSES,
  roles as rolesRepo,
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
  cursor?: string
  includeTotal?: boolean
  status?: string
  excludeStatuses?: TicketStatus[]
  severity?: string
  branchId?: string
  categoryId?: string
  assigneeId?: string
  mine?: boolean
  sort?: "newest" | "sla_due"
  q?: string
}

export function encodeTicketCursor(doc: Pick<TicketDoc, "_id" | "createdAt">): string {
  return Buffer.from(`${doc.createdAt.toISOString()}|${doc._id.toHexString()}`, "utf8").toString(
    "base64url",
  )
}

export function decodeTicketCursor(raw: string): { createdAt: Date; id: ObjectId } {
  let decoded: string
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8")
  } catch {
    throw new ApiError("VALIDATION", "Invalid pagination cursor.")
  }
  const sep = decoded.indexOf("|")
  if (sep === -1) throw new ApiError("VALIDATION", "Invalid pagination cursor.")
  const iso = decoded.slice(0, sep)
  const idHex = decoded.slice(sep + 1)
  const createdAt = new Date(iso)
  if (!Number.isFinite(createdAt.getTime()) || !ObjectId.isValid(idHex)) {
    throw new ApiError("VALIDATION", "Invalid pagination cursor.")
  }
  return { createdAt, id: new ObjectId(idHex) }
}

export function serializeTicketRow(t: TicketDoc): TicketRow {
  return {
    id: t._id.toHexString(),
    number: t.number,
    locationName: t.locationPath.at(-1) ?? "",
    locationParent: t.locationPath.slice(0, -1).join(" › "),
    categoryName: t.categoryName,
    description: t.description,
    severity: t.severity,
    status: t.status,
    rating: t.rating,
    reportCount: t.reportCount,
    assigneeName: t.assignee?.name ?? null,
    currentLevel: t.currentLevel ?? 1,
    slaBreached: Boolean(t.sla?.breached),
    slaPausedAt: t.sla?.pausedAt ? t.sla.pausedAt.toISOString() : null,
    slaResolvedAt: t.sla?.resolvedAt ? t.sla.resolvedAt.toISOString() : null,
    resolveDueAt: t.sla?.resolveDueAt ? t.sla.resolveDueAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }
}

function buildTicketFilter(ctx: TenantContext, filters: TicketQueryFilters): Filter<TicketDoc> {
  const query: Filter<TicketDoc> = {}

  if (filters.status === "open") {
    const allowed = filters.excludeStatuses?.length
      ? OPEN_TICKET_STATUSES.filter((s) => !filters.excludeStatuses!.includes(s))
      : OPEN_TICKET_STATUSES
    query.status = { $in: allowed }
  } else if (filters.status === "closed_all") {
    query.status = { $in: ["closed", "cancelled"] }
  } else if (filters.status && (TICKET_STATUSES as readonly string[]).includes(filters.status)) {
    query.status = filters.status as TicketStatus
  } else if (filters.excludeStatuses?.length) {
    query.status = { $nin: filters.excludeStatuses }
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

  return query
}

export async function queryTickets(ctx: TenantContext, filters: TicketQueryFilters = {}) {
  assertCan(ctx, "ticket:read")
  const query = buildTicketFilter(ctx, filters)
  const sortOrder: Record<string, 1 | -1> =
    filters.sort === "sla_due"
      ? { "sla.resolveDueAt": 1, createdAt: -1, _id: -1 }
      : { createdAt: -1, _id: -1 }

  return tickets.forTenant(ctx).paginate(query, {
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 25,
    sort: sortOrder,
  })
}

/**
 * Backend cursor-based keyset pagination for infinite scroll on `/tickets`.
 * - When `cursor` is provided: performs an O(1) indexed seek on `{ createdAt: -1, _id: -1 }`
 *   so newly created tickets never shift/duplicate already-scrolled rows.
 * - When `page > 1` without `cursor` (e.g. deep-linking to `/tickets?page=2`): starts from
 *   that page using the same deterministic sort and returns `nextCursor` for scrolling onward.
 */
export async function queryTicketsCursor(
  ctx: TenantContext,
  filters: TicketQueryFilters = {},
): Promise<{
  items: TicketDoc[]
  nextCursor: string | null
  hasMore: boolean
  total?: number
  page: number
  pageSize: number
}> {
  assertCan(ctx, "ticket:read")
  const rawSize = filters.pageSize ?? 25
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, Math.floor(rawSize))) : 25
  const rawPage = filters.page ?? 1
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const sort: Record<string, 1 | -1> = { createdAt: -1, _id: -1 }
  const baseQuery = buildTicketFilter(ctx, filters)
  const repo = tickets.forTenant(ctx)

  // Keyset cursor mode (used on every scroll fetch): 1 indexed query, zero skip drift.
  if (filters.cursor) {
    const { createdAt, id } = decodeTicketCursor(filters.cursor)
    const cursorClause: Filter<TicketDoc> = {
      $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }],
    }
    const finalFilter: Filter<TicketDoc> =
      Object.keys(baseQuery).length > 0 ? { $and: [baseQuery, cursorClause] } : cursorClause

    const [batch, total] = await Promise.all([
      repo.find(finalFilter, { sort, limit: pageSize + 1 }),
      filters.includeTotal ? repo.count(baseQuery) : Promise.resolve(undefined),
    ])
    const hasMore = batch.length > pageSize
    const items = hasMore ? batch.slice(0, pageSize) : batch
    const last = items.at(-1)
    return {
      items,
      nextCursor: hasMore && last ? encodeTicketCursor(last) : null,
      hasMore,
      ...(total !== undefined ? { total } : {}),
      page,
      pageSize,
    }
  }

  // Deep-link offset start (e.g. `/tickets?page=2`): paginate to requested page and emit nextCursor.
  if (page > 1) {
    const { items, meta } = await repo.paginate(baseQuery, { page, pageSize, sort })
    const hasMore = meta.page < meta.totalPages && items.length > 0
    const last = items.at(-1)
    return {
      items,
      nextCursor: hasMore && last ? encodeTicketCursor(last) : null,
      hasMore,
      total: meta.total,
      page: meta.page,
      pageSize: meta.pageSize,
    }
  }

  // Initial page 1 load: 1 find(limit + 1) + 1 count in parallel.
  const [batch, total] = await Promise.all([
    repo.find(baseQuery, { sort, limit: pageSize + 1 }),
    filters.includeTotal === false ? Promise.resolve(undefined) : repo.count(baseQuery),
  ])
  const hasMore = batch.length > pageSize
  const items = hasMore ? batch.slice(0, pageSize) : batch
  const last = items.at(-1)
  return {
    items,
    nextCursor: hasMore && last ? encodeTicketCursor(last) : null,
    hasMore,
    ...(total !== undefined ? { total } : {}),
    page: 1,
    pageSize,
  }
}

/** Lightweight active-teammate list for assign dropdowns, gated by ticket:assign or ticket:create (not user:read). */
export async function listAssignableMembers(ctx: TenantContext, branchId?: ObjectId) {
  if (!can(ctx, "ticket:assign") && !can(ctx, "ticket:create") && !can(ctx, "ticket:read")) {
    return []
  }
  const [allMembers, customRoles] = await Promise.all([
    members
      .forTenant({ ...ctx, branchScope: "all" })
      .find(
        { status: "active" },
        { sort: { name: 1 }, projection: { userId: 1, name: 1, roles: 1, branchIds: 1 } },
      ),
    rolesRepo.forTenant(ctx).find({}),
  ])
  return allMembers
    .filter((m) => {
      const access = resolveAccess(m, customRoles)
      if (branchId) return inBranchScope(access.branchScope, branchId)
      if (ctx.branchScope === "all") return true
      return ctx.branchScope.some((bid) => inBranchScope(access.branchScope, bid))
    })
    .map((m) => ({ userId: m.userId, name: m.name }))
}

async function actorName(ctx: TenantContext): Promise<string> {
  const m = await members.forTenant({ ...ctx, branchScope: "all" }).findOne({ userId: ctx.actorId })
  return m?.name ?? "Staff"
}

async function filterValidAttachments(ctx: TenantContext, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const validObjIds = ids
    .filter((id) => objectId.safeParse(id).success)
    .map((id) => parseInput(objectId, id))
  if (validObjIds.length === 0) return []
  const found = await attachments.forTenant(ctx).find({ _id: { $in: validObjIds } })
  const allowedSet = new Set(
    found
      .filter((a) => !a.branchId || inBranchScope(ctx.branchScope, a.branchId))
      .map((a) => a._id.toHexString()),
  )
  return [...new Set(ids.filter((id) => allowedSet.has(id)))]
}

async function memberCanAccessBranch(
  ctx: TenantContext,
  member: { roles: string[]; branchIds: ObjectId[] },
  branchId: ObjectId,
) {
  const custom = await rolesRepo.forTenant(ctx).find({})
  const access = resolveAccess(member, custom)
  return inBranchScope(access.branchScope, branchId)
}

export async function getTicketDetail(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "ticket:read")
  const id = parseInput(objectId, idRaw)
  const ticket = await tickets.forTenant(ctx).findById(id)
  if (!ticket) throw new ApiError("NOT_FOUND", "Ticket not found.")

  const [comments, activities, category, tenant, allMembers, customRoles, repeatCount30d] =
    await Promise.all([
      ticketComments.forTenant(ctx).find({ ticketId: ticket._id }, { sort: { createdAt: 1 } }),
      ticketActivities.forTenant(ctx).find({ ticketId: ticket._id }, { sort: { at: 1, _id: 1 } }),
      categories.forTenant({ ...ctx, branchScope: "all" }).findById(ticket.categoryId),
      getTenant(ctx.tenantId),
      can(ctx, "ticket:assign")
        ? members
            .forTenant({ ...ctx, branchScope: "all" })
            .find(
              { status: "active" },
              { sort: { name: 1 }, projection: { userId: 1, name: 1, roles: 1, branchIds: 1 } },
            )
        : [],
      can(ctx, "ticket:assign") ? rolesRepo.forTenant(ctx).find({}) : [],
      tickets.forTenant(ctx).count({
        locationId: ticket.locationId,
        categoryId: ticket.categoryId,
        createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) },
      }),
    ])

  const activeMembers = allMembers.filter((m) =>
    inBranchScope(resolveAccess(m, customRoles).branchScope, ticket.branchId),
  )

  const repeatThreshold = tenant?.settings?.repeatRcaThreshold ?? 3
  const rcaRecommended =
    Boolean(category?.requiresRCA) ||
    ticket.severity === "critical" ||
    (ticket.currentLevel ?? 1) >= 3 ||
    repeatCount30d >= repeatThreshold

  return {
    ticket,
    comments,
    activities,
    category,
    members: activeMembers,
    repeatCount30d,
    repeatThreshold,
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

  let explicitAssignee: { userId: string; name: string } | null = null
  if (input.assigneeId) {
    const m = await members
      .forTenant({ ...ctx, branchScope: "all" })
      .findOne({ userId: input.assigneeId, status: "active" })
    if (!m || !(await memberCanAccessBranch(ctx, m, loc.branchId))) {
      throw new ApiError("VALIDATION", "Unknown teammate for this branch.", {
        assigneeId: ["Pick an active teammate with access to this branch"],
      })
    }
    explicitAssignee = { userId: m.userId, name: m.name }
  }

  const validAttachments = await filterValidAttachments(ctx, input.attachments)
  const nameOfActor = await actorName(ctx)
  let allocatedSeq: number | undefined
  const ticket = await withTransaction(async (session) => {
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthlyCount = await tickets
      .forTenant({ ...ctx, branchScope: "all" })
      .count({ createdAt: { $gte: monthStart } }, { session })
    await assertWithinLimit(ctx, "monthlyTickets", monthlyCount, session)

    const assignee =
      explicitAssignee ??
      (await pickAssignee(
        ctx,
        {
          branchId: loc.branchId,
          locationId: loc._id,
          categoryId: cat._id,
          severity: input.severity,
          ancestors: loc.ancestors,
        },
        session,
      ))

    const year = now.getUTCFullYear()
    allocatedSeq ??= await nextSequence(`${ctx.tenantId.toHexString()}:tickets:${year}`)
    const number = `TKT-${year}-${String(allocatedSeq).padStart(6, "0")}`
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
        attachments: validAttachments,
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

  const details: [string, string][] = [
    ["Ticket", ticket.number],
    ["Location", ticket.locationPath.join(" › ")],
    ["Issue", ticket.categoryName],
    ["Priority", ticket.severity],
  ]
  if (ticket.assignee) {
    if (ticket.assignee.userId !== ctx.actorId) {
      await notifyUser(ctx, {
        userId: ticket.assignee.userId,
        type: "ticket.assigned",
        title: `Assigned ${ticket.number} · ${ticket.categoryName}`,
        body: ticket.description.slice(0, 280) || `${ticket.categoryName} needs attention.`,
        href: `/tickets/${ticket._id.toHexString()}`,
        details,
        cta: "Open ticket",
      })
    }
  } else {
    // Unassigned: tell the people who can assign it in this branch (not the creator).
    const assigners = await membersWhoCan(ctx, ["ticket:assign"], ticket.branchId, {
      exclude: ctx.actorId,
    })
    await Promise.allSettled(
      assigners.map((m) =>
        notifyUser(ctx, {
          userId: m.userId,
          type: "ticket.created",
          title: `New ticket ${ticket.number} · ${ticket.categoryName}`,
          body: `Nobody was auto-assigned. ${ticket.description.slice(0, 280)}`,
          href: `/tickets/${ticket._id.toHexString()}`,
          details,
          cta: "Assign ticket",
        }),
      ),
    )
  }

  dispatchWebhookEvent(ctx, "ticket.created", {
    ticketId: ticket._id.toHexString(),
    number: ticket.number,
    source: "manual",
    category: ticket.categoryName,
    severity: ticket.severity,
    location: ticket.locationPath.join(" › "),
    summary: `${ticket.categoryName} at ${ticket.locationPath.join(" › ")} (${ticket.severity})`,
  })

  return ticket
}

export async function applyTicketTransition(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  event: TicketEvent & { resolutionAttachments?: string[] },
) {
  const id = parseInput(objectId, idRaw)
  if ("note" in event && typeof event.note === "string" && event.note.length > 2000) {
    throw new ApiError("VALIDATION", "Keep remarks under 2000 characters.", {
      note: ["Keep remarks under 2000 characters"],
    })
  }
  if ("reason" in event && typeof event.reason === "string" && event.reason.length > 1000) {
    throw new ApiError("VALIDATION", "Keep reasons under 1000 characters.", {
      reason: ["Keep reasons under 1000 characters"],
    })
  }
  if (
    "duplicateOf" in event &&
    typeof event.duplicateOf === "string" &&
    event.duplicateOf.length > 80
  ) {
    throw new ApiError("VALIDATION", "Duplicate ticket number is too long.")
  }

  const resAttachments = await filterValidAttachments(ctx, event.resolutionAttachments ?? [])
  const whoName = await actorName(ctx)
  const note =
    "reason" in event && event.reason
      ? event.reason.trim()
      : "note" in event && event.note
        ? event.note.trim()
        : undefined

  const txResult = await withTransaction(async (session) => {
    const existing = await tickets.forTenant(ctx).findById(id, { session })
    if (!existing) throw new ApiError("NOT_FOUND", "Ticket not found.")

    const cat = await categories
      .forTenant({ ...ctx, branchScope: "all" })
      .findById(existing.categoryId, { session })
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
        .findOne({ userId: event.assigneeId, status: "active" }, { session })
      if (!target || !(await memberCanAccessBranch(ctx, target, existing.branchId))) {
        throw new ApiError("VALIDATION", "Selected teammate is not active in this branch.", {
          assigneeId: ["Pick an active teammate with access to this branch"],
        })
      }
      nextAssignee = { userId: target.userId, name: target.name }
    } else if (check.clearAssignee) {
      nextAssignee = null
    } else if (event.type === "accept" && !nextAssignee) {
      nextAssignee = { userId: ctx.actorId, name: whoName }
    }

    const now = new Date()
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
        $set.resolutionAttachments = [
          ...new Set([...(existing.resolutionAttachments ?? []), ...resAttachments]),
        ]
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
        nextSla.warnedAt = null
        nextSla.levelStartedAt = now
        if (new Date(nextSla.resolveDueAt).getTime() < now.getTime() + graceMs) {
          nextSla.resolveDueAt = new Date(now.getTime() + graceMs)
        }
        nextSla.breached = false
      }
      $set.sla = nextSla
    }

    const doc = await tickets.forTenant(ctx).updateOne(
      { _id: existing._id, status: existing.status },
      {
        $set,
        ...(Object.keys($inc).length ? { $inc } : {}),
      },
      { session },
    )
    if (!doc) {
      throw new ApiError("CONFLICT", "This ticket was updated by someone else. Please refresh.")
    }

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

    return { doc, existing, check, nextAssignee }
  })

  const { doc: updated, existing, check, nextAssignee } = txResult

  // Send targeted notifications outside transaction
  if (event.type === "assign" && nextAssignee && nextAssignee.userId !== ctx.actorId) {
    await notifyUser(ctx, {
      userId: nextAssignee.userId,
      type: check.activityType,
      title: `Assigned ${existing.number} · ${existing.categoryName}`,
      body: note
        ? `${whoName} assigned this to you: ${note}`
        : `${whoName} assigned this ticket to you.`,
      href: `/tickets/${existing._id.toHexString()}`,
      details: [
        ["Ticket", existing.number],
        ["Location", existing.locationPath.join(" › ")],
        ["Issue", existing.categoryName],
        ["Priority", existing.severity],
      ],
      cta: "Open ticket",
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
    // Notify only verifiers / admins who actually have branch access to this ticket
    const [allActive, customRoles] = await Promise.all([
      members.forTenant({ ...ctx, branchScope: "all" }).find({ status: "active" }),
      rolesRepo.forTenant(ctx).find({}),
    ])
    const verifiers = allActive.filter((m) => {
      if (m.userId === ctx.actorId) return false
      const access = resolveAccess(m, customRoles)
      return (
        (access.permissions.has("ticket:verify") || access.permissions.has("ticket:close")) &&
        inBranchScope(access.branchScope, existing.branchId)
      )
    })
    for (const v of verifiers.slice(0, 5)) {
      await notifyUser(ctx, {
        userId: v.userId,
        type: "ticket.submitted",
        title: `Ready to verify ${existing.number}`,
        body: `${whoName} submitted ${existing.locationPath.at(-1)} (${existing.categoryName}) for closure.`,
        href: `/tickets/${existing._id.toHexString()}`,
      })
    }
  }

  if (
    check.nextStatus === "closed" &&
    existing.assignee &&
    existing.assignee.userId !== ctx.actorId
  ) {
    // Close the loop with whoever did the work.
    await notifyUser(ctx, {
      userId: existing.assignee.userId,
      type: "ticket.closed",
      title: `Closed ${existing.number} · ${existing.categoryName}`,
      body: note
        ? `${whoName} verified and closed it: ${note}`
        : `${whoName} verified and closed it.`,
      href: `/tickets/${existing._id.toHexString()}`,
      details: [
        ["Ticket", existing.number],
        ["Location", existing.locationPath.join(" › ")],
      ],
      cta: "View ticket",
    })
  }
  if (check.nextStatus === "closed" && (existing.reporter.email || existing.reporter.phone)) {
    const tenant = await getTenant(ctx.tenantId)
    await notifyReporterClosure({
      tenantName: tenant?.name ?? "QR Feed",
      ticketNumber: existing.number,
      locationName: existing.locationPath.at(-1) ?? "",
      categoryName: existing.categoryName,
      resolutionNote: updated.resolutionNote,
      email: existing.reporter.email,
      phone: existing.reporter.phone,
    })
  }

  dispatchWebhookEvent(ctx, check.nextStatus === "closed" ? "ticket.closed" : "ticket.updated", {
    ticketId: existing._id.toHexString(),
    number: existing.number,
    beforeStatus: existing.status,
    status: check.nextStatus,
    assignee: nextAssignee?.name ?? null,
    summary: `${existing.number} moved ${existing.status} → ${check.nextStatus}`,
  })

  return updated
}

/**
 * Merges a duplicate ticket into a target ticket in a single transaction (phase.md §6.1):
 * transfers reportCount, trackingTokenHashes, and attachments to the target and marks source cancelled.
 */
export async function mergeTicket(
  ctx: TenantContext,
  sourceIdRaw: ObjectId | string,
  targetNumberOrId: string,
  reason = "Merged duplicate ticket",
) {
  assertCan(ctx, "ticket:close")
  const sourceId = parseInput(objectId, sourceIdRaw)
  const targetRef = targetNumberOrId.trim()
  if (!targetRef) {
    throw new ApiError("VALIDATION", "Enter the target ticket number.", {
      target: ["Enter the target ticket number (e.g. TKT-2026-000001)"],
    })
  }
  const whoName = await actorName(ctx)

  return withTransaction(async (session) => {
    const repo = tickets.forTenant(ctx)
    const source = await repo.findById(sourceId, { session })
    if (!source) throw new ApiError("NOT_FOUND", "Source ticket not found.")
    if (source.status === "closed" || source.status === "cancelled") {
      throw new ApiError("CONFLICT", "Only open tickets can be merged.")
    }

    const target = ObjectId.isValid(targetRef)
      ? await repo.findById(targetRef, { session })
      : await repo.findOne({ number: targetRef.toUpperCase() }, { session })
    if (!target) {
      throw new ApiError("NOT_FOUND", `Target ticket "${targetRef}" was not found.`, {
        target: ["Ticket number not found in your scope"],
      })
    }
    if (target._id.equals(source._id)) {
      throw new ApiError("VALIDATION", "Cannot merge a ticket into itself.")
    }

    const now = new Date()
    await repo.updateOne(
      { _id: target._id },
      {
        $inc: { reportCount: source.reportCount },
        $addToSet: {
          trackingTokenHashes: { $each: source.trackingTokenHashes },
          attachments: { $each: source.attachments ?? [] },
        },
        $set: { lastReportedAt: now },
      },
      { session },
    )
    const cancelled = await repo.updateOne(
      { _id: source._id, status: source.status },
      { $set: { status: "cancelled", duplicateOf: target.number } },
      { session },
    )
    if (!cancelled) throw new ApiError("CONFLICT", "Ticket was modified concurrently.")

    await ticketActivities.forTenant(ctx).insertOne(
      {
        branchId: source.branchId,
        ticketId: source._id,
        type: "ticket.merged",
        actorId: ctx.actorId,
        actorName: whoName,
        at: now,
        before: { status: source.status },
        after: { status: "cancelled", duplicateOf: target.number },
        note: `${reason} (merged into ${target.number})`,
      },
      { session },
    )
    await ticketActivities.forTenant(ctx).insertOne(
      {
        branchId: target.branchId,
        ticketId: target._id,
        type: "ticket.merged_in",
        actorId: ctx.actorId,
        actorName: whoName,
        at: now,
        note: `Merged duplicate ${source.number} (+${source.reportCount} report${source.reportCount === 1 ? "" : "s"})`,
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "ticket.merged",
        entity: "ticket",
        entityId: source._id,
        after: { sourceNumber: source.number, targetNumber: target.number },
      },
      { session },
    )
    return { source: cancelled, target }
  })
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
  if (
    !can(ctx, "ticket:work", { branchId: ticket.branchId }) &&
    !can(ctx, "ticket:verify", { branchId: ticket.branchId })
  ) {
    throw new ApiError("FORBIDDEN", "You don't have permission to post remarks on this ticket.")
  }

  const input = parseInput(commentSchema, raw)
  const validAttachments = await filterValidAttachments(ctx, input.attachments)
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
        attachments: validAttachments,
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
        meta: { visibility: input.visibility, attachments: validAttachments.length },
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
  if (
    !can(ctx, "ticket:work", { branchId: ticket.branchId }) &&
    !can(ctx, "ticket:verify", { branchId: ticket.branchId })
  ) {
    throw new ApiError("FORBIDDEN", "You don't have permission to post remarks on this ticket.")
  }
  const tags = [
    ...new Set(rawTags.map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean)),
  ].slice(0, 10)
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
  const canDeleteShared = can(ctx, "settings:manage") || can(ctx, "tenant:manage")
  const filter = canDeleteShared
    ? { _id: id, $or: [{ ownerId: ctx.actorId }, { shared: true }] }
    : { _id: id, ownerId: ctx.actorId }
  const ok = await savedViews.forTenant(ctx).deleteOne(filter)
  if (!ok) throw new ApiError("NOT_FOUND", "Saved view not found.")
}

export type { TicketEventType }
