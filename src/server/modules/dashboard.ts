import "server-only"
import {
  average,
  dailyCounts,
  percentChange,
  severityBreakdown,
  topLocations,
} from "@/lib/dashboard-metrics"
import type { TenantContext } from "@/server/db/tenant-context"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import {
  branches,
  locations,
  members,
  OPEN_TICKET_STATUSES,
  qrCodes,
  tickets,
} from "@/server/repositories"

const DAY_MS = 86_400_000
const TREND_DAYS = 14
// Enough for a busy month; past this the dashboard needs pre-aggregated stats (P4 reports).
const SCAN_LIMIT = 5000

/**
 * Everything the dashboard shows. Each area is null when the viewer can't see it, and the
 * repositories already narrow tickets to the viewer's branches.
 */
export async function getDashboard(ctx: TenantContext) {
  const [tenant, branchList, locationCount, memberCount, qrCount, ticketData] = await Promise.all([
    getTenant(ctx.tenantId),
    can(ctx, "branch:read")
      ? branches.forTenant(ctx).find({ status: "active" }, { sort: { createdAt: 1 } })
      : null,
    can(ctx, "location:read") ? locations.forTenant(ctx).count({ status: "active" }) : null,
    can(ctx, "user:read") ? members.forTenant(ctx).count({ status: "active" }) : null,
    can(ctx, "qr:read") ? qrCodes.forTenant(ctx).count({ status: "active" }) : null,
    can(ctx, "ticket:read") ? ticketSummary(ctx) : null,
  ])

  return {
    workspace: {
      name: tenant?.name ?? "",
      plan: tenant?.plan ?? "trial",
      limits: tenant?.limits ?? null,
      branches: branchList?.length ?? null,
      locations: locationCount,
      qrCodes: qrCount,
      members: memberCount,
    },
    tickets: ticketData,
  }
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>

async function ticketSummary(ctx: TenantContext) {
  const repo = tickets.forTenant(ctx)
  const now = new Date()
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS)

  const [open, recentWindow, firstBranch] = await Promise.all([
    repo.find({ status: { $in: OPEN_TICKET_STATUSES } }, { limit: SCAN_LIMIT }),
    // 60 days covers this month and last month for the rating comparison.
    repo.find({ createdAt: { $gte: since(60) } }, { sort: { createdAt: -1 }, limit: SCAN_LIMIT }),
    branches.forTenant(ctx).findOne({ status: "active" }, { sort: { createdAt: 1 } }),
  ])

  const between = (from: number, to: number) =>
    recentWindow.filter((t) => t.createdAt >= since(from) && t.createdAt < since(to))
  const thisWeek = between(7, 0)
  const lastWeek = between(14, 7)
  const thisMonth = between(30, 0)
  const lastMonth = between(60, 30)

  const avgRating = average(thisMonth.map((t) => t.rating))
  const prevRating = average(lastMonth.map((t) => t.rating))

  return {
    open: open.length,
    highPriorityOpen: open.filter((t) => t.severity === "high" || t.severity === "critical").length,
    newOpen: open.filter((t) => t.status === "new").length,
    newThisWeek: thisWeek.length,
    newThisWeekDelta: percentChange(thisWeek.length, lastWeek.length),
    avgRating,
    avgRatingDelta:
      avgRating !== null && prevRating !== null ? percentChange(avgRating, prevRating) : undefined,
    ratedThisMonth: thisMonth.filter((t) => t.rating !== null).length,
    trend: dailyCounts(
      between(TREND_DAYS, 0).map((t) => t.createdAt),
      now,
      TREND_DAYS,
      firstBranch?.timezone ?? "UTC",
    ),
    bySeverity: severityBreakdown(open.map((t) => t.severity)),
    topLocations: topLocations(thisMonth, 5),
    // Plain data only: this crosses into client components.
    recent: recentWindow.slice(0, 6).map((t) => ({
      id: t._id.toHexString(),
      number: t.number,
      category: t.categoryName,
      description: t.description,
      location: t.locationPath.at(-1) ?? "",
      locationParent: t.locationPath.slice(0, -1).join(" › "),
      severity: t.severity,
      status: t.status,
      rating: t.rating,
      reportCount: t.reportCount,
      createdAt: t.createdAt.toISOString(),
    })),
  }
}
