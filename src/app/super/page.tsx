import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/skeleton"
import { Badge } from "@/components/ui/badge"
import { requireSuperAdmin } from "@/server/auth/session"
import { getPlatformHealth } from "@/server/db/health"
import { listTenants } from "@/server/modules/tenants"
import { TenantPlanDialog } from "./tenant-plan-dialog"
import { TenantStatusButton } from "./tenant-status-button"

export const metadata: Metadata = { title: "Super admin · QR Feed", robots: { index: false } }

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" })

/** Platform console (phase.md P1 & P10): every tenant, plan limits, status & platform health. */
export default function SuperAdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageSkeleton />}>
        <TenantsConsole />
      </Suspense>
    </main>
  )
}

async function TenantsConsole() {
  await requireSuperAdmin()
  const [tenants, health] = await Promise.all([listTenants(), getPlatformHealth()])

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every organisation on the platform. Suspending one locks out all its members."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Super admin" }]}
        actions={
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-success hover:underline"
          >
            <Icon name="dashboard" /> Back to app
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tenants" value={health.queue.totalTenants} icon="branch" />
        <StatCard label="Open tickets (platform)" value={health.queue.openTickets} icon="ticket" />
        <StatCard
          label="SLA breached (open)"
          value={health.queue.breachedTickets}
          icon="warning"
          lowerIsBetter
        />
        <StatCard
          label="DB ping / Worker"
          value={`${health.db.pingMs} ms`}
          icon="sla"
          footer={
            <span className="text-muted-foreground capitalize">Worker: {health.worker.status}</span>
          }
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Organisation
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Industry
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Plan
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Limits (branches · users · locations)
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Created
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((t) => (
              <tr key={t._id.toHexString()}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
                </td>
                <td className="px-4 py-2.5 capitalize">{t.industry}</td>
                <td className="px-4 py-2.5 capitalize">{t.plan}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {t.limits.branches} · {t.limits.users} · {t.limits.locations}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{dateFormat.format(t.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={t.status === "active" ? "success" : "destructive"}>
                    {t.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <TenantPlanDialog
                      id={t._id.toHexString()}
                      name={t.name}
                      plan={t.plan}
                      limits={t.limits}
                    />
                    <TenantStatusButton id={t._id.toHexString()} name={t.name} status={t.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
