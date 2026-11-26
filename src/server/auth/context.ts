import "server-only"
import { ObjectId } from "mongodb"
import type { TenantContext } from "@/server/db/tenant-context"
import { tenantsCollection } from "@/server/modules/tenants"
import { resolveAccess } from "@/server/rbac/ability"
import { members, roles } from "@/server/repositories"

/**
 * Turns "signed-in user + chosen tenant" into a TenantContext. Returns null when the user isn't
 * an active member of an active tenant, so suspensions and deactivations take effect on the
 * very next request.
 */
export async function resolveTenantContext(
  userId: string,
  tenantId?: ObjectId | string,
): Promise<TenantContext | null> {
  const filter: Record<string, unknown> = { userId, status: "active" }
  if (tenantId) {
    if (typeof tenantId === "string" && !ObjectId.isValid(tenantId)) return null
    filter.tenantId = typeof tenantId === "string" ? new ObjectId(tenantId) : tenantId
  }
  // Global lookup by design: this is how a session finds its tenants in the first place.
  const candidates = await members.unscoped().find(filter).sort({ createdAt: 1 }).toArray()

  for (const member of candidates) {
    const tenant = await tenantsCollection().findOne({ _id: member.tenantId, status: "active" })
    if (!tenant) continue
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
  return null
}

/** Every active organisation the user belongs to, for the tenant switcher. */
export async function listUserTenants(userId: string) {
  const memberships = await members.unscoped().find({ userId, status: "active" }).toArray()
  if (!memberships.length) return []
  const tenants = await tenantsCollection()
    .find({ _id: { $in: memberships.map((m) => m.tenantId) }, status: "active" })
    .toArray()
  return tenants.map((t) => ({ id: t._id.toHexString(), name: t.name, slug: t.slug }))
}
