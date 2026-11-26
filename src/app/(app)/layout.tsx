import { Suspense, cache } from "react"
import type { NavItem } from "@/components/app-nav"
import {
  AppShellFrame,
  BranchSwitcher,
  Brand,
  CommandSearch,
  HeaderTitle,
  MobileNav,
  NotificationBell,
  SidebarBody,
  SidebarCollapseButton,
  UserMenu,
  type ShellData,
} from "@/components/app-shell"
import { PageSkeleton, Skeleton } from "@/components/skeleton"
import { ThemeToggle } from "@/components/theme-toggle"
import { requireTenantContext, requireUser } from "@/server/auth/session"
import { listNotifications, unreadNotificationCount } from "@/server/modules/notifications"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { roleLabel } from "@/server/rbac/labels"
import { branches, locations, members, roles, tickets } from "@/server/repositories"

/*
 * Signed-in shell: collapsible fixed sidebar from lg up, slide-in drawer below that,
 * and a sticky top bar with branch switcher, ⌘K search, notifications, theme toggle and user menu.
 * Everything that reads the session streams in behind Suspense, as Cache Components requires.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShellFrame
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      }
      header={
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
            <Suspense fallback={<Skeleton className="size-11 lg:hidden" />}>
              <MobileMenu />
            </Suspense>
            <SidebarCollapseButton />
            <Brand className="mr-2 lg:hidden" labelClassName="hidden sm:inline" />
            <Suspense fallback={null}>
              <SectionTitle />
            </Suspense>
            <div className="ml-auto flex items-center gap-1.5">
              <Suspense fallback={null}>
                <HeaderTools />
              </Suspense>
              <ThemeToggle />
              <Suspense fallback={<Skeleton className="size-11 rounded-full" />}>
                <AccountMenu />
              </Suspense>
            </div>
          </div>
        </header>
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </AppShellFrame>
  )
}

// One lookup per request, shared by the sidebar, drawer, header tools and account menu.
const getShellData = cache(async (): Promise<ShellData> => {
  const ctx = await requireTenantContext()
  const [user, tenant, branchDocs, customRoles, unread, recentNotifs, pendingVerifyCount] =
    await Promise.all([
      requireUser(),
      getTenant(ctx.tenantId),
      can(ctx, "branch:read")
        ? branches.forTenant(ctx).find({ status: "active" }, { sort: { name: 1 }, limit: 50 })
        : [],
      roles.forTenant(ctx).find({}),
      unreadNotificationCount(ctx),
      listNotifications(ctx, 8),
      can(ctx, "ticket:verify") || can(ctx, "ticket:close")
        ? tickets.forTenant(ctx).count({ status: "pending_verification" })
        : 0,
    ])

  const customNames = new Map(customRoles.map((r) => [r._id.toHexString(), r.name]))

  // The UI hides what you can't do; the server checks again on every action.
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", group: "Overview" },
  ]
  if (can(ctx, "ticket:read")) {
    nav.push({ href: "/tickets", label: "Tickets", icon: "ticket", group: "Overview" })
    nav.push({ href: "/my-work", label: "My Work", icon: "myWork", group: "Overview" })
  }
  if (can(ctx, "ticket:verify") || can(ctx, "ticket:close")) {
    nav.push({
      href: "/verifications",
      label: "Verifications",
      icon: "verify",
      group: "Overview",
      badge: pendingVerifyCount || undefined,
    })
  }
  if (can(ctx, "rca:read")) {
    nav.push({ href: "/rca", label: "RCA & CAPA", icon: "rca", group: "Quality" })
  }
  if (can(ctx, "audit:read")) {
    nav.push({ href: "/audits", label: "Audits", icon: "audit", group: "Quality" })
  }
  if (can(ctx, "report:read")) {
    nav.push({ href: "/reports", label: "Reports", icon: "report", group: "Insights" })
  }
  if (can(ctx, "branch:read")) {
    nav.push({ href: "/branches", label: "Branches", icon: "branch", group: "Workspace" })
  }
  if (can(ctx, "user:read")) {
    nav.push({ href: "/users", label: "Users", icon: "users", group: "Workspace" })
  }
  if (can(ctx, "settings:manage") || can(ctx, "settings:sla") || can(ctx, "tenant:manage")) {
    nav.push({ href: "/settings", label: "Settings", icon: "settings", group: "Workspace" })
  }
  if (can(ctx, "log:read")) {
    nav.push({ href: "/audit-log", label: "Audit log", icon: "audit", group: "Compliance" })
  }
  if (user.isSuperAdmin) {
    nav.push({ href: "/super", label: "Super admin", icon: "superAdmin", group: "Platform" })
  }

  // Plan usage is for the people who can grow the plan.
  const usage: ShellData["usage"] = []
  if (tenant && can(ctx, "branch:manage")) {
    const [b, l, m] = await Promise.all([
      branches.forTenant(ctx).count({ status: "active" }),
      locations.forTenant(ctx).count({ status: "active" }),
      members.forTenant(ctx).count({ status: "active" }),
    ])
    usage.push(
      { label: "Branches", used: b, limit: tenant.limits.branches },
      { label: "Locations", used: l, limit: tenant.limits.locations },
      { label: "Users", used: m, limit: tenant.limits.users },
    )
  }

  return {
    orgName: tenant?.name ?? "",
    industry: tenant?.industry ?? "",
    plan: tenant?.plan ?? "trial",
    nav,
    branches: branchDocs.map((b) => ({ id: b._id.toHexString(), name: b.name })),
    unreadNotifications: unread,
    recentNotifications: recentNotifs.map((n) => ({
      id: n._id.toHexString(),
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
    usage,
    user: {
      name: user.name,
      email: user.email,
      roleLabel: ctx.roles[0] ? roleLabel(ctx.roles[0], customNames) : "",
      isSuperAdmin: user.isSuperAdmin,
    },
  }
})

async function Sidebar() {
  return <SidebarBody data={await getShellData()} />
}

async function MobileMenu() {
  return <MobileNav data={await getShellData()} />
}

async function SectionTitle() {
  return <HeaderTitle nav={(await getShellData()).nav} />
}

async function HeaderTools() {
  const data = await getShellData()
  return (
    <>
      <BranchSwitcher branches={data.branches} />
      <CommandSearch nav={data.nav} />
      <NotificationBell unread={data.unreadNotifications} items={data.recentNotifications} />
    </>
  )
}

async function AccountMenu() {
  return <UserMenu user={(await getShellData()).user} />
}

function SidebarSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-14 w-full" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
