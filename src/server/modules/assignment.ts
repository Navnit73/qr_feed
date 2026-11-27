import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { SEVERITIES, type Severity } from "@/lib/feedback-presets"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { assertCan, resolveAccess } from "@/server/rbac/ability"
import {
  assignmentRules,
  locations,
  members,
  OPEN_TICKET_STATUSES,
  roles as rolesRepo,
  tickets,
  type AssignmentStrategy,
} from "@/server/repositories"
import { name, objectId } from "@/server/validation"

const optionalId = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  objectId.nullish(),
)

const optionalSeverity = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.enum(SEVERITIES).nullish(),
)

const ruleSchema = z.object({
  name: name("rule name", 2),
  priority: z.coerce.number().int().min(1).max(1000).default(10),
  active: z.boolean().default(true),
  conditions: z
    .object({
      branchId: optionalId.optional(),
      locationId: optionalId.optional(),
      categoryId: optionalId.optional(),
      severity: optionalSeverity.optional(),
    })
    .default({}),
  strategy: z.enum(["fixed", "round_robin", "least_loaded"] as const).default("round_robin"),
  userIds: z.array(z.string().min(1)).min(1, "Pick at least one teammate"),
})

export async function listAssignmentRules(ctx: TenantContext) {
  assertCan(ctx, "ticket:assign")
  return assignmentRules.forTenant(ctx).find({}, { sort: { priority: 1, createdAt: 1 } })
}

export async function createAssignmentRule(ctx: TenantContext, raw: z.input<typeof ruleSchema>) {
  assertCan(ctx, "settings:manage")
  const input = parseInput(ruleSchema, raw)
  return withTransaction(async (session) => {
    const doc = await assignmentRules.forTenant(ctx).insertOne(
      {
        name: input.name,
        priority: input.priority,
        active: input.active,
        conditions: {
          branchId: input.conditions.branchId ?? null,
          locationId: input.conditions.locationId ?? null,
          categoryId: input.conditions.categoryId ?? null,
          severity: input.conditions.severity ?? null,
        },
        strategy: input.strategy as AssignmentStrategy,
        userIds: [...new Set(input.userIds)],
        lastAssignedIndex: -1,
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "assignment_rule.created",
        entity: "assignmentRule",
        entityId: doc._id,
        after: { name: doc.name, priority: doc.priority, strategy: doc.strategy },
      },
      { session },
    )
    return doc
  })
}

export async function updateAssignmentRule(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof ruleSchema>,
) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(ruleSchema, raw)
  return withTransaction(async (session) => {
    const updated = await assignmentRules.forTenant(ctx).updateOne(
      { _id: id },
      {
        $set: {
          name: input.name,
          priority: input.priority,
          active: input.active,
          conditions: {
            branchId: input.conditions.branchId ?? null,
            locationId: input.conditions.locationId ?? null,
            categoryId: input.conditions.categoryId ?? null,
            severity: input.conditions.severity ?? null,
          },
          strategy: input.strategy as AssignmentStrategy,
          userIds: [...new Set(input.userIds)],
        },
      },
      { session },
    )
    if (!updated) throw new ApiError("NOT_FOUND", "Assignment rule not found.")
    await appendAudit(
      ctx,
      {
        action: "assignment_rule.updated",
        entity: "assignmentRule",
        entityId: id,
        after: { name: updated.name, priority: updated.priority, strategy: updated.strategy },
      },
      { session },
    )
    return updated
  })
}

export async function toggleAssignmentRule(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  active: boolean,
) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  return withTransaction(async (session) => {
    const updated = await assignmentRules
      .forTenant(ctx)
      .updateOne({ _id: id }, { $set: { active } }, { session })
    if (!updated) throw new ApiError("NOT_FOUND", "Assignment rule not found.")
    await appendAudit(
      ctx,
      {
        action: "assignment_rule.updated",
        entity: "assignmentRule",
        entityId: id,
        after: { active },
      },
      { session },
    )
    return updated
  })
}

export async function deleteAssignmentRule(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  await withTransaction(async (session) => {
    const ok = await assignmentRules.forTenant(ctx).deleteOne({ _id: id }, { session })
    if (!ok) throw new ApiError("NOT_FOUND", "Assignment rule not found.")
    await appendAudit(
      ctx,
      { action: "assignment_rule.deleted", entity: "assignmentRule", entityId: id },
      { session },
    )
  })
}

/**
 * Evaluates active rules ordered by priority (lowest number first); first match with an eligible
 * active teammate in the ticket's branch wins (phase.md §6.3). Matches location conditions against
 * both the exact location and its ancestor hierarchy (e.g. a Floor rule matches all rooms inside it).
 */
export async function pickAssignee(
  ctx: TenantContext,
  target: {
    branchId: ObjectId
    locationId: ObjectId
    categoryId: ObjectId
    severity: Severity
    ancestors?: ObjectId[]
  },
  session?: ClientSession,
): Promise<{ userId: string; name: string } | null> {
  const sys: TenantContext = { ...ctx, branchScope: "all" }
  const rules = await assignmentRules
    .forTenant(sys)
    .find({ active: true }, { sort: { priority: 1, createdAt: 1 }, session })
  if (rules.length === 0) return null

  let ancestors = target.ancestors
  if (!ancestors && rules.some((r) => Boolean(r.conditions.locationId))) {
    const loc = await locations
      .forTenant(sys)
      .findById(target.locationId, { session, projection: { ancestors: 1 } })
    ancestors = loc?.ancestors ?? []
  }
  const locationMatchSet = new Set<string>([
    target.locationId.toHexString(),
    ...(ancestors ?? []).map((a) => a.toHexString()),
  ])

  const matchingRules = rules.filter((r) => {
    if (r.conditions.branchId && !r.conditions.branchId.equals(target.branchId)) return false
    if (r.conditions.locationId && !locationMatchSet.has(r.conditions.locationId.toHexString())) {
      return false
    }
    if (r.conditions.categoryId && !r.conditions.categoryId.equals(target.categoryId)) return false
    if (r.conditions.severity && r.conditions.severity !== target.severity) return false
    return r.userIds.length > 0
  })

  if (matchingRules.length === 0) return null

  const customRoles = await rolesRepo.forTenant(sys).find({}, { session })

  for (const match of matchingRules) {
    const activeMembers = await members
      .forTenant(sys)
      .find({ userId: { $in: match.userIds }, status: "active" }, { session })
    const byId = new Map(activeMembers.map((m) => [m.userId, m]))
    const eligible = match.userIds
      .map((uid) => byId.get(uid))
      .filter((m): m is NonNullable<typeof m> => {
        if (!m) return false
        const access = resolveAccess(m, customRoles)
        return inBranchScope(access.branchScope, target.branchId)
      })
    if (eligible.length === 0) continue

    if (match.strategy === "fixed") {
      return { userId: eligible[0].userId, name: eligible[0].name }
    }

    if (match.strategy === "round_robin") {
      const nextIdx = (match.lastAssignedIndex + 1) % eligible.length
      await assignmentRules
        .forTenant(sys)
        .updateOne({ _id: match._id }, { $set: { lastAssignedIndex: nextIdx } }, { session })
      return { userId: eligible[nextIdx].userId, name: eligible[nextIdx].name }
    }

    // least_loaded: single aggregation (avoids concurrent operations on one MongoDB 7 ClientSession).
    const eligibleIds = eligible.map((m) => m.userId)
    const grouped = await tickets.forTenant(sys).aggregate<{ _id: string; count: number }>(
      [
        {
          $match: {
            "assignee.userId": { $in: eligibleIds },
            status: { $in: OPEN_TICKET_STATUSES },
          },
        },
        { $group: { _id: "$assignee.userId", count: { $sum: 1 } } },
      ],
      { session },
    )
    const loadMap = new Map(grouped.map((g) => [g._id, g.count]))
    const loads = eligible.map((member) => ({ member, count: loadMap.get(member.userId) ?? 0 }))
    loads.sort((a, b) => a.count - b.count)
    return { userId: loads[0].member.userId, name: loads[0].member.name }
  }

  return null
}
