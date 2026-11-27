import { Suspense, cache } from "react"
import type { NavItem } from "@/components/app-nav"
import {
  AppShellFrame,
  BranchSwitcher,
  Brand,
  CommandSearch,
  MobileNav,
  NotificationBell,
  SidebarBody,
  SidebarCollapseButton,
  UserMenu,
  type ShellData,
} from "@/components/app-shell"
import { Icon } from "@/components/icons"
import { PageSkeleton, Skeleton } from "@/components/skeleton"
import { SweetAlertProvider } from "@/components/sweet-alert"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { stopImpersonationAction } from "@/app/super/actions"
import {
  getActiveImpersonation,
  requireTenantContext,
  requireUser,
  type ImpersonationInfo,
} from "@/server/auth/session"
import { listNotifications, unreadNotificationCount } from "@/server/modules/notifications"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { roleLabel } from "@/server/rbac/labels"
import { visibleMenus } from "@/server/rbac/menus"
import { branches, locations, members, roles, tickets } from "@/server/repositories"

/*
 * Signed-in shell: collapsible fixed sidebar from lg up, slide-in drawer below that,
 * and a sticky top bar with branch switcher, ⌘K search, notifications, theme toggle and user menu.
 * Everything that reads the session streams in behind Suspense, as Cache Components requires.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SweetAlertProvider>
      <AppShellFrame
        sidebar={
          <Suspense fallback={<SidebarSkeleton />}>
            <Sidebar />
          </Suspense>
        }
        banner={
          <Suspense fallback={null}>
            <ImpersonationBanner />
          </Suspense>
        }
        header={
          <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
            <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
              <Suspense fallback={<Skeleton className="size-11 lg:hidden" />}>
                <MobileMenu />
              </Suspense>
              <SidebarCollapseButton />
              <Brand className="mr-2" labelClassName="hidden text-primary sm:inline" />
              <div className="ml-auto flex items-center gap-1.5">
                <Suspense
                  fallback={
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="hidden h-9 w-28 md:block" />
                      <Skeleton className="h-9 w-9 sm:w-48 lg:w-60" />
                      <Skeleton className="size-11 rounded-lg" />
                    </div>
                  }
                >
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
    </SweetAlertProvider>
  )
}

type ShellPayload = ShellData & { impersonation: ImpersonationInfo | null }

// One lookup per request, shared by the sidebar, drawer, header tools, banner and account menu.
const getShellData = cache(async (): Promise<ShellPayload> => {
  const ctx = await requireTenantContext()
  const needsCustomRoleNames = ctx.roles.some((r) => r.startsWith("custom:"))
  const showUsage = can(ctx, "branch:manage")

  const [
    user,
    tenant,
    impersonation,
    branchDocs,
    customRoles,
    unread,
    recentNotifs,
    pendingVerifyCount,
    locationCount,
    memberCount,
  ] = await Promise.all([
    requireUser(),
    getTenant(ctx.tenantId),
    getActiveImpersonation(),
    can(ctx, "branch:read")
      ? branches
          .forTenant(ctx)
          .find({ status: "active" }, { sort: { name: 1 }, limit: 50, projection: { name: 1 } })
      : [],
    needsCustomRoleNames ? roles.forTenant(ctx).find({}, { projection: { name: 1 } }) : [],
    unreadNotificationCount(ctx),
    listNotifications(ctx, 8),
    can(ctx, "ticket:verify") || can(ctx, "ticket:close")
      ? tickets.forTenant(ctx).count({ status: "pending_verification" })
      : 0,
    showUsage ? locations.forTenant(ctx).count({ status: "active" }) : 0,
    showUsage ? members.forTenant(ctx).count({ status: "active" }) : 0,
  ])

  const customNames = new Map(customRoles.map((r) => [r._id.toHexString(), r.name]))

  // The UI hides what you can't do; the server checks again on every action. Members can also
  // have menus switched off by an admin (Users → Edit access), which visibleMenus applies.
  const nav: NavItem[] = visibleMenus(ctx).map((m) => ({
    href: m.href,
    label: m.label,
    icon: m.icon,
    group: m.group,
    badge: m.key === "verifications" ? pendingVerifyCount || undefined : undefined,
  }))
  const canSettings = nav.some((i) => i.href === "/settings")
  if (user.isSuperAdmin) {
    nav.push({ href: "/super", label: "Super admin", icon: "superAdmin", group: "Platform" })
  }

  // Plan usage is for the people who can grow the plan; reuse branchDocs length when under cap.
  const usage: ShellData["usage"] = []
  if (tenant && showUsage) {
    const branchCount =
      branchDocs.length < 50
        ? branchDocs.length
        : await branches.forTenant(ctx).count({ status: "active" })
    usage.push(
      { label: "Branches", used: branchCount, limit: tenant.limits.branches },
      { label: "Locations", used: locationCount, limit: tenant.limits.locations },
      { label: "Users", used: memberCount, limit: tenant.limits.users },
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
      roleLabel: impersonation
        ? "Super admin (impersonating)"
        : ctx.roles[0]
          ? roleLabel(ctx.roles[0], customNames)
          : "",
      isSuperAdmin: user.isSuperAdmin,
      canSettings,
    },
    impersonation,
  }
})

async function ImpersonationBanner() {
  const { impersonation } = await getShellData()
  if (!impersonation) return null
  return (
    <div
      role="status"
      className="border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm text-foreground sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          <Icon name="warning" className="size-4 shrink-0 text-warning" />
          <span>
            <strong>Impersonating {impersonation.tenantName}</strong> — {impersonation.reason}
          </span>
        </p>
        <form action={stopImpersonationAction}>
          <Button type="submit" size="sm" variant="outline">
            Exit impersonation
          </Button>
        </form>
      </div>
    </div>
  )
}

async function Sidebar() {
  return <SidebarBody data={await getShellData()} />
}

async function MobileMenu() {
  return <MobileNav data={await getShellData()} />
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
      <Skeleton className="h-9 w-32 bg-sidebar-accent" />
      <Skeleton className="h-14 w-full bg-sidebar-accent" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full bg-sidebar-accent" />
      ))}
    </div>
  )
}
