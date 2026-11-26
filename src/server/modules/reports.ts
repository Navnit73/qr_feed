import "server-only"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { average, dailyCounts } from "@/lib/dashboard-metrics"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { sendMail } from "@/server/mail"
import { assertCan } from "@/server/rbac/ability"
import {
  auditLogs,
  branches,
  capas,
  notificationPreferences,
  OPEN_TICKET_STATUSES,
  rcas,
  savedReports,
  tickets,
} from "@/server/repositories"
import { name, objectId } from "@/server/validation"

const DAY_MS = 86_400_000

const optionalId = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  objectId.nullish(),
)

const savedReportSchema = z.object({
  name: name("report name", 2),
  rangeDays: z.coerce.number().int().min(1).max(365).default(30),
  branchId: optionalId.optional(),
  schedule: z.enum(["none", "daily", "weekly"]).default("none"),
  recipients: z.array(z.email()).max(20).default([]),
})

const prefsSchema = z.object({
  channels: z.object({
    in_app: z.boolean().default(true),
    email: z.boolean().default(true),
    sms: z.boolean().default(false),
    whatsapp: z.boolean().default(false),
    push: z.boolean().default(false),
  }),
  events: z.object({
    assigned: z.boolean().default(true),
    escalated: z.boolean().default(true),
    verification: z.boolean().default(true),
    capaDue: z.boolean().default(true),
    digest: z.boolean().default(false),
  }),
  digestMode: z.enum(["instant", "daily", "weekly"]).default("instant"),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .default("22:00"),
      end: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .default("07:00"),
      timezone: z.string().default("UTC"),
    })
    .optional(),
})

export async function getAnalyticsReport(
  ctx: TenantContext,
  { rangeDays = 30, branchId }: { rangeDays?: number; branchId?: string } = {},
) {
  assertCan(ctx, "report:read")
  const days = Math.min(365, Math.max(1, rangeDays))
  const now = new Date()
  const since = new Date(now.getTime() - days * DAY_MS)
  const branchObjId = branchId ? parseInput(objectId, branchId) : undefined

  const filter = {
    createdAt: { $gte: since },
    ...(branchObjId ? { branchId: branchObjId } : {}),
  }

  const [ticketList, branchList, capaList] = await Promise.all([
    tickets.forTenant(ctx).find(filter, { sort: { createdAt: -1 }, limit: 5000 }),
    branches.forTenant(ctx).find({ status: "active" }, { sort: { name: 1 } }),
    capas.forTenant(ctx).find({}, { limit: 1000 }),
  ])

  const openSet = new Set<string>(OPEN_TICKET_STATUSES)
  const openTickets = ticketList.filter((t) => openSet.has(t.status))
  const closedTickets = ticketList.filter((t) => t.status === "closed")

  // MTTR (hours) for closed tickets
  const resolveHours = closedTickets.map((t) => {
    const end = t.closedAt ?? t.sla?.resolvedAt ?? t.updatedAt
    return Math.max(0, (end.getTime() - t.createdAt.getTime()) / 3_600_000)
  })
  const mttrHours = resolveHours.length
    ? Math.round((resolveHours.reduce((s, h) => s + h, 0) / resolveHours.length) * 10) / 10
    : null

  // SLA compliance %
  const withSla = ticketList.filter((t) => Boolean(t.sla))
  const slaMet = withSla.filter((t) => !t.sla?.breached).length
  const slaCompliancePct = withSla.length ? Math.round((slaMet / withSla.length) * 100) : null

  const avgRating = average(ticketList.map((t) => t.rating))

  // Opened vs Closed trend (14 days or rangeDays capped at 30)
  const trendDays = Math.min(days, 30)
  const tz = branchList[0]?.timezone ?? "UTC"
  const openedDaily = dailyCounts(
    ticketList.map((t) => t.createdAt),
    now,
    trendDays,
    tz,
  )
  const closedDaily = dailyCounts(
    closedTickets.map((t) => t.closedAt ?? t.updatedAt),
    now,
    trendDays,
    tz,
  )
  const trend = openedDaily.map((d, i) => ({
    label: d.label,
    opened: d.reports,
    closed: closedDaily[i]?.reports ?? 0,
  }))

  // Volume by category
  const catCounts = new Map<string, number>()
  for (const t of ticketList) {
    catCounts.set(t.categoryName, (catCounts.get(t.categoryName) ?? 0) + 1)
  }
  const byCategory = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Location problem heatmap (location × severity)
  const heatMap = new Map<
    string,
    { location: string; total: number; low: number; medium: number; high: number; critical: number }
  >()
  for (const t of ticketList) {
    const key = t.locationPath.join(" › ") || "Unknown"
    const row = heatMap.get(key) ?? {
      location: key,
      total: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    }
    row.total++
    row[t.severity]++
    heatMap.set(key, row)
  }
  const heatmap = [...heatMap.values()].sort((a, b) => b.total - a.total).slice(0, 12)

  // Repeat issues (location + category occurring >= 2 times)
  const repeatMap = new Map<string, { location: string; category: string; count: number }>()
  for (const t of ticketList) {
    const key = `${t.locationId.toHexString()}:${t.categoryId.toHexString()}`
    const row = repeatMap.get(key) ?? {
      location: t.locationPath.join(" › "),
      category: t.categoryName,
      count: 0,
    }
    row.count += t.reportCount
    repeatMap.set(key, row)
  }
  const repeatIssues = [...repeatMap.values()]
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Staff workload
  const staffMap = new Map<string, { name: string; open: number; closed: number }>()
  for (const t of ticketList) {
    const nameKey = t.assignee?.name ?? "Unassigned"
    const row = staffMap.get(nameKey) ?? { name: nameKey, open: 0, closed: 0 }
    if (openSet.has(t.status)) row.open++
    else if (t.status === "closed") row.closed++
    staffMap.set(nameKey, row)
  }
  const staffWorkload = [...staffMap.values()].sort(
    (a, b) => b.open + b.closed - (a.open + a.closed),
  )

  // CAPA aging
  const allActions = capaList.flatMap((c) => c.actions)
  const openActions = allActions.filter((a) => a.status !== "completed" && a.status !== "verified")
  const overdueCapas = openActions.filter((a) => a.dueDate.getTime() < now.getTime()).length
  const capaAging = [
    {
      bucket: "On schedule",
      count: openActions.filter((a) => a.dueDate.getTime() >= now.getTime()).length,
    },
    {
      bucket: "1–7d overdue",
      count: openActions.filter((a) => {
        const diff = (now.getTime() - a.dueDate.getTime()) / DAY_MS
        return diff > 0 && diff <= 7
      }).length,
    },
    {
      bucket: "8–30d overdue",
      count: openActions.filter((a) => {
        const diff = (now.getTime() - a.dueDate.getTime()) / DAY_MS
        return diff > 7 && diff <= 30
      }).length,
    },
    {
      bucket: "30d+ overdue",
      count: openActions.filter((a) => (now.getTime() - a.dueDate.getTime()) / DAY_MS > 30).length,
    },
  ]

  // Multi-branch comparison
  const branchComparison = branchList.map((b) => {
    const bt = ticketList.filter((t) => t.branchId.equals(b._id))
    const bSla = bt.filter((t) => Boolean(t.sla))
    const bMet = bSla.filter((t) => !t.sla?.breached).length
    return {
      branchId: b._id.toHexString(),
      branchName: b.name,
      total: bt.length,
      open: bt.filter((t) => openSet.has(t.status)).length,
      slaPct: bSla.length ? Math.round((bMet / bSla.length) * 100) : null,
      avgRating: average(bt.map((t) => t.rating)),
    }
  })

  return {
    rangeDays: days,
    kpis: {
      totalTickets: ticketList.length,
      openTickets: openTickets.length,
      closedTickets: closedTickets.length,
      slaCompliancePct,
      mttrHours,
      avgRating,
      overdueCapas,
    },
    trend,
    byCategory,
    heatmap,
    repeatIssues,
    staffWorkload,
    capaAging,
    branchComparison,
  }
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join(
    "\n",
  )
}

export async function exportReportCsv(
  ctx: TenantContext,
  type: "tickets" | "audit_log" | "rca" | "summary",
  rangeDays = 30,
): Promise<string> {
  assertCan(ctx, "report:export")
  const since = new Date(Date.now() - Math.min(365, Math.max(1, rangeDays)) * DAY_MS)

  if (type === "tickets") {
    const list = await tickets
      .forTenant(ctx)
      .find({ createdAt: { $gte: since } }, { sort: { createdAt: -1 }, limit: 5000 })
    return toCsv(
      [
        "Number",
        "CreatedAt",
        "Location",
        "Category",
        "Severity",
        "Status",
        "Level",
        "Assignee",
        "Rating",
        "SLA Breached",
        "Description",
      ],
      list.map((t) => [
        t.number,
        t.createdAt.toISOString(),
        t.locationPath.join(" > "),
        t.categoryName,
        t.severity,
        t.status,
        `L${t.currentLevel ?? 1}`,
        t.assignee?.name ?? "Unassigned",
        t.rating ?? "",
        t.sla?.breached ? "Yes" : "No",
        t.description,
      ]),
    )
  }

  if (type === "audit_log") {
    assertCan(ctx, "log:read")
    const list = await auditLogs.forTenant(ctx).find({}, { sort: { seq: -1 }, limit: 2000 })
    return toCsv(
      ["Seq", "Timestamp", "ActorId", "Action", "Entity", "EntityId", "Hash"],
      list.map((e) => [
        e.seq,
        e.at.toISOString(),
        e.actorId,
        e.action,
        e.entity,
        e.entityId ?? "",
        e.hash,
      ]),
    )
  }

  if (type === "rca") {
    assertCan(ctx, "rca:read")
    const list = await rcas.forTenant(ctx).find({}, { sort: { createdAt: -1 }, limit: 1000 })
    return toCsv(
      ["Number", "Title", "Method", "Status", "Owner", "RootCause", "CreatedAt"],
      list.map((r) => [
        r.number,
        r.title,
        r.method,
        r.status,
        r.ownerName,
        r.rootCause,
        r.createdAt.toISOString(),
      ]),
    )
  }

  const report = await getAnalyticsReport(ctx, { rangeDays })
  return toCsv(
    ["Branch", "TotalTickets", "OpenTickets", "SLACompliance%", "AvgRating"],
    report.branchComparison.map((b) => [
      b.branchName,
      b.total,
      b.open,
      b.slaPct ?? "",
      b.avgRating ?? "",
    ]),
  )
}

export async function listSavedReports(ctx: TenantContext) {
  assertCan(ctx, "report:read")
  return savedReports.forTenant(ctx).find({}, { sort: { createdAt: -1 } })
}

export async function createSavedReport(
  ctx: TenantContext,
  raw: z.input<typeof savedReportSchema>,
) {
  assertCan(ctx, "report:read")
  const input = parseInput(savedReportSchema, raw)
  return withTransaction(async (session) => {
    const doc = await savedReports.forTenant(ctx).insertOne(
      {
        name: input.name,
        ownerId: ctx.actorId,
        rangeDays: input.rangeDays,
        branchId: input.branchId ?? null,
        schedule: input.schedule,
        recipients: input.recipients,
        lastSentAt: null,
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "saved_report.created",
        entity: "savedReport",
        entityId: doc._id,
        after: { name: doc.name, schedule: doc.schedule },
      },
      { session },
    )
    return doc
  })
}

export async function deleteSavedReport(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "report:read")
  const id = parseInput(objectId, idRaw)
  const ok = await savedReports.forTenant(ctx).deleteOne({ _id: id })
  if (!ok) throw new ApiError("NOT_FOUND", "Saved report not found.")
}

export async function sendDigestNow(ctx: TenantContext, reportIdRaw: ObjectId | string) {
  assertCan(ctx, "report:export")
  const id = parseInput(objectId, reportIdRaw)
  const saved = await savedReports.forTenant(ctx).findById(id)
  if (!saved) throw new ApiError("NOT_FOUND", "Saved report not found.")
  const data = await getAnalyticsReport(ctx, {
    rangeDays: saved.rangeDays,
    branchId: saved.branchId ? saved.branchId.toHexString() : undefined,
  })
  const text = [
    `Digest: ${saved.name} (Last ${saved.rangeDays} days)`,
    `Total tickets: ${data.kpis.totalTickets} (Open: ${data.kpis.openTickets}, Closed: ${data.kpis.closedTickets})`,
    `SLA compliance: ${data.kpis.slaCompliancePct ?? "N/A"}%`,
    `MTTR: ${data.kpis.mttrHours ?? "N/A"} hours`,
    `Average rating: ${data.kpis.avgRating ?? "N/A"} / 5`,
    `Overdue CAPA actions: ${data.kpis.overdueCapas}`,
  ].join("\n")

  for (const to of saved.recipients) {
    await sendMail({ to, subject: `[QR Feed] ${saved.name}`, text })
  }
  await savedReports.forTenant(ctx).updateOne({ _id: id }, { $set: { lastSentAt: new Date() } })
  return { sentTo: saved.recipients.length }
}

// ── Notification preferences (F-8.3) ────────────────────────────────────────────────

const DEFAULT_PREFS = {
  channels: { in_app: true, email: true, sms: false, whatsapp: false, push: false },
  events: { assigned: true, escalated: true, verification: true, capaDue: true, digest: false },
  digestMode: "instant" as const,
  quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" },
}

export async function getNotificationPreferences(ctx: TenantContext) {
  const doc = await notificationPreferences
    .forTenant({ ...ctx, branchScope: "all" })
    .findOne({ userId: ctx.actorId })
  if (!doc) return DEFAULT_PREFS
  return {
    channels: doc.channels,
    events: doc.events,
    digestMode: doc.digestMode,
    quietHours: doc.quietHours ?? DEFAULT_PREFS.quietHours,
  }
}

export async function saveNotificationPreferences(
  ctx: TenantContext,
  raw: z.input<typeof prefsSchema>,
) {
  const input = parseInput(prefsSchema, raw)
  const repo = notificationPreferences.forTenant({ ...ctx, branchScope: "all" })
  const existing = await repo.findOne({ userId: ctx.actorId })
  if (existing) {
    return (await repo.updateOne({ _id: existing._id }, { $set: input }))!
  }
  return repo.insertOne({ userId: ctx.actorId, ...input })
}
