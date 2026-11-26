import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeleton"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { requireSuperAdmin } from "@/server/auth/session"
import { listTenants } from "@/server/modules/tenants"
import { TenantStatusButton } from "./tenant-status-button"

export const metadata: Metadata = { title: "Super admin · QR Feed", robots: { index: false } }

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" })

/** Platform console (phase.md P1): every tenant, its plan and status. Access by SUPER_ADMIN_EMAILS. */
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
  const tenants = await listTenants()

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
                <td className="px-4 py-2.5 text-right">
                  <TenantStatusButton id={t._id.toHexString()} name={t.name} status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
