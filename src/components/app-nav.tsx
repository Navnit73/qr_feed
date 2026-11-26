"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon, type IconName } from "@/components/icons"
import { cn } from "@/lib/utils"

export type NavItem = { href: string; label: string; icon: IconName }

/**
 * Main navigation. A sidebar from lg up; on phones a row that scrolls inside itself (the page
 * never does). Items are pre-filtered on the server by permission.
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-1 lg:flex-col">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-primary/10 text-foreground hover:bg-primary/15",
                )}
              >
                <Icon name={item.icon} className={cn("size-4", active && "text-success")} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
