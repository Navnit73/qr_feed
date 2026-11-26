"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { AppNav, isActivePath, type NavItem } from "@/components/app-nav"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

/** Plain data the server hands the shell: no ObjectIds, no Dates. */
export type ShellData = {
  orgName: string
  industry: string
  plan: string
  nav: NavItem[]
  branches: { id: string; name: string }[]
  unreadNotifications: number
  recentNotifications: {
    id: string
    title: string
    body: string
    href?: string
    read: boolean
    createdAt: string
  }[]
  usage: { label: string; used: number; limit: number }[]
  user: { name: string; email: string; roleLabel: string; isSuperAdmin: boolean }
}

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
})

const SIDEBAR_KEY = "qrfeed.sidebar"
const sidebarListeners = new Set<() => void>()
function subscribeSidebar(cb: () => void) {
  sidebarListeners.add(cb)
  return () => {
    sidebarListeners.delete(cb)
  }
}
function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed"
  } catch {
    return false
  }
}

/** Wraps the signed-in frame so desktop users can collapse the sidebar into an icon rail. */
export function AppShellFrame({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
}) {
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false)

  function toggle() {
    const next = !readSidebarCollapsed()
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded")
    } catch {
      // Ignore storage restrictions
    }
    for (const cb of sidebarListeners) cb()
  }

  return (
    <SidebarContext value={{ collapsed, toggle }}>
      <div
        className={cn(
          "min-h-dvh transition-[padding] duration-200",
          collapsed ? "lg:pl-18" : "lg:pl-64",
        )}
      >
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:block",
            collapsed ? "w-18" : "w-64",
          )}
        >
          {sidebar}
        </aside>
        {header}
        <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </SidebarContext>
  )
}

export function SidebarCollapseButton() {
  const { collapsed, toggle } = useContext(SidebarContext)
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="hidden lg:inline-flex"
    >
      <Icon name="sidebar" />
    </Button>
  )
}

export function Brand({
  className,
  labelClassName,
  compact = false,
}: {
  className?: string
  labelClassName?: string
  compact?: boolean
}) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Icon name="qr" className="size-5" />
      </span>
      {!compact && (
        <span className={cn("text-base font-bold tracking-tight", labelClassName)}>QR Feed</span>
      )}
    </Link>
  )
}

/** Sidebar contents, shared by the desktop rail and the mobile drawer. */
export function SidebarBody({
  data,
  onNavigate,
  forceExpanded = false,
}: {
  data: ShellData
  onNavigate?: () => void
  forceExpanded?: boolean
}) {
  const { collapsed: ctxCollapsed } = useContext(SidebarContext)
  const collapsed = forceExpanded ? false : ctxCollapsed

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <Brand compact={collapsed} />
      </div>

      {!collapsed && (
        <div className="mx-3 mt-4 mb-4 rounded-xl border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold" title={data.orgName}>
              {data.orgName}
            </p>
            <Badge
              variant={data.plan === "trial" ? "secondary" : "muted"}
              className="shrink-0 capitalize"
            >
              {data.plan}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground capitalize">
            {data.industry} workspace
          </p>
        </div>
      )}

      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", collapsed ? "px-2 pt-3" : "px-3")}>
        <AppNav items={data.nav} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      {!collapsed && data.usage.length > 0 && (
        <div className="m-3 rounded-xl border bg-card p-3">
          <p className="mb-2.5 flex items-center justify-between text-xs font-semibold">
            <span className="capitalize">{data.plan} usage</span>
            <Link href="/settings" className="font-medium text-success hover:underline">
              Manage
            </Link>
          </p>
          <ul className="space-y-2.5">
            {data.usage.map((u) => {
              const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0
              return (
                <li key={u.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{u.label}</span>
                    <span className="font-medium tabular-nums">
                      {u.used}/{u.limit}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${u.label} used`}
                    aria-valuenow={u.used}
                    aria-valuemax={u.limit}
                  >
                    <div
                      className={cn("h-full rounded-full", pct >= 90 ? "bg-warning" : "bg-primary")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Phones and tablets: the sidebar slides in from the left. */
export function MobileNav({ data }: { data: ShellData }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-xl" aria-label="Open menu" className="lg:hidden" />
        }
      >
        <MenuGlyph />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-background p-0 sm:max-w-72">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SidebarBody data={data} forceExpanded onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    </svg>
  )
}

/** The current section's name in the header, from the same list the sidebar uses. */
export function HeaderTitle({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname()
  const item = nav.find((i) => isActivePath(pathname, i.href))
  if (!item) return null
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
      <Icon name={item.icon} className="hidden text-muted-foreground sm:block" />
      <span className="truncate">{item.label}</span>
    </p>
  )
}

/** Quick branch switcher in the top header bar (phase.md §8). */
export function BranchSwitcher({ branches }: { branches: ShellData["branches"] }) {
  const router = useRouter()
  if (branches.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Switch branch"
            className="hidden h-9 max-w-44 gap-2 md:inline-flex"
          />
        }
      >
        <Icon name="branch" className="size-3.5 text-muted-foreground" />
        <span className="truncate">
          {branches.length === 1 ? branches[0].name : `${branches.length} branches`}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Jump to branch</DropdownMenuLabel>
          <DropdownMenuItem className="min-h-9" onClick={() => router.push("/tickets")}>
            <Icon name="ticket" /> All branches · Tickets
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {branches.map((b) => (
            <DropdownMenuItem
              key={b.id}
              className="min-h-9"
              onClick={() => router.push(`/branches/${b.id}`)}
            >
              <Icon name="branch" /> <span className="truncate">{b.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type SearchResult = {
  tickets: { id: string; number: string; category: string; location: string; status: string }[]
  locations: { id: string; branchId: string; name: string; path: string }[]
}

/** Global ⌘K command palette searching pages, tickets and locations. */
export function CommandSearch({ nav }: { nav: NavItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult>({ tickets: [], locations: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const json = await res.json().catch(() => null)
        if (!cancelled && json?.ok) setResults(json.data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery("")
      setResults({ tickets: [], locations: [] })
    }
  }

  const qLower = query.trim().toLowerCase()
  const matchingPages = nav.filter((n) => !qLower || n.label.toLowerCase().includes(qLower))
  const visibleResults = qLower.length >= 2 ? results : { tickets: [], locations: [] }

  function go(href: string) {
    handleOpenChange(false)
    router.push(href)
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title="Quick search"
      description="Jump to a page, ticket number or location."
      trigger={
        <Button
          variant="outline"
          size="sm"
          aria-label="Search"
          className="h-9 gap-2 text-muted-foreground sm:w-48 sm:justify-between lg:w-60"
        >
          <span className="flex items-center gap-2">
            <Icon name="search" className="size-3.5" />
            <span className="hidden sm:inline">Search…</span>
          </span>
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tickets (TKT-…), locations or pages…"
          className="h-11"
        />

        <div className="max-h-72 space-y-4 overflow-y-auto">
          {matchingPages.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase">Pages</p>
              <ul className="space-y-1">
                {matchingPages.map((p) => (
                  <li key={p.href}>
                    <button
                      type="button"
                      onClick={() => go(p.href)}
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-accent"
                    >
                      <Icon name={p.icon} className="text-muted-foreground" />
                      <span>{p.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleResults.tickets.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase">
                Tickets
              </p>
              <ul className="space-y-1">
                {visibleResults.tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => go(`/tickets/${t.id}`)}
                      className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm hover:bg-accent"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs text-muted-foreground">{t.number}</span>{" "}
                        · {t.category} ({t.location})
                      </span>
                      <Badge variant="muted" className="shrink-0 capitalize">
                        {t.status.replaceAll("_", " ")}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleResults.locations.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase">
                Locations
              </p>
              <ul className="space-y-1">
                {visibleResults.locations.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => go(`/branches/${l.branchId}`)}
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-accent"
                    >
                      <Icon name="location" className="text-muted-foreground" />
                      <span className="truncate">{l.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
        </div>
      </div>
    </Modal>
  )
}

/** Notification bell in the sticky top bar. */
export function NotificationBell({
  unread,
  items,
}: {
  unread: number
  items: ShellData["recentNotifications"]
}) {
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(unread)

  async function markAllRead() {
    setUnreadCount(0)
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => {})
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xl" aria-label="Notifications" className="relative" />
        }
      >
        <Icon name="notification" className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-success hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <DropdownMenuSeparator />
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            items.slice(0, 5).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-0.5 px-2 py-2"
                onClick={() => router.push(n.href || "/notifications")}
              >
                <span className="flex w-full items-center gap-1.5 text-sm font-medium">
                  {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                  <span className="truncate">{n.title}</span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-9 justify-center text-xs font-medium text-success"
            onClick={() => router.push("/notifications")}
          >
            View all notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase()
}

export function UserMenu({ user }: { user: ShellData["user"] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label="Account menu"
            loading={pending}
            className="h-11 gap-2.5 rounded-full pr-2 pl-1 sm:pr-3"
          />
        }
      >
        <Avatar>
          <AvatarFallback className="bg-foreground text-xs font-semibold text-background">
            {initials(user.name) || <Icon name="user" />}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-36 truncate text-sm font-medium md:block">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block truncate text-sm font-semibold text-foreground">
              {user.name}
            </span>
            <span className="block truncate font-normal">{user.email}</span>
            {user.roleLabel && (
              <Badge variant="muted" className="mt-1.5">
                {user.roleLabel}
              </Badge>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10 px-2" onClick={() => router.push("/settings")}>
          <Icon name="settings" /> Workspace settings
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 px-2" onClick={() => router.push("/notifications")}>
          <Icon name="notification" /> Notifications
        </DropdownMenuItem>
        {user.isSuperAdmin && (
          <DropdownMenuItem className="min-h-10 px-2" onClick={() => router.push("/super")}>
            <Icon name="superAdmin" /> Super admin console
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="min-h-10 px-2"
          onClick={() => router.push("/onboarding?new=1")}
        >
          <Icon name="branch" /> New organisation
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="min-h-10 px-2" onClick={signOut}>
          <Icon name="signOut" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
