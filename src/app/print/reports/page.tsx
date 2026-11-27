import type { Metadata } from "next"
import { ObjectId } from "mongodb"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { PrintButton } from "@/components/print-button"
import { PageSkeleton } from "@/components/skeleton"
import { requireTenantContext } from "@/server/auth/session"
import { inBranchScope } from "@/server/db/tenant-context"
import { getAnalyticsReport } from "@/server/modules/reports"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"

export const metadata: Metadata = { title: "Analytics Report · QR Feed", robots: { index: false } }

export default function PrintAnalyticsReportPage(props: PageProps<"/print/reports">) {
  return (
    <main className="mx-auto w-full max-w-4xl bg-white px-6 py-8 text-black print:max-w-none print:bg-white print:p-0 print:text-black">
      <Suspense fallback={<PageSkeleton />}>
        <ReportSheet {...props} />
      </Suspense>
    </main>
  )
}

async function ReportSheet({ searchParams }: PageProps<"/print/reports">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "report:read")) redirect("/dashboard")

  const sp = await searchParams
  const rawDays = Number(sp.days)
  const rangeDays = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, Math.floor(rawDays))) : 30
  const branchId =
    typeof sp.branchId === "string" &&
    ObjectId.isValid(sp.branchId) &&
    inBranchScope(ctx.branchScope, new ObjectId(sp.branchId))
      ? sp.branchId
      : undefined

  const [report, tenant] = await Promise.all([
    getAnalyticsReport(ctx, { rangeDays, branchId }),
    getTenant(ctx.tenantId),
  ])

  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date())

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 print:hidden">
        <Link
          href={`/reports?days=${rangeDays}${branchId ? `&branchId=${branchId}` : ""}`}
          className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium"
        >
          ← Back to Reports
        </Link>
        <PrintButton />
      </div>

      <header className="border-b border-gray-300 pb-4">
        <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          {tenant?.name ?? "QR Feed"} · Executive Analytics Summary
        </p>
        <h1 className="mt-1 text-2xl font-bold">Performance Report (Last {rangeDays} Days)</h1>
        <p className="mt-1 text-xs text-gray-500">Generated {generatedAt} UTC</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">SLA Compliance</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {report.kpis.slaCompliancePct === null ? "–" : `${report.kpis.slaCompliancePct}%`}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">MTTR</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {report.kpis.mttrHours === null ? "–" : `${report.kpis.mttrHours}h`}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Avg Rating</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {report.kpis.avgRating === null ? "–" : `${report.kpis.avgRating} / 5`}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Overdue CAPAs</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{report.kpis.overdueCapas}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold tracking-wider text-gray-600 uppercase">
          Branch Comparison
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs text-gray-600">
              <th className="py-2 pr-3">Branch</th>
              <th className="py-2 pr-3">Total</th>
              <th className="py-2 pr-3">Open</th>
              <th className="py-2 pr-3">SLA %</th>
              <th className="py-2">Avg Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {report.branchComparison.map((b) => (
              <tr key={b.branchId}>
                <td className="py-2 pr-3 font-medium">{b.branchName}</td>
                <td className="py-2 pr-3 tabular-nums">{b.total}</td>
                <td className="py-2 pr-3 tabular-nums">{b.open}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {b.slaPct !== null ? `${b.slaPct}%` : "–"}
                </td>
                <td className="py-2 tabular-nums">
                  {b.avgRating !== null ? `${b.avgRating} / 5` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report.heatmap.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold tracking-wider text-gray-600 uppercase">
            Top Problem Locations
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs text-gray-600">
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Critical</th>
                <th className="py-2 pr-3">High</th>
                <th className="py-2 pr-3">Medium</th>
                <th className="py-2">Low</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {report.heatmap.map((h) => (
                <tr key={h.location}>
                  <td className="py-2 pr-3 font-medium">{h.location}</td>
                  <td className="py-2 pr-3 font-semibold tabular-nums">{h.total}</td>
                  <td className="py-2 pr-3 tabular-nums">{h.critical}</td>
                  <td className="py-2 pr-3 tabular-nums">{h.high}</td>
                  <td className="py-2 pr-3 tabular-nums">{h.medium}</td>
                  <td className="py-2 tabular-nums">{h.low}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.repeatIssues.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold tracking-wider text-gray-600 uppercase">
            Repeat Hotspots
          </h2>
          <ul className="divide-y divide-gray-200 text-sm">
            {report.repeatIssues.map((r) => (
              <li key={`${r.location}:${r.category}`} className="flex justify-between gap-4 py-1.5">
                <span>
                  <strong>{r.category}</strong> — {r.location}
                </span>
                <span className="font-mono font-semibold tabular-nums">×{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
