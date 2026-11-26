"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon, type IconName } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type NavItem = {
  href: string
  label: string
  icon: IconName
  group: string
  badge?: number
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Main navigation, grouped under small headings. Supports full sidebar and compact icon rail.
 * Items arrive pre-filtered by permission from the server; the server checks again on every action.
 */
export function AppNav({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[]
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const groups = [...new Set(items.map((i) => i.group))]

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group}>
          {!collapsed && (
            <p className="mb-1 px-3 text-[0.68rem] font-semibold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
              {group}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {items
              .filter((i) => i.group === group)
              .map((item) => {
                const active = isActivePath(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:min-h-9.5",
                        collapsed && "justify-center px-0",
                        active &&
                          "bg-sidebar-accent font-semibold text-sidebar-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-sidebar-primary",
                      )}
                    >
                      <Icon name={item.icon} className="size-4.5" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && !!item.badge && item.badge > 0 && (
                        <Badge
                          variant="inverse"
                          className="bg-sidebar-primary px-1.5 text-[11px] text-sidebar-primary-foreground tabular-nums"
                        >
                          {item.badge > 99 ? "99+" : item.badge}
                        </Badge>
                      )}
                      {collapsed && <span className="sr-only">{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
