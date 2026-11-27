import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/cards/empty-state"
import { PanelCard } from "@/components/cards/panel-card"
import { ProgressStat } from "@/components/cards/progress-stat"
import { StatCard } from "@/components/cards/stat-card"
import type { Tone } from "@/components/cards/tone"
import { AreaTrend } from "@/components/charts/area-trend"
import { DonutChart } from "@/components/charts/donut-chart"
import { Icon, type IconName } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { timeAgo } from "@/lib/relative-time"
import { SEVERITY_BADGE, SEVERITY_COLOR, statusLabel } from "@/lib/ticket-display"
import { cn } from "@/lib/utils"
import { requireTenantContext, requireUser } from "@/server/auth/session"
import { getDashboard, type Dashboard } from "@/server/modules/dashboard"
import { can } from "@/server/rbac/ability"
import { DashboardFilterBar } from "./filter-bar"
import { Greeting } from "./greeting"
import { RefreshButton } from "./refresh-button"

export const metadata: Metadata = { title: "Dashboard · QR Feed" }

type Tickets = NonNullable<Dashboard["tickets"]>
type Workspace = Dashboard["workspace"]

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireTenantContext()
  const sp = await searchParams
  const branchId = typeof sp.branchId === "string" && sp.branchId ? sp.branchId : undefined
  const rawDays = typeof sp.days === "string" ? Number(sp.days) : undefined
  const days = rawDays && [7, 14, 30, 90].includes(rawDays) ? rawDays : 14

  const [user, data] = await Promise.all([requireUser(), getDashboard(ctx, { branchId, days })])
  const { workspace: ws, tickets: t } = data
  // eslint-disable-next-line react-hooks/purity -- a server render happens once per request
  const now = Date.now()
  const canManage = can(ctx, "location:manage")

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={<Greeting name={user.name.split(" ")[0]} org={ws.name} />}
        actions={
          <>
            <RefreshButton updatedAt={new Date(now).toISOString()} />
            {ws.branches !== null && (
              <Link href="/branches" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Icon name="qr" data-icon="inline-start" /> QR codes
              </Link>
            )}
            {t && (
              <Link href="/tickets" className={buttonVariants({ size: "lg" })}>
                <Icon name="ticket" data-icon="inline-start" /> View tickets
              </Link>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {canManage && <SetupChecklist ws={ws} hasReports={!!t?.recent.length} />}

        <DashboardFilterBar
          branches={data.branches}
          branchId={data.filters.branchId}
          days={data.filters.days}
        />

        {t ? <TicketKpis t={t} ws={ws} /> : <WorkspaceKpis ws={ws} />}
        {t && <SeverityShare t={t} />}

        {t && (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <PanelCard
                className="lg:col-span-2"
                title="New tickets"
                description={`Per day over the last ${data.filters.days} days`}
                action={
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t.trend.reduce((s, d) => s + d.reports, 0)} total
                  </span>
                }
              >
                <AreaTrend
                  title="New tickets per day"
                  data={t.trend}
                  xKey="label"
                  series={[{ key: "reports", label: "Tickets" }]}
                />
              </PanelCard>
              <PanelCard title="Open by severity" description="What's waiting right now">
                {t.open === 0 ? (
                  <QuietState icon="success" text="No open tickets. All clear." />
                ) : (
                  <DonutChart
                    title="Open tickets by severity"
                    centerLabel="open"
                    data={t.bySeverity.map((s) => ({
                      key: s.severity,
                      label: s.severity[0].toUpperCase() + s.severity.slice(1),
                      value: s.count,
                      color: SEVERITY_COLOR[s.severity],
                    }))}
                  />
                )}
              </PanelCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <PanelCard
                className="lg:col-span-2"
                title="Recent tickets"
                description="The latest reports from your QR codes"
                action={
                  <Link
                    href="/tickets"
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    View all <Icon name="arrowRight" data-icon="inline-end" />
                  </Link>
                }
              >
                {t.recent.length === 0 ? (
                  <QuietState
                    icon="feedback"
                    text="Reports appear here the moment someone scans."
                  />
                ) : (
                  <RecentTickets items={t.recent} now={now} />
                )}
              </PanelCard>
              <PanelCard title="Busiest locations" description="Reports in the last 30 days">
                {t.topLocations.length === 0 ? (
                  <QuietState icon="location" text="No reports in the last 30 days." />
                ) : (
                  <TopLocations items={t.topLocations} />
                )}
              </PanelCard>
            </div>
          </>
        )}

        {ws.locations === 0 && canManage && (
          <EmptyState
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
      </div>
    </>
  )
}

function TicketKpis({ t, ws }: { t: Tickets; ws: Workspace }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="Open tickets"
        value={t.open}
        icon="ticket"
        tone="indigo"
        footer={
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            <span>
              <span className="font-semibold text-warning tabular-nums">{t.highPriorityOpen}</span>{" "}
              high priority
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">{t.newOpen}</span> not
              picked up
            </span>
          </p>
        }
      />
      <StatCard
        label="New this week"
        value={t.newThisWeek}
        icon="feedback"
        tone="emerald"
        delta={t.newThisWeekDelta}
        deltaLabel="vs last week"
        lowerIsBetter
        footer={
          t.newThisWeekDelta === undefined && <p className="text-muted-foreground">Last 7 days</p>
        }
      />
      <StatCard
        label="On-time SLA"
        value={t.slaCompliancePct === null ? "–" : `${t.slaCompliancePct}%`}
        icon="sla"
        tone="rose"
        footer={
          <p className="text-muted-foreground">
            <span className="font-semibold text-destructive tabular-nums">{t.overdueOpen}</span>{" "}
            overdue open
          </p>
        }
      />
      <StatCard
        label="Average resolution"
        value={t.mttrHours === null ? "–" : `${t.mttrHours}h`}
        icon="clock"
        tone="orange"
        footer={<p className="text-muted-foreground">Mean time to resolve (active SLA)</p>}
      />
      <StatCard
        label="Average rating"
        value={t.avgRating === null ? "–" : `${t.avgRating} / 5`}
        icon="rating"
        tone="amber"
        delta={t.avgRatingDelta}
        deltaLabel="vs previous 30 days"
        footer={
          t.avgRatingDelta === undefined && (
            <p className="text-muted-foreground">
              {t.ratedThisMonth} {t.ratedThisMonth === 1 ? "rating" : "ratings"} in 30 days
            </p>
          )
        }
      />
      <StatCard
        label="Active QR codes"
        value={ws.qrCodes ?? "–"}
        icon="qr"
        tone="cyan"
        footer={
          ws.locations !== null && (
            <p className="text-muted-foreground">
              Across <span className="text-foreground tabular-nums">{ws.locations}</span> locations
            </p>
          )
        }
      />
    </div>
  )
}

/** How the open tickets split by severity: count, share of the open total and a bar. */
function SeverityShare({ t }: { t: Tickets }) {
  const tiles: {
    severity: Tickets["bySeverity"][number]["severity"]
    icon: IconName
    tone: Tone
  }[] = [
    { severity: "critical", icon: "warning", tone: "rose" },
    { severity: "high", icon: "escalate", tone: "orange" },
    { severity: "medium", icon: "info", tone: "sky" },
    { severity: "low", icon: "clock", tone: "indigo" },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(({ severity, icon, tone }) => {
        const count = t.bySeverity.find((b) => b.severity === severity)?.count ?? 0
        return (
          <ProgressStat
            key={severity}
            label={`${severity[0].toUpperCase()}${severity.slice(1)} severity`}
            value={count}
            percent={t.open ? (count / t.open) * 100 : 0}
            icon={icon}
            tone={tone}
          />
        )
      })}
    </div>
  )
}

/** For viewers without ticket access: what the workspace holds. */
function WorkspaceKpis({ ws }: { ws: Workspace }) {
  const tiles: { label: string; value: number | null; icon: IconName; tone: Tone }[] = [
    { label: "Branches", value: ws.branches, icon: "branch", tone: "indigo" },
    { label: "Locations", value: ws.locations, icon: "location", tone: "emerald" },
    { label: "Active QR codes", value: ws.qrCodes, icon: "qr", tone: "cyan" },
    { label: "Team members", value: ws.members, icon: "users", tone: "rose" },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles
        .filter((x) => x.value !== null)
        .map((x) => (
          <StatCard key={x.label} label={x.label} value={x.value!} icon={x.icon} tone={x.tone} />
        ))}
    </div>
  )
}

function RecentTickets({ items, now }: { items: Tickets["recent"]; now: number }) {
  return (
    <ul className="-my-2 divide-y">
      {items.map((r) => (
        <li key={r.id} className="flex gap-3 py-3">
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ background: SEVERITY_COLOR[r.severity] }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/tickets/${r.id}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {r.category}
              </Link>
              <Link
                href={`/tickets/${r.id}`}
                className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                {r.number}
              </Link>
              {r.reportCount > 1 && (
                <Badge variant="outline" className="tabular-nums">
                  ×{r.reportCount}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              <Icon name="location" className="mr-1 inline size-3.5 align-[-2px]" />
              {r.location}
              {r.locationParent && <span> · {r.locationParent}</span>}
            </p>
            {r.description && (
              <p className="mt-1 line-clamp-1 text-sm text-pretty">{r.description}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge variant={SEVERITY_BADGE[r.severity]} className="capitalize">
              {r.severity}
            </Badge>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              <span className="capitalize">{statusLabel(r.status)}</span> ·{" "}
              {timeAgo(new Date(r.createdAt), now)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TopLocations({ items }: { items: Tickets["topLocations"] }) {
  const max = Math.max(...items.map((i) => i.count))
  return (
    <ol className="space-y-4">
      {items.map((loc, i) => (
        <li key={`${loc.parent}/${loc.name}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="font-medium">{loc.name}</span>
              {loc.parent && <span className="text-muted-foreground"> · {loc.parent}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{loc.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", i === 0 ? "bg-chart-1" : "bg-primary")}
              style={{ width: `${Math.max(6, (loc.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

function QuietState({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
      <span className="grid size-10 place-items-center rounded-full bg-muted">
        <Icon name={icon} className="size-5" />
      </span>
      {text}
    </div>
  )
}

/** The first-run path. Disappears once every step is done. */
function SetupChecklist({ ws, hasReports }: { ws: Workspace; hasReports: boolean }) {
  const steps: { label: string; done: boolean; href: string; cta: string }[] = [
    { label: "Add a branch", done: (ws.branches ?? 0) > 0, href: "/branches", cta: "Add" },
    { label: "Map your locations", done: (ws.locations ?? 0) > 0, href: "/branches", cta: "Map" },
    { label: "Generate QR codes", done: (ws.qrCodes ?? 0) > 0, href: "/branches", cta: "Create" },
    { label: "Invite your team", done: (ws.members ?? 0) > 1, href: "/users", cta: "Invite" },
    { label: "Receive your first report", done: hasReports, href: "/branches", cta: "Print" },
  ]
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null

  return (
    <section
      aria-labelledby="setup-title"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="setup-title" className="font-semibold tracking-tight">
            Finish setting up
          </h2>
          <p className="text-sm text-muted-foreground">
            {done} of {steps.length} done. Each step gets you closer to live feedback.
          </p>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-background sm:w-48"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuenow={done}
          aria-valuemax={steps.length}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li
            key={s.label}
            className={cn(
              "flex min-h-12 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-sm",
              s.done && "text-muted-foreground",
            )}
          >
            {s.done ? (
              <Icon name="success" className="size-5 text-success" label="Done" />
            ) : (
              <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-dashed" />
            )}
            <span className={cn("flex-1", s.done && "line-through")}>{s.label}</span>
            {!s.done && (
              <Link href={s.href} className="font-medium text-primary hover:underline">
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
