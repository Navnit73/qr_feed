import Link from "next/link"
import { Suspense } from "react"
import { AppNav, type NavItem } from "@/components/app-nav"
import { Icon } from "@/components/icons"
import { SignOutButton } from "@/components/sign-out-button"
import { PageSkeleton, Skeleton } from "@/components/skeleton"
import { ThemeToggle } from "@/components/theme-toggle"
import { requireTenantContext, requireUser } from "@/server/auth/session"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"

/*
 * Signed-in shell. The frame is static and renders instantly; everything that reads the
 * session (tenant name, permission-filtered nav, the page) streams in behind Suspense, as
 * Cache Components requires. Each page re-checks the session itself.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Icon name="qr" className="size-5" />
            </span>
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <TenantBadge />
            </Suspense>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton compact />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-8 lg:py-8">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-24">
            <Suspense fallback={<Skeleton className="h-11 w-full" />}>
              <MainNav />
            </Suspense>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-12">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
    </div>
  )
}

async function TenantBadge() {
  const ctx = await requireTenantContext()
  const [user, tenant] = await Promise.all([requireUser(), getTenant(ctx.tenantId)])
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm leading-tight font-semibold">{tenant?.name}</span>
      <span className="block truncate text-xs text-muted-foreground">{user.name}</span>
    </span>
  )
}

async function MainNav() {
  const ctx = await requireTenantContext()
  const user = await requireUser()
  // The UI hides what you can't do; the server checks again on every action.
  const nav: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }]
  if (can(ctx, "ticket:read")) nav.push({ href: "/tickets", label: "Tickets", icon: "ticket" })
  if (can(ctx, "branch:read")) nav.push({ href: "/branches", label: "Branches", icon: "branch" })
  if (can(ctx, "user:read")) nav.push({ href: "/users", label: "Users", icon: "users" })
  if (can(ctx, "log:read")) nav.push({ href: "/audit-log", label: "Audit log", icon: "audit" })
  if (user.isSuperAdmin) nav.push({ href: "/super", label: "Super admin", icon: "superAdmin" })
  return <AppNav items={nav} />
}
