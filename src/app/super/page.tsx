import type { Metadata } from "next"
import Link from "next/link"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { getTenantContext, requireSuperAdmin } from "@/server/auth/session"
import { getPlatformHealth } from "@/server/db/health"
import { listTenants } from "@/server/modules/tenants"
import { ImpersonateDialog } from "./impersonate-dialog"
import { TenantPlanDialog } from "./tenant-plan-dialog"
import { TenantStatusButton } from "./tenant-status-button"

export const metadata: Metadata = { title: "Super admin · QR Feed", robots: { index: false } }

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

/** Platform console (phase.md P1 & P10): every tenant, plan limits, status & platform health. */
export default async function SuperAdminPage() {
  await requireSuperAdmin()
  const [tenants, health, ctx] = await Promise.all([
    listTenants(),
    getPlatformHealth(),
    getTenantContext(),
  ])

  const activeTenants = tenants.filter((t) => t.status === "active").length

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every organisation on the platform. Suspending one locks out all its members."
        breadcrumbs={
          ctx
            ? [{ label: "Dashboard", href: "/dashboard" }, { label: "Super admin" }]
            : [{ label: "Platform" }, { label: "Super admin" }]
        }
        actions={
          ctx && (
            <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Icon name="dashboard" data-icon="inline-start" /> Back to app
            </Link>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tenants"
          value={health.queue.totalTenants}
          icon="branch"
          tone="indigo"
          footer={
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{activeTenants}</span>{" "}
              active
            </p>
          }
        />
        <StatCard
          label="Open tickets (platform)"
          value={health.queue.openTickets}
          icon="ticket"
          tone="cyan"
        />
        <StatCard
          label="SLA breached (open)"
          value={health.queue.breachedTickets}
          icon="warning"
          tone="rose"
          lowerIsBetter
        />
        <StatCard
          label="DB ping / Worker"
          value={`${health.db.pingMs} ms`}
          icon="sla"
          tone="emerald"
          footer={
            <span className="text-muted-foreground capitalize">Worker: {health.worker.status}</span>
          }
        />
      </div>

      <PanelCard
        title="Organisations"
        description={`${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"} registered across the platform.`}
      >
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                  Organisation
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Industry
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Plan
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Limits (branches · users · locations · tickets/mo)
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Created
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 sm:px-5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => (
                <tr key={t._id.toHexString()} className="hover:bg-muted/30">
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-medium">{t.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{t.industry}</td>
                  <td className="px-4 py-3 capitalize">{t.plan}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {t.limits.branches} · {t.limits.users} · {t.limits.locations} ·{" "}
                    {(t.limits.monthlyTickets ?? 500).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{dateFormat.format(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.status === "active" ? "success" : "destructive"}>
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap sm:px-5">
                    <div className="inline-flex items-center gap-1">
                      {t.status === "active" && (
                        <ImpersonateDialog id={t._id.toHexString()} name={t.name} />
                      )}
                      <TenantPlanDialog
                        id={t._id.toHexString()}
                        name={t.name}
                        plan={t.plan}
                        limits={t.limits}
                      />
                      <TenantStatusButton
                        id={t._id.toHexString()}
                        name={t.name}
                        status={t.status}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </>
  )
}
