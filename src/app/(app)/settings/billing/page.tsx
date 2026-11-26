import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { requireTenantContext } from "@/server/auth/session"
import { getBillingSummary } from "@/server/modules/platform"
import { PLAN_CATALOG, type PlanKey } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import { SelectPlanButton } from "./billing-controls"

export const metadata: Metadata = { title: "Billing & Plans · QR Feed" }

const fmtDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

export default async function BillingPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "tenant:manage")) redirect("/settings")
  const billing = await getBillingSummary(ctx)
  const canBill = can(ctx, "billing:manage")
  const plans: PlanKey[] = ["starter", "growth", "business", "enterprise"]

  return (
    <>
      <PageHeader
        title="Billing & Subscription"
        description="Server-enforced plan limits, monthly ticket metering, Stripe/Razorpay billing and invoice history."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Billing" },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          featured
          label="Active plan"
          value={PLAN_CATALOG[billing.plan].name}
          icon="billing"
          footer={<span className="text-muted-foreground capitalize">{billing.status}</span>}
        />
        <StatCard
          label="Monthly tickets"
          value={`${billing.usage.monthlyTickets}/${billing.limits.monthlyTickets}`}
          icon="ticket"
        />
        <StatCard
          label="Locations"
          value={`${billing.usage.locations}/${billing.limits.locations}`}
          icon="location"
        />
        <StatCard
          label="Seats / Branches"
          value={`${billing.usage.users}/${billing.limits.users} · ${billing.usage.branches}/${billing.limits.branches}`}
          icon="users"
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((key) => {
          const p = PLAN_CATALOG[key]
          const isCurrent = billing.plan === key
          return (
            <div key={key} className="flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{p.name}</h2>
                {isCurrent && <Badge variant="success">Active</Badge>}
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
                {p.priceUsd === null ? "Custom" : `$${p.priceUsd}`}
                {p.priceUsd !== null && (
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                )}
              </p>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.summary}</p>
              <ul className="my-4 space-y-1 text-xs text-muted-foreground tabular-nums">
                <li>Up to {p.limits.branches} branches</li>
                <li>Up to {p.limits.users} users</li>
                <li>Up to {p.limits.locations} locations</li>
                <li>Up to {p.limits.monthlyTickets} tickets / month</li>
              </ul>
              {canBill && <SelectPlanButton plan={key} current={isCurrent} />}
            </div>
          )
        })}
      </div>

      <PanelCard title="Invoice history" description="Billing receipts and plan changes.">
        {billing.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices issued yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Invoice</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {billing.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-2 font-mono text-xs">{inv.id}</td>
                  <td className="px-4 py-2 capitalize">{inv.plan}</td>
                  <td className="px-4 py-2 tabular-nums">${inv.amountUsd}</td>
                  <td className="px-4 py-2">
                    <Badge variant="success" className="capitalize">
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground tabular-nums">
                    {fmtDate.format(inv.issuedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PanelCard>
    </>
  )
}
