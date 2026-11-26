import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import { appendAudit } from "@/server/audit/audit-log"
import { db } from "@/server/db/client"
import type { TenantContext } from "@/server/db/tenant-context"

/*
 * The tenants collection is global (it defines tenants), so it lives outside the scoped
 * repositories. Only onboarding, session resolution and the super-admin console touch it.
 */

export const INDUSTRIES = ["hospital", "clinic", "hotel", "mall", "manufacturing", "other"] as const
export type Industry = (typeof INDUSTRIES)[number]

export type PlanLimits = { branches: number; users: number; locations: number }
export const TRIAL_LIMITS: PlanLimits = { branches: 3, users: 15, locations: 200 }

export type TenantRecord = {
  _id: ObjectId
  name: string
  slug: string
  industry: Industry
  plan: "trial" | "starter" | "growth" | "business" | "enterprise"
  status: "active" | "suspended"
  limits: PlanLimits
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export const tenantsCollection = () => db().collection<TenantRecord>("tenants")

export async function getTenant(tenantId: ObjectId, session?: ClientSession) {
  return tenantsCollection().findOne({ _id: tenantId }, { session })
}

/** Throws CONFLICT when adding one more would pass the plan's limit. */
export async function assertWithinLimit(
  ctx: TenantContext,
  kind: keyof PlanLimits,
  currentCount: number,
  session?: ClientSession,
) {
  const tenant = await getTenant(ctx.tenantId, session)
  const limit = tenant?.limits[kind] ?? 0
  if (currentCount >= limit) {
    throw new ApiError(
      "CONFLICT",
      `Your plan allows ${limit} ${kind}. Upgrade the plan or archive one first.`,
    )
  }
}

// ── Super-admin console ──────────────────────────────────────────────────────────────

export async function listTenants() {
  return tenantsCollection().find({}).sort({ createdAt: -1 }).limit(500).toArray()
}

/** A context for platform staff acting inside a tenant: logged, never permission-bearing. */
function platformContext(actorId: string, tenantId: ObjectId): TenantContext {
  return { tenantId, actorId, roles: ["super_admin"], permissions: new Set(), branchScope: "all" }
}

export async function setTenantStatus({
  actorId,
  tenantId,
  status,
}: {
  actorId: string
  tenantId: ObjectId
  status: TenantRecord["status"]
}) {
  const before = await getTenant(tenantId)
  if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
  if (before.status === status) return before
  const after = await tenantsCollection().findOneAndUpdate(
    { _id: tenantId },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  await appendAudit(platformContext(actorId, tenantId), {
    action: status === "suspended" ? "tenant.suspended" : "tenant.reactivated",
    entity: "tenant",
    entityId: tenantId,
    before: { status: before.status },
    after: { status },
  })
  return after!
}

export async function setTenantLimits({
  actorId,
  tenantId,
  limits,
}: {
  actorId: string
  tenantId: ObjectId
  limits: PlanLimits
}) {
  const before = await getTenant(tenantId)
  if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
  await tenantsCollection().updateOne(
    { _id: tenantId },
    { $set: { limits, updatedAt: new Date() } },
  )
  await appendAudit(platformContext(actorId, tenantId), {
    action: "tenant.limits_changed",
    entity: "tenant",
    entityId: tenantId,
    before: before.limits,
    after: limits,
  })
}
