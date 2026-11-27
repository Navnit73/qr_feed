import type { IconName } from "@/components/icons"
import type { TenantContext } from "@/server/db/tenant-context"
import { can } from "@/server/rbac/ability"

/*
 * Sidebar menus and who may see them. Two filters apply, and both must pass:
 *   1. permissions: a role has to allow the page at all (the security boundary);
 *   2. the member's own menu list (`members.menus`), an admin's way to declutter or narrow
 *      someone's workspace. `null` means "every menu their roles allow".
 * Pages of a hidden menu are also blocked (see `requireTenantContext`), not just unlisted.
 */

export type MenuDef = {
  key: string
  href: string
  label: string
  icon: IconName
  group: string
  allowed: (ctx: TenantContext) => boolean
}

const DASHBOARD: MenuDef = {
  key: "dashboard",
  href: "/dashboard",
  label: "Dashboard",
  icon: "dashboard",
  group: "Overview",
  allowed: () => true,
}

/** Menus an admin can switch on or off per member. Dashboard is the landing page, so it stays. */
export const CONFIGURABLE_MENUS = [
  {
    key: "tickets",
    href: "/tickets",
    label: "Tickets",
    icon: "ticket",
    group: "Overview",
    allowed: (ctx) => can(ctx, "ticket:read"),
  },
  {
    key: "my-work",
    href: "/my-work",
    label: "My Work",
    icon: "myWork",
    group: "Overview",
    allowed: (ctx) => can(ctx, "ticket:read"),
  },
  {
    key: "surveys",
    href: "/surveys",
    label: "Surveys",
    icon: "feedback",
    group: "Overview",
    allowed: (ctx) => can(ctx, "qr:read"),
  },
  {
    key: "verifications",
    href: "/verifications",
    label: "Verifications",
    icon: "verify",
    group: "Overview",
    allowed: (ctx) => can(ctx, "ticket:verify") || can(ctx, "ticket:close"),
  },
  {
    key: "rca",
    href: "/rca",
    label: "RCA & CAPA",
    icon: "rca",
    group: "Quality",
    allowed: (ctx) => can(ctx, "rca:read"),
  },
  {
    key: "audits",
    href: "/audits",
    label: "Audits",
    icon: "audit",
    group: "Quality",
    allowed: (ctx) => can(ctx, "audit:read"),
  },
  {
    key: "reports",
    href: "/reports",
    label: "Reports",
    icon: "report",
    group: "Insights",
    allowed: (ctx) => can(ctx, "report:read"),
  },
  {
    key: "branches",
    href: "/branches",
    label: "Branches",
    icon: "branch",
    group: "Workspace",
    allowed: (ctx) => can(ctx, "branch:read"),
  },
  {
    key: "users",
    href: "/users",
    label: "Users",
    icon: "users",
    group: "Workspace",
    allowed: (ctx) => can(ctx, "user:read"),
  },
  {
    key: "settings",
    href: "/settings",
    label: "Settings",
    icon: "settings",
    group: "Workspace",
    allowed: (ctx) =>
      can(ctx, "settings:manage") ||
      can(ctx, "settings:sla") ||
      can(ctx, "tenant:manage") ||
      can(ctx, "billing:manage"),
  },
  {
    key: "audit-log",
    href: "/audit-log",
    label: "Audit log",
    icon: "audit",
    group: "Compliance",
    allowed: (ctx) => can(ctx, "log:read"),
  },
] as const satisfies readonly MenuDef[]

export type MenuKey = (typeof CONFIGURABLE_MENUS)[number]["key"]
export const MENU_KEYS = CONFIGURABLE_MENUS.map((m) => m.key) as [MenuKey, ...MenuKey[]]

const ALL_MENUS: readonly MenuDef[] = [DASHBOARD, ...CONFIGURABLE_MENUS]

// Personal pages that live under a menu's path but belong to everyone.
const ALWAYS_OPEN = ["/settings/notifications"]

function under(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Menus for the sidebar, in order: allowed by the roles and by the member's menu list. */
export function visibleMenus(ctx: TenantContext): MenuDef[] {
  return ALL_MENUS.filter(
    (m) => m.allowed(ctx) && (m === DASHBOARD || !ctx.menus || ctx.menus.has(m.key)),
  )
}

export function menuForPath(pathname: string): MenuDef | undefined {
  return ALL_MENUS.find((m) => under(pathname, m.href))
}

/** False only when the path belongs to a menu this member has had switched off. */
export function canSeePath(ctx: TenantContext, pathname: string): boolean {
  if (!ctx.menus) return true
  if (ALWAYS_OPEN.some((p) => under(pathname, p))) return true
  const menu = menuForPath(pathname)
  if (!menu || menu === DASHBOARD) return true
  return ctx.menus.has(menu.key)
}

/**
 * `undefined` = leave unchanged, `null` = no restriction. Picking every menu is stored as
 * `null`, so menus added to the product later show up for that person too.
 */
export function normalizeMenus(menus: readonly string[] | null | undefined) {
  if (menus === undefined || menus === null) return menus
  const picked = new Set(menus)
  if (MENU_KEYS.every((k) => picked.has(k))) return null
  return MENU_KEYS.filter((k) => picked.has(k)) as string[]
}
