import { isSystemRole, SYSTEM_ROLES } from "@/server/rbac/permissions"

/** Display name for a system or custom role key. */
export function roleLabel(key: string, customRoleNames?: ReadonlyMap<string, string>) {
  if (isSystemRole(key)) return SYSTEM_ROLES[key].label
  if (key.startsWith("custom:")) {
    return customRoleNames?.get(key.slice(7)) ?? "Custom role"
  }
  return "Custom role"
}
