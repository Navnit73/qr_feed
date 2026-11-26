import type { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import type { BranchScope, TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import {
  isPermission,
  isSystemRole,
  SYSTEM_ROLES,
  type Permission,
  type RoleScope,
} from "@/server/rbac/permissions"

export type CustomRole = { _id: ObjectId; permissions: string[]; scope: RoleScope }

/** Role keys are system keys (`l1_staff`) or `custom:<roleId>`. */
function lookupRole(key: string, custom: CustomRole[]) {
  if (isSystemRole(key)) return SYSTEM_ROLES[key]
  if (key.startsWith("custom:")) {
    const role = custom.find((r) => r._id.toHexString() === key.slice(7))
    if (role) return { scope: role.scope, permissions: role.permissions.filter(isPermission) }
  }
  return null
}

/** A member's effective permissions and branch scope: the union over all their roles. */
export function resolveAccess(
  member: { roles: string[]; branchIds: ObjectId[] },
  customRoles: CustomRole[],
): { permissions: Set<Permission>; branchScope: BranchScope } {
  const permissions = new Set<Permission>()
  let tenantWide = false
  for (const key of member.roles) {
    const role = lookupRole(key, customRoles)
    if (!role) continue
    role.permissions.forEach((p) => permissions.add(p))
    if (role.scope === "tenant") tenantWide = true
  }
  return { permissions, branchScope: tenantWide ? "all" : member.branchIds }
}

export function isKnownRole(key: string, customRoles: CustomRole[]) {
  return lookupRole(key, customRoles) !== null
}

export function can(
  ctx: TenantContext,
  permission: Permission,
  opts: { branchId?: ObjectId } = {},
) {
  if (!ctx.permissions.has(permission)) return false
  if (opts.branchId && !inBranchScope(ctx.branchScope, opts.branchId)) return false
  return true
}

/** The server-side check. UI hiding is a convenience; this is the guarantee. */
export function assertCan(
  ctx: TenantContext,
  permission: Permission,
  opts: { branchId?: ObjectId } = {},
): void {
  if (!can(ctx, permission, opts)) {
    throw new ApiError("FORBIDDEN", "You don't have permission to do that.")
  }
}

/**
 * Nobody can hand out more than they hold: every permission in the granted roles must be one
 * the granter already has, and tenant-wide roles need a tenant-wide granter.
 */
export function canGrantRoles(ctx: TenantContext, roles: string[], customRoles: CustomRole[]) {
  for (const key of roles) {
    const role = lookupRole(key, customRoles)
    if (!role) return false
    if (role.scope === "tenant" && ctx.branchScope !== "all") return false
    if (!role.permissions.every((p) => ctx.permissions.has(p))) return false
  }
  return true
}
