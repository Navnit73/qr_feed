import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { SEVERITIES, type Severity } from "@/lib/feedback-presets"
import { addBusinessMinutes, DEFAULT_BUSINESS_HOURS } from "@/lib/sla-calculator"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { notifyUser } from "@/server/modules/notifications"
import { getTenant } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import {
  branches,
  escalationEvents,
  members,
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
  assertCan(ctx, "ticket:read")
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

  const ranked = policies
    .map((p) => ({ p, score: policySpecificity(p, target) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)

  const match = ranked[0]?.p
  if (!match) return null
  const l1 = match.levels.find((l) => l.level === 1) ?? match.levels[0]
  if (!l1) return null

  const branch = await branches.forTenant(sys).findById(target.branchId, { session })
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
      resolveDueAt: addBusinessMinutes(target.createdAt, l1.resolveWithinMin, calcOpts),
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
  if (levelCfg.targetUserId) {
    const specific = await members
      .forTenant(sys)
      .findOne({ userId: levelCfg.targetUserId, status: "active" })
    if (specific) return [specific]
  }
  const byRole = await members.forTenant(sys).find({
    status: "active",
    roles: levelCfg.targetRole,
    $or: [{ branchIds: branchId }, { branchIds: { $size: 0 } }],
  })
  if (byRole.length > 0) return byRole
  // Fallback to org admins if no specific level supervisor is assigned
  return members.forTenant(sys).find({ status: "active", roles: "org_admin" })
}

/**
 * Safety-net & scheduler sweep (phase.md §6.2, F-4.3 & F-4.7).
 * Idempotent under concurrency and worker/Redis restarts: atomic conditional updates guarantee
 * every pre-breach warning and L1->L2->L3 escalation executes at most once.
 */
export async function sweepSlaEscalations(now = new Date()) {
  const openRaw = await tickets
    .unscoped()
    .find({
      status: { $in: ["new", "assigned", "accepted", "in_progress", "reopened"] },
      "sla.resolveDueAt": { $exists: true },
      "sla.pausedAt": null,
    })
    .limit(500)
    .toArray()

  let warned = 0
  let escalated = 0

  for (const t of openRaw as TicketDoc[]) {
    if (!t.sla || !t.slaPolicyId) continue
    const sys: TenantContext = {
      tenantId: t.tenantId,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }

    const totalMs = Math.max(60_000, t.sla.resolveDueAt.getTime() - t.createdAt.getTime())
    const elapsedMs = now.getTime() - t.createdAt.getTime() - (t.sla.pausedMs ?? 0)
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
      await tickets
        .forTenant(sys)
        .updateOne({ _id: t._id, "sla.breached": false }, { $set: { "sla.breached": true } })
      continue
    }

    // Only escalate on resolve breach (or if policy escalates after accept window)
    if (!breachedNow) {
      if (!t.sla.acceptBreached) {
        await tickets
          .forTenant(sys)
          .updateOne({ _id: t._id }, { $set: { "sla.acceptBreached": true } })
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

    // Atomic conditional update on currentLevel guarantees exactly-once escalation!
    const claimed = await tickets.forTenant(sys).updateOne(
      { _id: t._id, currentLevel: fromLevel, "sla.pausedAt": null },
      {
        $set: {
          currentLevel: nextLevel,
          assignee: nextOwner,
          "sla.breached": true,
          "sla.resolveDueAt": nextResolveDue,
          "sla.warnedAt": null,
        },
      },
    )
    if (!claimed) continue

    escalated++
    const notifiedIds = targets.map((m) => m.userId)
    const reason = `L${fromLevel} resolution SLA breached`

    await Promise.all([
      escalationEvents.forTenant(sys).insertOne({
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
      }),
      ticketActivities.forTenant(sys).insertOne({
        branchId: t.branchId,
        ticketId: t._id,
        type: "sla.escalated",
        actorId: "system",
        actorName: "SLA Engine",
        at: now,
        before: { level: fromLevel, assignee: t.assignee?.name ?? null },
        after: { level: nextLevel, assignee: nextOwner?.name ?? null },
        note: reason,
      }),
    ])

    for (const target of targets) {
      await notifyUser(sys, {
        userId: target.userId,
        type: "sla.escalated",
        title: `Escalated to L${nextLevel} · ${t.number}`,
        body: `${t.categoryName} at ${t.locationPath.join(" › ")} breached L${fromLevel} SLA.`,
        href: `/tickets/${t._id.toHexString()}`,
        channels: ["in_app", "email", "sms"],
      })
    }
  }

  return { checked: openRaw.length, warned, escalated }
}

export async function slaComplianceMetrics(ctx: TenantContext, days = 30) {
  assertCan(ctx, "ticket:read")
  const since = new Date(Date.now() - days * 86_400_000)
  const list = await tickets
    .forTenant(ctx)
    .find({ createdAt: { $gte: since }, "sla.resolveDueAt": { $exists: true } }, { limit: 5000 })
  const total = list.length
  const breached = list.filter((t) => t.sla?.breached).length
  const met = total - breached
  const compliancePct = total > 0 ? Math.round((met / total) * 100) : null
  return { total, met, breached, compliancePct }
}

/**
 * Auto-closes `pending_verification` tickets older than the tenant's configured `autoCloseDays`
 * (phase.md F-5.4). Idempotent via status condition.
 */
export async function sweepAutoClose(now = new Date()): Promise<number> {
  const candidates = await tickets
    .unscoped()
    .find({ status: "pending_verification" })
    .limit(500)
    .toArray()

  const tenantDays = new Map<string, number>()
  let closed = 0

  for (const t of candidates as TicketDoc[]) {
    const key = t.tenantId.toHexString()
    let days = tenantDays.get(key)
    if (days === undefined) {
      const tenant = await getTenant(t.tenantId)
      days = tenant?.settings?.autoCloseDays ?? 0
      tenantDays.set(key, days)
    }
    if (!days || days <= 0) continue

    const refTime = t.submittedForVerificationAt ?? t.updatedAt ?? t.createdAt
    if (now.getTime() - refTime.getTime() < days * 86_400_000) continue

    const sys: TenantContext = {
      tenantId: t.tenantId,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }
    const updated = await tickets
      .forTenant(sys)
      .updateOne(
        { _id: t._id, status: "pending_verification" },
        { $set: { status: "closed", closedAt: now } },
      )
    if (!updated) continue
    closed++
    await ticketActivities.forTenant(sys).insertOne({
      branchId: t.branchId,
      ticketId: t._id,
      type: "ticket.auto_closed",
      actorId: "system",
      actorName: "Auto-close",
      at: now,
      before: { status: "pending_verification" },
      after: { status: "closed" },
      note: `Auto-closed after ${days} days without further action.`,
    })
  }
  return closed
}
