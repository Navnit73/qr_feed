import type { ObjectId } from "mongodb"
import type { Permission } from "@/server/rbac/permissions"

/** Every branch in the tenant, or an explicit list. */
export type BranchScope = "all" | ObjectId[]

/**
 * Who is acting, in which tenant, with what rights. Built once per request from the session
 * (see src/server/auth/context.ts) and required by every repository call, so tenant
 * scoping can't be forgotten.
 */
export type TenantContext = {
  tenantId: ObjectId
  /** Better Auth user id, or "system" for jobs. Recorded in the audit log. */
  actorId: string
  roles: string[]
  permissions: ReadonlySet<Permission>
  branchScope: BranchScope
}

export function inBranchScope(scope: BranchScope, branchId: ObjectId): boolean {
  return scope === "all" || scope.some((id) => id.equals(branchId))
}
