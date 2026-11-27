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
import {
  getActiveImpersonation,
  getTenantContext,
  requireSuperAdmin,
  type ImpersonationInfo,
} from "@/server/auth/session"
import { listNotifications, unreadNotificationCount } from "@/server/modules/notifications"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { roleLabel } from "@/server/rbac/labels"
import { branches, locations, members, roles, tickets } from "@/server/repositories"
import { stopImpersonationAction } from "./actions"

/**
 * Super admin shell: identical deep-indigo sidebar and sticky top bar as `(app)/layout.tsx`,
 * while also working cleanly for platform Super Admins who don't belong to any tenant yet.
 */
export default function SuperLayout({ children }: LayoutProps<"/super">) {
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
                      <Skeleton className="h-9 w-9 sm:w-48 lg:w-60" />
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

type SuperShellPayload = ShellData & {
  hasTenant: boolean
  impersonation: ImpersonationInfo | null
}

const getSuperShellData = cache(async (): Promise<SuperShellPayload> => {
  const user = await requireSuperAdmin()
  const [ctx, impersonation] = await Promise.all([getTenantContext(), getActiveImpersonation()])

  // Tenantless Super Admin: show the platform navigation inside the same indigo shell.
  if (!ctx) {
    return {
      hasTenant: false,
      impersonation: null,
      orgName: "QR Feed Platform",
      industry: "platform",
      plan: "super admin",
      nav: [
        { href: "/super", label: "Super admin", icon: "superAdmin", group: "Platform" },
        { href: "/onboarding?new=1", label: "New organisation", icon: "branch", group: "Platform" },
      ],
      branches: [],
      unreadNotifications: 0,
      recentNotifications: [],
      usage: [],
      user: {
        name: user.name,
        email: user.email,
        roleLabel: "Super admin",
        isSuperAdmin: true,
        canSettings: false,
      },
    }
  }

  const needsCustomRoleNames = ctx.roles.some((r) => r.startsWith("custom:"))
  const showUsage = can(ctx, "branch:manage")

  const [
    tenant,
    branchDocs,
    customRoles,
    unread,
    recentNotifs,
    pendingVerifyCount,
    locationCount,
    memberCount,
  ] = await Promise.all([
    getTenant(ctx.tenantId),
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
  const canSettings =
    can(ctx, "settings:manage") ||
    can(ctx, "settings:sla") ||
    can(ctx, "tenant:manage") ||
    can(ctx, "billing:manage")
  if (canSettings) {
    nav.push({ href: "/settings", label: "Settings", icon: "settings", group: "Workspace" })
  }
  if (can(ctx, "log:read")) {
    nav.push({ href: "/audit-log", label: "Audit log", icon: "audit", group: "Compliance" })
  }
  nav.push({ href: "/super", label: "Super admin", icon: "superAdmin", group: "Platform" })

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
    hasTenant: true,
    impersonation,
    orgName: tenant?.name ?? "QR Feed Platform",
    industry: tenant?.industry ?? "platform",
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
          : "Super admin",
      isSuperAdmin: true,
      canSettings,
    },
  }
})

async function ImpersonationBanner() {
  const { impersonation } = await getSuperShellData()
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
  return <SidebarBody data={await getSuperShellData()} />
}

async function MobileMenu() {
  return <MobileNav data={await getSuperShellData()} />
}

async function HeaderTools() {
  const data = await getSuperShellData()
  if (!data.hasTenant) return null
  return (
    <>
      <BranchSwitcher branches={data.branches} />
      <CommandSearch nav={data.nav} />
      <NotificationBell unread={data.unreadNotifications} items={data.recentNotifications} />
    </>
  )
}

async function AccountMenu() {
  return <UserMenu user={(await getSuperShellData()).user} />
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
