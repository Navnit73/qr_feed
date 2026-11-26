import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/cards/empty-state"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requireTenantContext } from "@/server/auth/session"
import { getDashboardStats } from "@/server/modules/dashboard"
import { can } from "@/server/rbac/ability"

export const metadata: Metadata = { title: "Dashboard · QR Feed" }

export default async function DashboardPage() {
  const ctx = await requireTenantContext()
  const stats = await getDashboardStats(ctx)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your organisation at a glance. SLA metrics arrive with the escalation engine."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.tickets && (
          <>
            <StatCard featured label="Open tickets" value={stats.tickets.open} icon="ticket" />
            <StatCard
              label="Reports in the last 24 h"
              value={stats.tickets.last24h}
              icon="feedback"
            />
            <StatCard
              label="Average rating (30 days)"
              value={stats.tickets.avgRating ?? "–"}
              icon="rating"
            />
          </>
        )}
        {stats.branchCount !== null && (
          <StatCard label="Branches" value={stats.branchCount} icon="branch" />
        )}
        {stats.locationCount !== null && (
          <StatCard label="Locations" value={stats.locationCount} icon="location" />
        )}
        {stats.memberCount !== null && (
          <StatCard label="Team members" value={stats.memberCount} icon="users" />
        )}
      </div>

      {stats.locationCount === 0 && can(ctx, "location:manage") && (
        <EmptyState
          className="mt-8"
          icon="location"
          title="Map your first locations"
          description="Add the floors, rooms and spots where you'll put QR codes. Each one becomes a place guests can report from."
          action={
            <Link href="/branches" className={buttonVariants({ size: "xl" })}>
              <Icon name="branch" data-icon="inline-start" /> Go to branches
            </Link>
          }
        />
      )}
    </>
  )
}
