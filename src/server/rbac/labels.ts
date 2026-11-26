import { isSystemRole, SYSTEM_ROLES } from "@/server/rbac/permissions"

/** Display name for a role key. Custom roles show as "Custom role" until P1 role editing lands. */
export function roleLabel(key: string) {
  return isSystemRole(key) ? SYSTEM_ROLES[key].label : "Custom role"
}
