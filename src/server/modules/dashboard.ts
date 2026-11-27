import "server-only"
import { ObjectId } from "mongodb"
import { dailyCounts, percentChange } from "@/lib/dashboard-metrics"
import { SEVERITIES, type Severity } from "@/lib/feedback-presets"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { getTenant } from "@/server/modules/tenants"
import { can } from "@/server/rbac/ability"
import {
  branches,
  locations,
  members,
  OPEN_TICKET_STATUSES,
  qrCodes,
  surveyResponses,
  surveys,
  tickets,
} from "@/server/repositories"

const DAY_MS = 86_400_000

export type DashboardFilters = {
  branchId?: string
  days?: number
}

/**
 * Everything the dashboard shows. Uses MongoDB $facet aggregation + narrow projections
 * instead of scanning 10,000 full documents into Node memory, keeping dashboard loads fast at scale.
 */
export async function getDashboard(ctx: TenantContext, filters: DashboardFilters = {}) {
  const days = filters.days && [7, 14, 30, 90].includes(filters.days) ? filters.days : 14
  const branchObjId =
    filters.branchId &&
    ObjectId.isValid(filters.branchId) &&
    inBranchScope(ctx.branchScope, new ObjectId(filters.branchId))
      ? new ObjectId(filters.branchId)
      : undefined

  const [tenant, branchList, locationCount, memberCount, qrCount, ticketData, surveyData] =
    await Promise.all([
      getTenant(ctx.tenantId),
      can(ctx, "branch:read")
        ? branches
            .forTenant(ctx)
            .find({ status: "active" }, { sort: { name: 1 }, projection: { name: 1, timezone: 1 } })
        : null,
      can(ctx, "location:read")
        ? locations
            .forTenant(ctx)
            .count({ status: "active", ...(branchObjId ? { branchId: branchObjId } : {}) })
        : null,
      can(ctx, "user:read")
        ? members
            .forTenant(ctx)
            .count(
              branchObjId
                ? { status: "active", branchIds: branchObjId }
                : ctx.branchScope === "all"
                  ? { status: "active" }
                  : { status: "active", branchIds: { $in: ctx.branchScope } },
            )
        : null,
      can(ctx, "qr:read")
        ? qrCodes
            .forTenant(ctx)
            .count({ status: "active", ...(branchObjId ? { branchId: branchObjId } : {}) })
        : null,
      can(ctx, "ticket:read") ? ticketSummary(ctx, { branchObjId, days }) : null,
      can(ctx, "qr:read") ? surveySummary(ctx, { branchObjId, days }) : null,
    ])

  return {
    filters: {
      branchId: branchObjId?.toHexString() ?? "",
      days,
    },
    branches: (branchList ?? []).map((b) => ({ id: b._id.toHexString(), name: b.name })),
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
    surveys: surveyData,
  }
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>

async function ticketSummary(
  ctx: TenantContext,
  { branchObjId, days }: { branchObjId?: ObjectId; days: number },
) {
  const repo = tickets.forTenant(ctx)
  const now = new Date()
  const since = (d: number) => new Date(now.getTime() - d * DAY_MS)
  const ratingWindowDays = Math.max(30, days)
  const maxWindowStart = since(Math.max(days * 2, ratingWindowDays * 2))
  const weekStart = since(7)
  const prevWeekStart = since(14)
  const rangeStart = since(days)
  const prevRangeStart = since(days * 2)
  const monthStart = since(30)
  const prevMonthStart = since(60)

  const branchMatch = branchObjId ? { branchId: branchObjId } : {}

  const [facetRows, recentDocs, firstBranch] = await Promise.all([
    repo.aggregate<{
      openSummary: {
        open: number
        highPriorityOpen: number
        newOpen: number
        overdueOpen: number
      }[]
      bySeverity: { _id: Severity; count: number }[]
      periodCounts: {
        thisWeek: number
        lastWeek: number
        inRange: number
        prevRange: number
        thisMonthRatingSum: number
        thisMonthRatingCount: number
        prevMonthRatingSum: number
        prevMonthRatingCount: number
        slaTotal: number
        slaBreached: number
        mttrSumMs: number
        mttrCount: number
      }[]
      trendDates: { createdAt: Date }[]
      topLocations: {
        _id: { name: string; parent: string }
        count: number
      }[]
    }>([
      ...(branchObjId ? [{ $match: branchMatch }] : []),
      {
        $facet: {
          openSummary: [
            { $match: { status: { $in: OPEN_TICKET_STATUSES } } },
            {
              $group: {
                _id: null,
                open: { $sum: 1 },
                highPriorityOpen: {
                  $sum: { $cond: [{ $in: ["$severity", ["high", "critical"]] }, 1, 0] },
                },
                newOpen: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
                overdueOpen: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ["$sla.breached", true] },
                          {
                            $and: [
                              { $ne: ["$sla.resolveDueAt", null] },
                              { $eq: ["$sla.pausedAt", null] },
                              { $lt: ["$sla.resolveDueAt", now] },
                            ],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          bySeverity: [
            { $match: { status: { $in: OPEN_TICKET_STATUSES } } },
            { $group: { _id: "$severity", count: { $sum: 1 } } },
          ],
          periodCounts: [
            { $match: { createdAt: { $gte: maxWindowStart } } },
            {
              $group: {
                _id: null,
                thisWeek: { $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0] } },
                lastWeek: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", prevWeekStart] },
                          { $lt: ["$createdAt", weekStart] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                inRange: { $sum: { $cond: [{ $gte: ["$createdAt", rangeStart] }, 1, 0] } },
                prevRange: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", prevRangeStart] },
                          { $lt: ["$createdAt", rangeStart] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                thisMonthRatingSum: {
                  $sum: {
                    $cond: [
                      {
                        $and: [{ $gte: ["$createdAt", monthStart] }, { $ne: ["$rating", null] }],
                      },
                      "$rating",
                      0,
                    ],
                  },
                },
                thisMonthRatingCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [{ $gte: ["$createdAt", monthStart] }, { $ne: ["$rating", null] }],
                      },
                      1,
                      0,
                    ],
                  },
                },
                prevMonthRatingSum: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", prevMonthStart] },
                          { $lt: ["$createdAt", monthStart] },
                          { $ne: ["$rating", null] },
                        ],
                      },
                      "$rating",
                      0,
                    ],
                  },
                },
                prevMonthRatingCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", prevMonthStart] },
                          { $lt: ["$createdAt", monthStart] },
                          { $ne: ["$rating", null] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                slaTotal: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", rangeStart] },
                          { $ne: ["$sla.resolveDueAt", null] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                slaBreached: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", rangeStart] },
                          { $eq: ["$sla.breached", true] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                mttrSumMs: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", rangeStart] },
                          { $eq: ["$status", "closed"] },
                        ],
                      },
                      {
                        $max: [
                          0,
                          {
                            $subtract: [
                              {
                                $subtract: [
                                  {
                                    $ifNull: [
                                      "$closedAt",
                                      { $ifNull: ["$sla.resolvedAt", "$updatedAt"] },
                                    ],
                                  },
                                  "$createdAt",
                                ],
                              },
                              { $ifNull: ["$sla.pausedMs", 0] },
                            ],
                          },
                        ],
                      },
                      0,
                    ],
                  },
                },
                mttrCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", rangeStart] },
                          { $eq: ["$status", "closed"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          trendDates: [
            { $match: { createdAt: { $gte: rangeStart } } },
            { $project: { _id: 0, createdAt: 1 } },
          ],
          topLocations: [
            { $match: { createdAt: { $gte: monthStart } } },
            {
              $group: {
                _id: {
                  name: { $ifNull: [{ $arrayElemAt: ["$locationPath", -1] }, ""] },
                  parent: {
                    $reduce: {
                      input: {
                        $slice: [
                          "$locationPath",
                          { $max: [0, { $subtract: [{ $size: "$locationPath" }, 1] }] },
                        ],
                      },
                      initialValue: "",
                      in: {
                        $cond: [
                          { $eq: ["$$value", ""] },
                          "$$this",
                          { $concat: ["$$value", " › ", "$$this"] },
                        ],
                      },
                    },
                  },
                },
                count: { $sum: "$reportCount" },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]),
    repo.find(branchMatch, {
      sort: { createdAt: -1 },
      limit: 6,
      projection: {
        number: 1,
        categoryName: 1,
        description: 1,
        locationPath: 1,
        severity: 1,
        status: 1,
        rating: 1,
        reportCount: 1,
        createdAt: 1,
      },
    }),
    branches
      .forTenant(ctx)
      .findOne(branchObjId ? { _id: branchObjId, status: "active" } : { status: "active" }, {
        sort: { createdAt: 1 },
        projection: { timezone: 1 },
      }),
  ])

  const facet = facetRows[0]
  const os = facet?.openSummary[0] ?? { open: 0, highPriorityOpen: 0, newOpen: 0, overdueOpen: 0 }
  const pc = facet?.periodCounts[0] ?? {
    thisWeek: 0,
    lastWeek: 0,
    inRange: 0,
    prevRange: 0,
    thisMonthRatingSum: 0,
    thisMonthRatingCount: 0,
    prevMonthRatingSum: 0,
    prevMonthRatingCount: 0,
    slaTotal: 0,
    slaBreached: 0,
    mttrSumMs: 0,
    mttrCount: 0,
  }

  const avgRating =
    pc.thisMonthRatingCount > 0
      ? Math.round((pc.thisMonthRatingSum / pc.thisMonthRatingCount) * 10) / 10
      : null
  const prevRating =
    pc.prevMonthRatingCount > 0
      ? Math.round((pc.prevMonthRatingSum / pc.prevMonthRatingCount) * 10) / 10
      : null
  const slaCompliancePct =
    pc.slaTotal > 0 ? Math.round(((pc.slaTotal - pc.slaBreached) / pc.slaTotal) * 100) : null
  const mttrHours =
    pc.mttrCount > 0 ? Math.round((pc.mttrSumMs / pc.mttrCount / 3_600_000) * 10) / 10 : null

  const sevMap = new Map((facet?.bySeverity ?? []).map((s) => [s._id, s.count]))
  const bySeverity = [...SEVERITIES].reverse().map((severity) => ({
    severity,
    count: sevMap.get(severity) ?? 0,
  }))

  return {
    open: os.open,
    highPriorityOpen: os.highPriorityOpen,
    newOpen: os.newOpen,
    overdueOpen: os.overdueOpen,
    slaCompliancePct,
    mttrHours,
    newThisWeek: pc.thisWeek,
    newThisWeekDelta: percentChange(pc.thisWeek, pc.lastWeek),
    newInRange: pc.inRange,
    newInRangeDelta: percentChange(pc.inRange, pc.prevRange),
    avgRating,
    avgRatingDelta:
      avgRating !== null && prevRating !== null ? percentChange(avgRating, prevRating) : undefined,
    ratedThisMonth: pc.thisMonthRatingCount,
    trend: dailyCounts(
      (facet?.trendDates ?? []).map((d) => d.createdAt),
      now,
      days,
      firstBranch?.timezone ?? "UTC",
    ),
    bySeverity,
    topLocations: (facet?.topLocations ?? []).map((row) => ({
      name: row._id.name,
      parent: row._id.parent,
      count: row.count,
    })),
    // Plain data only: this crosses into client components.
    recent: recentDocs.map((t) => ({
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

async function surveySummary(
  ctx: TenantContext,
  { branchObjId, days }: { branchObjId?: ObjectId; days: number },
) {
  const now = new Date()
  const rangeStart = new Date(now.getTime() - days * DAY_MS)
  const prevRangeStart = new Date(now.getTime() - days * 2 * DAY_MS)

  const scopeFilter = branchObjId
    ? { status: { $ne: "archived" as const }, branchId: branchObjId }
    : ctx.branchScope !== "all"
      ? {
          status: { $ne: "archived" as const },
          $or: [{ branchId: null }, { branchId: { $in: ctx.branchScope } }],
        }
      : { status: { $ne: "archived" as const } }

  const surveyList = await surveys.forTenant(ctx).find(scopeFilter, {
    sort: { responseCount: -1, createdAt: -1 },
    limit: 100,
    projection: {
      title: 1,
      shortCode: 1,
      status: 1,
      scopeLabel: 1,
      scanCount: 1,
      responseCount: 1,
    },
  })

  const activeSurveys = surveyList.filter((s) => s.status === "active").length
  const totalScans = surveyList.reduce((sum, s) => sum + (s.scanCount ?? 0), 0)
  const totalResponses = surveyList.reduce((sum, s) => sum + (s.responseCount ?? 0), 0)

  if (surveyList.length === 0) {
    return {
      activeSurveys: 0,
      totalSurveys: 0,
      totalScans: 0,
      totalResponses: 0,
      responsesInRange: 0,
      responsesDelta: undefined as number | undefined,
      npsScore: null as number | null,
      npsDelta: undefined as number | undefined,
      npsResponses: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      avgRating: null as number | null,
      ratedResponses: 0,
      topSurveys: [] as {
        id: string
        title: string
        shortCode: string
        status: "active" | "paused"
        scopeLabel: string
        scans: number
        responses: number
        nps: number | null
        avgRating: number | null
      }[],
    }
  }

  const surveyIds = surveyList.map((s) => s._id)
  const [facet] = await surveyResponses.forTenant(ctx).aggregate<{
    inRange: {
      count: number
      ratingSum: number
      ratingCount: number
      npsCount: number
      promoters: number
      passives: number
      detractors: number
    }[]
    prevRange: {
      count: number
      npsCount: number
      promoters: number
      detractors: number
    }[]
    bySurvey: {
      _id: ObjectId
      responses: number
      ratingSum: number
      ratingCount: number
      npsCount: number
      promoters: number
      detractors: number
    }[]
  }>([
    { $match: { surveyId: { $in: surveyIds } } },
    {
      $facet: {
        inRange: [
          { $match: { submittedAt: { $gte: rangeStart } } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              ratingSum: {
                $sum: {
                  $cond: [{ $isNumber: "$overallRating" }, "$overallRating", 0],
                },
              },
              ratingCount: {
                $sum: { $cond: [{ $isNumber: "$overallRating" }, 1, 0] },
              },
              npsCount: {
                $sum: { $cond: [{ $isNumber: "$npsScore" }, 1, 0] },
              },
              promoters: {
                $sum: {
                  $cond: [{ $and: [{ $isNumber: "$npsScore" }, { $gte: ["$npsScore", 9] }] }, 1, 0],
                },
              },
              passives: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $isNumber: "$npsScore" },
                        { $gte: ["$npsScore", 7] },
                        { $lte: ["$npsScore", 8] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              detractors: {
                $sum: {
                  $cond: [{ $and: [{ $isNumber: "$npsScore" }, { $lte: ["$npsScore", 6] }] }, 1, 0],
                },
              },
            },
          },
        ],
        prevRange: [
          { $match: { submittedAt: { $gte: prevRangeStart, $lt: rangeStart } } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              npsCount: {
                $sum: { $cond: [{ $isNumber: "$npsScore" }, 1, 0] },
              },
              promoters: {
                $sum: {
                  $cond: [{ $and: [{ $isNumber: "$npsScore" }, { $gte: ["$npsScore", 9] }] }, 1, 0],
                },
              },
              detractors: {
                $sum: {
                  $cond: [{ $and: [{ $isNumber: "$npsScore" }, { $lte: ["$npsScore", 6] }] }, 1, 0],
                },
              },
            },
          },
        ],
        bySurvey: [
          {
            $group: {
              _id: "$surveyId",
              responses: { $sum: 1 },
              ratingSum: {
                $sum: {
                  $cond: [{ $isNumber: "$overallRating" }, "$overallRating", 0],
                },
              },
              ratingCount: {
                $sum: { $cond: [{ $isNumber: "$overallRating" }, 1, 0] },
              },
              npsCount: {
                $sum: { $cond: [{ $isNumber: "$npsScore" }, 1, 0] },
              },
              promoters: {
                $sum: {
                  $cond: [{ $and: [{ $isNumber: "$npsScore" }, { $gte: ["$npsScore", 9] }] }, 1, 0],
                },
              },
              detractors: {
                $sum: {
                  $cond: [{ $and: [{ $isNumber: "$npsScore" }, { $lte: ["$npsScore", 6] }] }, 1, 0],
                },
              },
            },
          },
        ],
      },
    },
  ])

  const cur = facet?.inRange[0] ?? {
    count: 0,
    ratingSum: 0,
    ratingCount: 0,
    npsCount: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
  }
  const prev = facet?.prevRange[0] ?? { count: 0, npsCount: 0, promoters: 0, detractors: 0 }

  const npsScore =
    cur.npsCount > 0 ? Math.round(((cur.promoters - cur.detractors) / cur.npsCount) * 100) : null
  const prevNpsScore =
    prev.npsCount > 0
      ? Math.round(((prev.promoters - prev.detractors) / prev.npsCount) * 100)
      : null
  const npsDelta = npsScore !== null && prevNpsScore !== null ? npsScore - prevNpsScore : undefined

  const avgRating =
    cur.ratingCount > 0 ? Math.round((cur.ratingSum / cur.ratingCount) * 10) / 10 : null

  const bySurveyMap = new Map((facet?.bySurvey ?? []).map((row) => [row._id.toHexString(), row]))

  const topSurveys = surveyList.slice(0, 5).map((s) => {
    const id = s._id.toHexString()
    const stats = bySurveyMap.get(id)
    const sNps =
      stats && stats.npsCount > 0
        ? Math.round(((stats.promoters - stats.detractors) / stats.npsCount) * 100)
        : null
    const sAvg =
      stats && stats.ratingCount > 0
        ? Math.round((stats.ratingSum / stats.ratingCount) * 10) / 10
        : null
    return {
      id,
      title: s.title,
      shortCode: s.shortCode,
      status: s.status === "paused" ? ("paused" as const) : ("active" as const),
      scopeLabel: s.scopeLabel ?? "",
      scans: s.scanCount ?? 0,
      responses: Math.max(s.responseCount ?? 0, stats?.responses ?? 0),
      nps: sNps,
      avgRating: sAvg,
    }
  })

  return {
    activeSurveys,
    totalSurveys: surveyList.length,
    totalScans,
    totalResponses,
    responsesInRange: cur.count,
    responsesDelta: percentChange(cur.count, prev.count),
    npsScore,
    npsDelta,
    npsResponses: cur.npsCount,
    promoters: cur.promoters,
    passives: cur.passives,
    detractors: cur.detractors,
    avgRating,
    ratedResponses: cur.ratingCount,
    topSurveys,
  }
}
