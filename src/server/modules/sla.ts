import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { SEVERITIES, type Severity } from "@/lib/feedback-presets"
import { addBusinessMinutes, DEFAULT_BUSINESS_HOURS } from "@/lib/sla-calculator"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { notifyReporterClosure, notifyUser } from "@/server/modules/notifications"
import { dispatchWebhookEvent } from "@/server/modules/platform"
import { getTenant, tenantsCollection } from "@/server/modules/tenants"
import { assertCan, can, resolveAccess } from "@/server/rbac/ability"
import {
  branches,
  capas,
  categories,
  escalationEvents,
  members,
  rcas,
  roles as rolesRepo,
  slaPolicies,
  ticketActivities,
  tickets,
  type SlaLevelConfig,
  type TicketDoc,
  type TicketSlaState,
} from "@/server/repositories"
import { name, objectId } from "@/server/validation"

const levelSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  acceptWithinMin: z.coerce.number().int().min(1).max(10080),
  resolveWithinMin: z.coerce.number().int().min(5).max(43200),
  escalateAfterMin: z.coerce.number().int().min(5).max(43200),
  targetRole: z.string().min(1).default("l2_supervisor"),
  targetUserId: z.string().optional().nullable(),
  action: z.enum(["notify", "transfer", "both"]).default("both"),
})

const optionalId = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  objectId.nullish(),
)

const optionalSeverity = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.enum(SEVERITIES).nullish(),
)

const policySchema = z.object({
  name: name("SLA policy name", 2),
  active: z.boolean().default(true),
  businessHoursMode: z.enum(["24x7", "business_hours"]).default("business_hours"),
  appliesTo: z
    .object({
      branchId: optionalId.optional(),
      categoryId: optionalId.optional(),
      severity: optionalSeverity.optional(),
    })
    .default({}),
  levels: z.array(levelSchema).min(1, "Define at least Level 1").max(3),
})

export async function listSlaPolicies(ctx: TenantContext) {
  if (!can(ctx, "ticket:read") && !can(ctx, "settings:sla")) {
    throw new ApiError("FORBIDDEN", "You don't have permission to view SLA policies.")
  }
  return slaPolicies.forTenant(ctx).find({}, { sort: { createdAt: 1 } })
}

export async function createSlaPolicy(ctx: TenantContext, raw: z.input<typeof policySchema>) {
  assertCan(ctx, "settings:sla")
  const input = parseInput(policySchema, raw)
  const levels = [...input.levels].sort((a, b) => a.level - b.level) as SlaLevelConfig[]
  return withTransaction(async (session) => {
    const doc = await slaPolicies.forTenant(ctx).insertOne(
      {
        name: input.name,
        active: input.active,
        businessHoursMode: input.businessHoursMode,
        appliesTo: {
          branchId: input.appliesTo.branchId ?? null,
          categoryId: input.appliesTo.categoryId ?? null,
          severity: input.appliesTo.severity ?? null,
        },
        levels,
        pauseStatuses: ["on_hold"],
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "sla_policy.created",
        entity: "slaPolicy",
        entityId: doc._id,
        after: { name: doc.name, mode: doc.businessHoursMode, levels: doc.levels.length },
      },
      { session },
    )
    return doc
  })
}

export async function updateSlaPolicy(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof policySchema>,
) {
  assertCan(ctx, "settings:sla")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(policySchema, raw)
  const levels = [...input.levels].sort((a, b) => a.level - b.level) as SlaLevelConfig[]
  return withTransaction(async (session) => {
    const updated = await slaPolicies.forTenant(ctx).updateOne(
      { _id: id },
      {
        $set: {
          name: input.name,
          active: input.active,
          businessHoursMode: input.businessHoursMode,
          appliesTo: {
            branchId: input.appliesTo.branchId ?? null,
            categoryId: input.appliesTo.categoryId ?? null,
            severity: input.appliesTo.severity ?? null,
          },
          levels,
        },
      },
      { session },
    )
    if (!updated) throw new ApiError("NOT_FOUND", "SLA policy not found.")
    await appendAudit(
      ctx,
      {
        action: "sla_policy.updated",
        entity: "slaPolicy",
        entityId: id,
        after: { name: updated.name, active: updated.active, mode: updated.businessHoursMode },
      },
      { session },
    )
    return updated
  })
}

export async function deleteSlaPolicy(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "settings:sla")
  const id = parseInput(objectId, idRaw)
  await withTransaction(async (session) => {
    const ok = await slaPolicies.forTenant(ctx).deleteOne({ _id: id }, { session })
    if (!ok) throw new ApiError("NOT_FOUND", "SLA policy not found.")
    await appendAudit(
      ctx,
      { action: "sla_policy.deleted", entity: "slaPolicy", entityId: id },
      { session },
    )
  })
}

function policySpecificity(
  p: {
    appliesTo: {
      branchId?: ObjectId | null
      categoryId?: ObjectId | null
      severity?: Severity | null
    }
  },
  target: { branchId: ObjectId; categoryId: ObjectId; severity: Severity },
): number {
  let score = 0
  if (p.appliesTo.branchId) {
    if (!p.appliesTo.branchId.equals(target.branchId)) return -1
    score += 2
  }
  if (p.appliesTo.categoryId) {
    if (!p.appliesTo.categoryId.equals(target.categoryId)) return -1
    score += 4
  }
  if (p.appliesTo.severity) {
    if (p.appliesTo.severity !== target.severity) return -1
    score += 8
  }
  return score
}

/**
 * Matches the most specific active SLA policy and computes initial L1 due dates
 * using the branch's timezone, business hours and holidays (phase.md §6.2).
 */
export async function computeInitialTicketSla(
  ctx: TenantContext,
  target: { branchId: ObjectId; categoryId: ObjectId; severity: Severity; createdAt: Date },
  session?: ClientSession,
): Promise<{ slaPolicyId: ObjectId; sla: TicketSlaState } | null> {
  const sys: TenantContext = { ...ctx, branchScope: "all" }
  const policies = await slaPolicies.forTenant(sys).find({ active: true }, { session })
  if (policies.length === 0) return null

  const cat = await categories
    .forTenant(sys)
    .findById(target.categoryId, { session, projection: { slaPolicyId: 1 } })
  const pinnedPolicy = cat?.slaPolicyId
    ? policies.find((p) => p._id.equals(cat.slaPolicyId!))
    : undefined

  const ranked = policies
    .map((p) => ({ p, score: policySpecificity(p, target) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)

  const match = pinnedPolicy ?? ranked[0]?.p
  if (!match) return null
  const l1 = match.levels.find((l) => l.level === 1) ?? match.levels[0]
  if (!l1) return null

  const branch = await branches.forTenant(sys).findById(target.branchId, {
    session,
    projection: { timezone: 1, businessHours: 1, holidays: 1 },
  })
  const calcOpts = {
    mode: match.businessHoursMode,
    timezone: branch?.timezone ?? "UTC",
    businessHours: branch?.businessHours ?? DEFAULT_BUSINESS_HOURS,
    holidays: branch?.holidays ?? [],
  }

  return {
    slaPolicyId: match._id,
    sla: {
      acceptDueAt: addBusinessMinutes(target.createdAt, l1.acceptWithinMin, calcOpts),
      resolveDueAt: addBusinessMinutes(
        target.createdAt,
        Math.min(l1.resolveWithinMin, l1.escalateAfterMin || l1.resolveWithinMin),
        calcOpts,
      ),
      levelStartedAt: target.createdAt,
      acceptedAt: null,
      resolvedAt: null,
      breached: false,
      acceptBreached: false,
      warnedAt: null,
      pausedAt: null,
      pausedMs: 0,
    },
  }
}

export async function listEscalationEvents(ctx: TenantContext, ticketIdRaw?: ObjectId | string) {
  assertCan(ctx, "ticket:read")
  if (ticketIdRaw) {
    const ticketId = parseInput(objectId, ticketIdRaw)
    return escalationEvents.forTenant(ctx).find({ ticketId }, { sort: { at: 1 } })
  }
  return escalationEvents.forTenant(ctx).find({}, { sort: { at: -1 }, limit: 100 })
}

async function resolveEscalationTargets(
  sys: TenantContext,
  branchId: ObjectId,
  levelCfg: SlaLevelConfig,
) {
  const customRoles = await rolesRepo.forTenant(sys).find({})
  const hasBranchAccess = (m: { roles: string[]; branchIds: ObjectId[] }) => {
    const access = resolveAccess(m, customRoles)
    return inBranchScope(access.branchScope, branchId)
  }

  if (levelCfg.targetUserId) {
    const specific = await members
      .forTenant(sys)
      .findOne({ userId: levelCfg.targetUserId, status: "active" })
    if (specific && hasBranchAccess(specific)) return [specific]
  }
  const activeMembers = await members.forTenant(sys).find({ status: "active" })
  const byRole = activeMembers.filter(
    (m) => m.roles.includes(levelCfg.targetRole) && hasBranchAccess(m),
  )
  if (byRole.length > 0) return byRole

  const byPerm = activeMembers.filter((m) => {
    const access = resolveAccess(m, customRoles)
    return (
      access.permissions.has("ticket:escalate.receive") &&
      inBranchScope(access.branchScope, branchId)
    )
  })
  if (byPerm.length > 0) return byPerm

  // Fallback to org admins if no specific level supervisor is assigned
  return activeMembers.filter((m) => m.roles.includes("org_admin"))
}

/**
 * Safety-net & scheduler sweep (phase.md §6.2, F-4.3 & F-4.7).
 * Idempotent under concurrency and worker/Redis restarts: atomic conditional updates guarantee
 * every pre-breach warning and L1->L2->L3 escalation executes at most once.
 * Pass `opts.tenantId` for tenant-scoped manual sweeps so callers never touch other tenants.
 */
export async function sweepSlaEscalations(now = new Date(), opts: { tenantId?: ObjectId } = {}) {
  const activeTenantIds = opts.tenantId
    ? (await getTenant(opts.tenantId))?.status === "active"
      ? [opts.tenantId]
      : []
    : (
        await tenantsCollection()
          .find({ status: "active" }, { projection: { _id: 1 } })
          .toArray()
      ).map((t) => t._id)

  if (activeTenantIds.length === 0) {
    return { checked: 0, warned: 0, escalated: 0 }
  }

  const cursor = tickets.unscoped().find({
    tenantId: opts.tenantId ? opts.tenantId : { $in: activeTenantIds },
    status: { $in: ["new", "assigned", "accepted", "in_progress", "reopened"] },
    "sla.resolveDueAt": { $exists: true },
    "sla.pausedAt": null,
    $nor: [{ currentLevel: { $gte: 3 }, "sla.breached": true }],
  })

  let checked = 0
  let warned = 0
  let escalated = 0

  for await (const raw of cursor) {
    const t = raw as TicketDoc
    checked++
    if (!t.sla || !t.slaPolicyId) continue
    const sys: TenantContext = {
      tenantId: t.tenantId,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }

    const windowStart = t.sla.levelStartedAt ?? t.createdAt
    const paused =
      t.sla.levelStartedAt && t.sla.levelStartedAt > t.createdAt ? 0 : (t.sla.pausedMs ?? 0)
    const totalMs = Math.max(60_000, t.sla.resolveDueAt.getTime() - windowStart.getTime() - paused)
    const elapsedMs = now.getTime() - windowStart.getTime() - paused
    const ratio = elapsedMs / totalMs

    // 1. Pre-breach warning at >=80% (idempotent via conditional warnedAt === null)
    if (ratio >= 0.8 && ratio < 1 && !t.sla.warnedAt) {
      const claimed = await tickets
        .forTenant(sys)
        .updateOne({ _id: t._id, "sla.warnedAt": null }, { $set: { "sla.warnedAt": now } })
      if (claimed) {
        warned++
        await ticketActivities.forTenant(sys).insertOne({
          branchId: t.branchId,
          ticketId: t._id,
          type: "sla.warning",
          actorId: "system",
          actorName: "SLA Engine",
          at: now,
          note: "80% of resolution SLA elapsed.",
        })
        if (t.assignee) {
          await notifyUser(sys, {
            userId: t.assignee.userId,
            type: "sla.warning",
            title: `SLA warning · ${t.number}`,
            body: `${t.categoryName} at ${t.locationPath.at(-1)} is approaching its L${t.currentLevel ?? 1} deadline.`,
            href: `/tickets/${t._id.toHexString()}`,
            channels: ["in_app", "email"],
          })
        }
      }
    }

    // 2. Breach & escalation check
    const breachedNow = now.getTime() >= t.sla.resolveDueAt.getTime()
    const acceptBreached = !t.sla.acceptedAt && now.getTime() >= t.sla.acceptDueAt.getTime()
    if (!breachedNow && !acceptBreached) continue

    const fromLevel = (t.currentLevel ?? 1) as 1 | 2 | 3
    if (fromLevel >= 3) {
      if (!t.sla.breached && breachedNow) {
        await tickets
          .forTenant(sys)
          .updateOne({ _id: t._id, "sla.breached": false }, { $set: { "sla.breached": true } })
      }
      continue
    }

    const policy = await slaPolicies.forTenant(sys).findById(t.slaPolicyId)
    const nextLevel = (fromLevel + 1) as 2 | 3
    const nextCfg = policy?.levels.find((l) => l.level === nextLevel)
    if (!policy || !nextCfg) {
      if (breachedNow && !t.sla.breached) {
        await tickets
          .forTenant(sys)
          .updateOne({ _id: t._id, "sla.breached": false }, { $set: { "sla.breached": true } })
      } else if (acceptBreached && !t.sla.acceptBreached) {
        await tickets
          .forTenant(sys)
          .updateOne({ _id: t._id }, { $set: { "sla.acceptBreached": true } })
      }
      continue
    }

    // Only escalate on resolve breach; log & notify on acceptance SLA breach separately.
    if (!breachedNow) {
      if (!t.sla.acceptBreached) {
        const claimedAccept = await tickets
          .forTenant(sys)
          .updateOne(
            { _id: t._id, "sla.acceptBreached": { $ne: true } },
            { $set: { "sla.acceptBreached": true } },
          )
        if (claimedAccept) {
          await ticketActivities.forTenant(sys).insertOne({
            branchId: t.branchId,
            ticketId: t._id,
            type: "sla.accept_breached",
            actorId: "system",
            actorName: "SLA Engine",
            at: now,
            note: `L${fromLevel} acceptance SLA breached.`,
          })
          if (t.assignee) {
            await notifyUser(sys, {
              userId: t.assignee.userId,
              type: "sla.warning",
              title: `Acceptance overdue · ${t.number}`,
              body: `${t.categoryName} at ${t.locationPath.at(-1)} has not been accepted within the SLA target.`,
              href: `/tickets/${t._id.toHexString()}`,
              channels: ["in_app", "email"],
            })
          }
        }
      }
      continue
    }

    const targets = await resolveEscalationTargets(sys, t.branchId, nextCfg)
    const branch = await branches.forTenant(sys).findById(t.branchId)
    const calcOpts = {
      mode: policy.businessHoursMode,
      timezone: branch?.timezone ?? "UTC",
      businessHours: branch?.businessHours ?? DEFAULT_BUSINESS_HOURS,
      holidays: branch?.holidays ?? [],
    }
    const nextResolveDue = addBusinessMinutes(now, nextCfg.resolveWithinMin, calcOpts)
    const shouldTransfer = nextCfg.action === "transfer" || nextCfg.action === "both"
    const nextOwner =
      shouldTransfer && targets[0]
        ? { userId: targets[0].userId, name: targets[0].name }
        : (t.assignee ?? null)

    const notifiedIds = targets.map((m) => m.userId)
    const reason = `L${fromLevel} resolution SLA breached`

    // Atomic transaction with conditional currentLevel guarantees exactly-once escalation + consistent audit/activity
    const didEscalate = await withTransaction(async (session) => {
      const claimed = await tickets.forTenant(sys).updateOne(
        { _id: t._id, currentLevel: fromLevel, "sla.pausedAt": null },
        {
          $set: {
            ...(t.status === "new" && nextOwner ? { status: "assigned" } : {}),
            currentLevel: nextLevel,
            assignee: nextOwner,
            "sla.breached": true,
            "sla.resolveDueAt": nextResolveDue,
            "sla.levelStartedAt": now,
            "sla.warnedAt": null,
          },
        },
        { session },
      )
      if (!claimed) return false

      await escalationEvents.forTenant(sys).insertOne(
        {
          branchId: t.branchId,
          ticketId: t._id,
          ticketNumber: t.number,
          fromLevel: fromLevel as 1 | 2,
          toLevel: nextLevel,
          reason,
          action: nextCfg.action,
          at: now,
          notifiedUserIds: notifiedIds,
          transferredToUserId: shouldTransfer ? (targets[0]?.userId ?? null) : null,
        },
        { session },
      )
      await ticketActivities.forTenant(sys).insertOne(
        {
          branchId: t.branchId,
          ticketId: t._id,
          type: "sla.escalated",
          actorId: "system",
          actorName: "SLA Engine",
          at: now,
          before: { level: fromLevel, assignee: t.assignee?.name ?? null },
          after: { level: nextLevel, assignee: nextOwner?.name ?? null },
          note: reason,
        },
        { session },
      )
      return true
    })

    if (!didEscalate) continue
    escalated++

    for (const target of targets) {
      await notifyUser(sys, {
        userId: target.userId,
        type: "sla.escalated",
        title: `Escalated to L${nextLevel} · ${t.number}`,
        body: `${t.categoryName} at ${t.locationPath.join(" › ")} breached L${fromLevel} SLA.`,
        href: `/tickets/${t._id.toHexString()}`,
        channels: ["in_app", "email", "sms", "whatsapp"],
      })
    }

    await dispatchWebhookEvent(
      sys,
      "sla.escalated",
      {
        ticketId: t._id.toHexString(),
        number: t.number,
        fromLevel,
        toLevel: nextLevel,
        assignee: nextOwner?.name ?? null,
        summary: `${t.number} escalated L${fromLevel} → L${nextLevel} (${t.categoryName})`,
      },
      { inline: true },
    )
  }

  return { checked, warned, escalated }
}

/** Fast MongoDB $group aggregation for SLA compliance metrics (no 5,000-doc client scan). */
export async function slaComplianceMetrics(ctx: TenantContext, days = 30) {
  assertCan(ctx, "ticket:read")
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await tickets
    .forTenant(ctx)
    .aggregate<{ _id: null; total: number; breached: number }>([
      { $match: { createdAt: { $gte: since }, "sla.resolveDueAt": { $exists: true } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          breached: { $sum: { $cond: [{ $eq: ["$sla.breached", true] }, 1, 0] } },
        },
      },
    ])
  const total = rows[0]?.total ?? 0
  const breached = rows[0]?.breached ?? 0
  const met = total - breached
  const compliancePct = total > 0 ? Math.round((met / total) * 100) : null
  return { total, met, breached, compliancePct }
}

/**
 * Auto-closes `pending_verification` tickets older than the tenant's configured `autoCloseDays`
 * (phase.md F-5.4). Only scans active tenants with auto-close enabled, avoiding starvation.
 */
export async function sweepAutoClose(now = new Date()): Promise<number> {
  const configuredTenants = await tenantsCollection()
    .find(
      { status: "active", "settings.autoCloseDays": { $gt: 0 } },
      { projection: { _id: 1, "settings.autoCloseDays": 1 } },
    )
    .toArray()

  if (configuredTenants.length === 0) return 0

  const tenantDays = new Map<string, number>(
    configuredTenants.map((t) => [t._id.toHexString(), t.settings?.autoCloseDays ?? 0]),
  )

  const cursor = tickets.unscoped().find({
    tenantId: { $in: configuredTenants.map((t) => t._id) },
    status: "pending_verification",
  })

  let closed = 0
  for await (const raw of cursor) {
    const t = raw as TicketDoc
    const days = tenantDays.get(t.tenantId.toHexString()) ?? 0
    if (days <= 0) continue

    const refTime = t.submittedForVerificationAt ?? t.updatedAt ?? t.createdAt
    if (now.getTime() - refTime.getTime() < days * 86_400_000) continue

    const sys: TenantContext = {
      tenantId: t.tenantId,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }
    const didClose = await withTransaction(async (session) => {
      const updated = await tickets
        .forTenant(sys)
        .updateOne(
          { _id: t._id, status: "pending_verification" },
          { $set: { status: "closed", closedAt: now } },
          { session },
        )
      if (!updated) return false
      await ticketActivities.forTenant(sys).insertOne(
        {
          branchId: t.branchId,
          ticketId: t._id,
          type: "ticket.auto_closed",
          actorId: "system",
          actorName: "Auto-close",
          at: now,
          before: { status: "pending_verification" },
          after: { status: "closed" },
          note: `Auto-closed after ${days} days without further action.`,
        },
        { session },
      )
      return true
    })
    if (didClose) {
      closed++
      if (t.reporter.email || t.reporter.phone) {
        const tenant = await getTenant(t.tenantId)
        await notifyReporterClosure({
          tenantName: tenant?.name ?? "QR Feed",
          ticketNumber: t.number,
          locationName: t.locationPath.at(-1) ?? "",
          categoryName: t.categoryName,
          resolutionNote: t.resolutionNote,
          email: t.reporter.email,
          phone: t.reporter.phone,
        })
      }
    }
  }
  return closed
}

/**
 * Overdue CAPA action reminders & effectiveness-check due alerts (phase.md §6.6, P6).
 * Idempotent: stamps `remindedAt` per action so owners are reminded at most once per 24h.
 */
export async function sweepOverdueCapas(now = new Date()): Promise<{ reminded: number }> {
  const activeTenantIds = (
    await tenantsCollection()
      .find({ status: "active" }, { projection: { _id: 1 } })
      .toArray()
  ).map((t) => t._id)
  if (activeTenantIds.length === 0) return { reminded: 0 }

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const cursor = capas.unscoped().find({
    tenantId: { $in: activeTenantIds },
    status: { $in: ["open", "in_progress", "pending_effectiveness"] },
  })

  let reminded = 0
  for await (const capa of cursor) {
    const sys: TenantContext = {
      tenantId: capa.tenantId,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }

    let changed = false
    const nextActions = capa.actions.map((a) => {
      if (a.status === "completed" || a.status === "verified") return a
      if (a.dueDate.getTime() >= now.getTime()) return a
      if (a.remindedAt && a.remindedAt.getTime() > dayAgo.getTime()) return a
      changed = true
      return { ...a, remindedAt: now }
    })

    if (changed) {
      await capas.forTenant(sys).updateOne({ _id: capa._id }, { $set: { actions: nextActions } })
      const rca = await rcas
        .forTenant(sys)
        .findById(capa.rcaId, { projection: { ownerId: 1, number: 1 } })

      for (const a of nextActions) {
        if (a.remindedAt?.getTime() !== now.getTime()) continue
        reminded++
        const daysOverdue = Math.max(
          1,
          Math.floor((now.getTime() - a.dueDate.getTime()) / 86_400_000),
        )
        await notifyUser(sys, {
          userId: a.ownerId,
          type: "capa.overdue",
          title: `Overdue CAPA action · ${capa.number}`,
          body: `"${a.title}" is ${daysOverdue}d past its due date.`,
          href: `/rca/${capa.rcaId.toHexString()}`,
          channels: ["in_app", "email"],
        })
        // Escalate actions >3 days overdue to the RCA owner as well.
        if (daysOverdue >= 3 && rca?.ownerId && rca.ownerId !== a.ownerId) {
          await notifyUser(sys, {
            userId: rca.ownerId,
            type: "capa.overdue",
            title: `Escalation: CAPA action ${daysOverdue}d overdue · ${capa.number}`,
            body: `${a.ownerName}'s action "${a.title}" on ${rca.number} is overdue.`,
            href: `/rca/${capa.rcaId.toHexString()}`,
            channels: ["in_app", "email"],
          })
        }
      }
    }
  }
  return { reminded }
}
