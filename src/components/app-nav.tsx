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
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
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
                        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:min-h-10",
                        collapsed && "justify-center px-0",
                        active &&
                          "bg-primary/10 text-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary hover:bg-primary/15",
                      )}
                    >
                      <Icon name={item.icon} className={cn("size-4.5", active && "text-success")} />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && !!item.badge && item.badge > 0 && (
                        <Badge variant="secondary" className="px-1.5 text-[11px] tabular-nums">
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
