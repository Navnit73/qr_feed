import "server-only"
import { ObjectId } from "mongodb"
import type { TenantContext } from "@/server/db/tenant-context"
import { tenantsCollection } from "@/server/modules/tenants"
import { resolveAccess } from "@/server/rbac/ability"
import { members, roles } from "@/server/repositories"

async function buildContext(
  userId: string,
  member: { tenantId: ObjectId; roles: string[]; branchIds: ObjectId[] },
): Promise<TenantContext> {
  const custom = member.roles.some((r) => r.startsWith("custom:"))
    ? await roles.unscoped().find({ tenantId: member.tenantId }).toArray()
    : []
  const access = resolveAccess(member, custom)
  return {
    tenantId: member.tenantId,
    actorId: userId,
    roles: member.roles,
    permissions: access.permissions,
    branchScope: access.branchScope,
  }
}

/**
 * Turns "signed-in user + exact tenant (optional)" into a TenantContext.
 * When `tenantId` is passed, strictly requires an active membership in that active tenant.
 * Uses a single batch `$in` lookup for active tenants (zero N+1 queries).
 */
export async function resolveTenantContext(
  userId: string,
  tenantId?: ObjectId | string,
): Promise<TenantContext | null> {
  if (tenantId) {
    const tid =
      typeof tenantId === "string"
        ? ObjectId.isValid(tenantId)
          ? new ObjectId(tenantId)
          : null
        : tenantId
    if (!tid) return null
    const [member, tenant] = await Promise.all([
      members.unscoped().findOne({ userId, tenantId: tid, status: "active" }),
      tenantsCollection().findOne({ _id: tid, status: "active" }, { projection: { _id: 1 } }),
    ])
    if (!member || !tenant) return null
    return buildContext(userId, member)
  }

  return resolveSessionTenantContext(userId)
}

/**
 * Single-pass tenant resolver for session cookies: loads all active memberships once,
 * prefers `preferredTenantId` if active, and falls back to the first active org without
 * issuing a second membership query.
 */
export async function resolveSessionTenantContext(
  userId: string,
  preferredTenantId?: string,
): Promise<TenantContext | null> {
  const candidates = await members
    .unscoped()
    .find({ userId, status: "active" })
    .sort({ createdAt: 1 })
    .toArray()
  if (candidates.length === 0) return null

  const preferredObjId =
    preferredTenantId && ObjectId.isValid(preferredTenantId)
      ? new ObjectId(preferredTenantId)
      : null
  const ordered = preferredObjId
    ? [
        ...candidates.filter((m) => m.tenantId.equals(preferredObjId)),
        ...candidates.filter((m) => !m.tenantId.equals(preferredObjId)),
      ]
    : candidates

  const activeTenants = await tenantsCollection()
    .find(
      { _id: { $in: ordered.map((m) => m.tenantId) }, status: "active" },
      { projection: { _id: 1 } },
    )
    .toArray()
  const activeSet = new Set(activeTenants.map((t) => t._id.toHexString()))
  const member = ordered.find((m) => activeSet.has(m.tenantId.toHexString()))
  if (!member) return null
  return buildContext(userId, member)
}

/** Every active organisation the user belongs to, for the tenant switcher. */
export async function listUserTenants(userId: string) {
  const memberships = await members
    .unscoped()
    .find({ userId, status: "active" }, { projection: { tenantId: 1 } })
    .toArray()
  if (!memberships.length) return []
  const tenants = await tenantsCollection()
    .find(
      { _id: { $in: memberships.map((m) => m.tenantId) }, status: "active" },
      { projection: { name: 1, slug: 1 } },
    )
    .toArray()
  return tenants.map((t) => ({ id: t._id.toHexString(), name: t.name, slug: t.slug }))
}
