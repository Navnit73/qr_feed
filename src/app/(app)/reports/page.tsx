import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { AreaTrend } from "@/components/charts/area-trend"
import { BarCompare } from "@/components/charts/bar-compare"
import { Icon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { getAnalyticsReport, listSavedReports } from "@/server/modules/reports"
import { can } from "@/server/rbac/ability"
import { SavedReportActions, SaveReportDialog } from "./report-controls"

export const metadata: Metadata = { title: "Reports & Analytics · QR Feed" }

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireTenantContext()
  if (!can(ctx, "report:read")) redirect("/dashboard")

  const sp = await searchParams
  const rangeDays = Math.min(365, Math.max(1, Number(sp.days) || 30))
  const branchId = typeof sp.branchId === "string" && sp.branchId ? sp.branchId : undefined

  const [report, branches, saved] = await Promise.all([
    getAnalyticsReport(ctx, { rangeDays, branchId }),
    can(ctx, "branch:read") ? listBranches(ctx) : [],
    listSavedReports(ctx),
  ])

  const branchOpts = branches.map((b) => ({ value: b._id.toHexString(), label: b.name }))
  const canExport = can(ctx, "report:export")

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description={`SLA compliance, MTTR, location heatmaps, repeat issues, CAPA aging and branch comparisons (last ${rangeDays} days).`}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <>
                <a
                  href={`/api/reports/export?type=tickets&days=${rangeDays}`}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <Icon name="download" data-icon="inline-start" /> Export Tickets CSV
                </a>
                <a
                  href={`/api/reports/export?type=summary&days=${rangeDays}`}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Branch CSV
                </a>
              </>
            )}
            <SaveReportDialog
              branches={branchOpts}
              defaultDays={rangeDays}
              defaultBranchId={branchId}
            />
          </div>
        }
      />

      {/* Window selector pills */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <Link
            key={d}
            href={`/reports?days=${d}${branchId ? `&branchId=${branchId}` : ""}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              rangeDays === d
                ? "border-primary bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            Last {d} days
          </Link>
        ))}
        {branches.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Link
              href={`/reports?days=${rangeDays}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                !branchId ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground",
              )}
            >
              All branches
            </Link>
            {branches.map((b) => {
              const id = b._id.toHexString()
              return (
                <Link
                  key={id}
                  href={`/reports?days=${rangeDays}&branchId=${id}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    branchId === id
                      ? "border-primary bg-primary/10 font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {b.name}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          featured
          label="SLA compliance"
          value={report.kpis.slaCompliancePct === null ? "–" : `${report.kpis.slaCompliancePct}%`}
          icon="sla"
        />
        <StatCard
          label="Mean time to resolve"
          value={report.kpis.mttrHours === null ? "–" : `${report.kpis.mttrHours}h`}
          icon="clock"
          lowerIsBetter
        />
        <StatCard
          label="Average rating"
          value={report.kpis.avgRating === null ? "–" : `${report.kpis.avgRating} / 5`}
          icon="rating"
        />
        <StatCard
          label="Overdue CAPA actions"
          value={report.kpis.overdueCapas}
          icon="capa"
          lowerIsBetter
        />
      </div>

      {/* Charts */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <PanelCard title="Opened vs Closed" description="Daily volume across the selected period">
          <AreaTrend
            title="Opened vs closed tickets"
            data={report.trend}
            xKey="label"
            series={[
              { key: "opened", label: "Opened" },
              { key: "closed", label: "Closed" },
            ]}
          />
        </PanelCard>
        <PanelCard title="Volume by category" description="Top reported categories">
          {report.byCategory.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No ticket data yet.</p>
          ) : (
            <BarCompare
              title="Tickets by category"
              data={report.byCategory}
              xKey="category"
              layout="horizontal-bars"
              series={[{ key: "count", label: "Tickets" }]}
            />
          )}
        </PanelCard>
      </div>

      {/* Location Heatmap + Repeat issues */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <PanelCard
          className="lg:col-span-2"
          title="Location problem heatmap"
          description="Hotspots broken down by severity level."
        >
          {report.heatmap.length === 0 ? (
            <p className="text-sm text-muted-foreground">No location reports in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Critical</th>
                    <th className="px-3 py-2 font-medium">High</th>
                    <th className="px-3 py-2 font-medium">Medium</th>
                    <th className="px-3 py-2 font-medium">Low</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.heatmap.map((h) => (
                    <tr key={h.location}>
                      <td className="px-3 py-2 font-medium">{h.location}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums">{h.total}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {h.critical > 0 ? <Badge variant="destructive">{h.critical}</Badge> : "0"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {h.high > 0 ? <Badge variant="warning">{h.high}</Badge> : "0"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {h.medium > 0 ? <Badge variant="secondary">{h.medium}</Badge> : "0"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{h.low}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>

        <PanelCard title="Repeat issues" description="Locations repeating the same category (≥2).">
          {report.repeatIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repeat hotspots detected.</p>
          ) : (
            <ul className="divide-y text-sm">
              {report.repeatIssues.map((r) => (
                <li
                  key={`${r.location}:${r.category}`}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.category}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.location}</p>
                  </div>
                  <Badge variant="warning" className="tabular-nums">
                    ×{r.count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      {/* Branch comparison + Staff workload + CAPA aging */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <PanelCard title="Branch comparison" description="Performance across sites">
          <ul className="divide-y text-sm">
            {report.branchComparison.map((b) => (
              <li key={b.branchId} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-medium">{b.branchName}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.open} open · {b.total} total
                  </p>
                </div>
                <div className="text-right text-xs tabular-nums">
                  <p className="font-semibold">{b.slaPct !== null ? `${b.slaPct}% SLA` : "–"}</p>
                  <p className="text-muted-foreground">
                    {b.avgRating !== null ? `${b.avgRating} ★` : "No ratings"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>

        <PanelCard title="Staff workload" description="Assigned tickets (open vs closed)">
          {report.staffWorkload.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments in this window.</p>
          ) : (
            <ul className="divide-y text-sm">
              {report.staffWorkload.map((s) => (
                <li key={s.name} className="flex items-center justify-between py-2.5">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    <strong className="text-foreground">{s.open}</strong> open · {s.closed} closed
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard title="CAPA aging" description="Open CAPA actions by overdue bucket">
          <ul className="divide-y text-sm">
            {report.capaAging.map((b) => (
              <li key={b.bucket} className="flex items-center justify-between py-2.5">
                <span>{b.bucket}</span>
                <Badge
                  variant={
                    b.bucket === "On schedule" ? "success" : b.count > 0 ? "warning" : "muted"
                  }
                  className="tabular-nums"
                >
                  {b.count}
                </Badge>
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>

      {/* Saved reports & scheduled digests */}
      <PanelCard
        title="Saved reports & scheduled digests"
        description="Re-open saved views or dispatch email digests immediately."
      >
        {saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved reports yet. Click &ldquo;Save / Schedule report&rdquo; above to configure
            daily or weekly executive digests.
          </p>
        ) : (
          <ul className="-mx-4 divide-y">
            {saved.map((r) => (
              <li
                key={r._id.toHexString()}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    href={`/reports?days=${r.rangeDays}${r.branchId ? `&branchId=${r.branchId.toHexString()}` : ""}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Last {r.rangeDays} days · Schedule: {r.schedule}
                    {r.recipients.length > 0 ? ` · Recipients: ${r.recipients.join(", ")}` : ""}
                  </p>
                </div>
                <SavedReportActions
                  id={r._id.toHexString()}
                  hasRecipients={r.recipients.length > 0}
                />
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </>
  )
}
