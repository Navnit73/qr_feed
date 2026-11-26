import "server-only"
import { createHash, randomBytes } from "node:crypto"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { maxSeverity } from "@/lib/feedback-presets"
import { nextSequence } from "@/server/db/counters"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { pickAssignee } from "@/server/modules/assignment"
import { notifyReporterConfirmation, notifyUser } from "@/server/modules/notifications"
import { resolvePublicQr } from "@/server/modules/qr-codes"
import { computeInitialTicketSla } from "@/server/modules/sla"
import { tenantsCollection } from "@/server/modules/tenants"
import { rateLimit } from "@/server/rate-limit"
import { assertCan } from "@/server/rbac/ability"
import {
  OPEN_TICKET_STATUSES,
  ticketActivities,
  ticketComments,
  tickets,
  type TicketStatus,
} from "@/server/repositories"
import { env } from "@/server/env"
import { verifyTurnstile } from "@/server/turnstile"
import { claimPublicAttachments } from "@/server/storage"
import { objectId } from "@/server/validation"

/** Repeat reports of the same issue at the same spot within this window join the open ticket. */
const DEDUPE_WINDOW_MS = 2 * 60 * 60 * 1000
const DEFAULT_LIMITS = { perIp: 10, perQr: 60, windowMs: 10 * 60 * 1000 }

const hash = (token: string) => createHash("sha256").update(token).digest("hex")
const blank = (v: unknown) => (v === "" || v === null ? undefined : v)

function feedbackSchema(categoryIds: Set<string>) {
  return z
    .object({
      categoryId: z
        .string({ error: "Choose what the issue is about" })
        .refine((id) => categoryIds.has(id), "Choose what the issue is about"),
      rating: z.preprocess(
        blank,
        z.coerce.number().int().min(1, "Pick 1 to 5 stars").max(5, "Pick 1 to 5 stars").optional(),
      ),
      description: z.preprocess(
        blank,
        z.string().trim().max(2000, "Keep it under 2000 characters").optional(),
      ),
      urgency: z.enum(["normal", "urgent"]).default("normal"),
      name: z.preprocess(blank, z.string().trim().max(80).optional()),
      email: z.preprocess(
        blank,
        z.email({ error: "Enter a valid email" }).toLowerCase().optional(),
      ),
      phone: z.preprocess(
        blank,
        z
          .string()
          .trim()
          .regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number")
          .optional(),
      ),
      consent: z.literal("on", { error: "Please confirm before sending" }),
      attachmentIds: z
        .preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.string()).max(3))
        .default([]),
      attachmentTokens: z
        .preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.string()).max(3))
        .default([]),
    })
    .superRefine((v, ctx) => {
      if (!v.rating && !v.description) {
        ctx.addIssue({
          code: "custom",
          path: ["description"],
          message: "Tell us what happened, or give a rating",
        })
      }
    })
}

export type IntakeOptions = {
  ip: string
  /** null turns rate limiting off (tests, e2e). */
  limits?: { perIp: number; perQr: number; windowMs: number } | null
  turnstile?: { secret?: string; token?: string | null }
}

/**
 * The public form's submit (phase.md §6.4). Never trusts the client for the tenant: everything
 * is derived from the QR code. Returns the reporter's private tracking token, shown once.
 */
export async function submitFeedback(
  shortCode: string,
  raw: Record<string, unknown>,
  opts: IntakeOptions,
) {
  const limits = opts.limits === undefined ? DEFAULT_LIMITS : opts.limits
  if (limits) {
    const [byIp, byQr] = await Promise.all([
      rateLimit({ key: `intake:ip:${opts.ip}`, limit: limits.perIp, windowMs: limits.windowMs }),
      rateLimit({ key: `intake:qr:${shortCode}`, limit: limits.perQr, windowMs: limits.windowMs }),
    ])
    if (!byIp.ok || !byQr.ok) {
      throw new ApiError(
        "RATE_LIMITED",
        "Too many reports from here. Please try again in a few minutes.",
      )
    }
  }

  const pub = await resolvePublicQr(shortCode)
  if (!pub) throw new ApiError("NOT_FOUND", "This QR code is no longer active.")

  const human = await verifyTurnstile({
    secret: opts.turnstile?.secret,
    token: opts.turnstile?.token,
    ip: opts.ip,
  })
  if (!human) throw new ApiError("FORBIDDEN", "We couldn't verify the form. Please try again.")

  const input = parseInput(feedbackSchema(new Set(pub.categories.map((c) => c.id))), raw)
  const category = pub.categories.find((c) => c.id === input.categoryId)!
  const severity =
    input.urgency === "urgent"
      ? maxSeverity(category.defaultSeverity, "high")
      : category.defaultSeverity

  const sys: TenantContext = {
    tenantId: pub.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const token = randomBytes(32).toString("base64url")
  const categoryId = parseInput(objectId, category.id)
  const report = {
    rating: input.rating ?? null,
    description: input.description ?? "",
    urgency: input.urgency,
  }

  const result = await withTransaction(async (session) => {
    const repo = tickets.forTenant(sys)
    const now = new Date()
    const open = await repo.findOne(
      {
        locationId: pub.locationId,
        categoryId,
        status: { $in: OPEN_TICKET_STATUSES },
        createdAt: { $gte: new Date(now.getTime() - DEDUPE_WINDOW_MS) },
      },
      { session, sort: { createdAt: -1 } },
    )

    if (open) {
      await repo.updateOne(
        { _id: open._id },
        {
          $inc: { reportCount: 1 },
          $push: { trackingTokenHashes: hash(token) },
          $set: { lastReportedAt: now },
        },
        { session },
      )
      await ticketActivities.forTenant(sys).insertOne(
        {
          branchId: open.branchId,
          ticketId: open._id,
          type: "report.added",
          actorId: "public",
          at: now,
          meta: report,
        },
        { session },
      )
      return { ticketId: open._id, number: open.number, trackingToken: token, duplicate: true }
    }

    const year = now.getUTCFullYear()
    const seq = await nextSequence(`${pub.tenantId.toHexString()}:tickets:${year}`, session)
    const number = `TKT-${year}-${String(seq).padStart(6, "0")}`
    const anonymous = !input.name && !input.email && !input.phone
    const autoAssignee = await pickAssignee(
      sys,
      { branchId: pub.branchId, locationId: pub.locationId, categoryId, severity },
      session,
    )
    const initialSla = await computeInitialTicketSla(
      sys,
      { branchId: pub.branchId, categoryId, severity, createdAt: now },
      session,
    )
    const initialStatus: TicketStatus = autoAssignee ? "assigned" : "new"

    const ticket = await repo.insertOne(
      {
        branchId: pub.branchId,
        locationId: pub.locationId,
        locationPath: pub.locationPath,
        qrCodeId: pub.qrId,
        number,
        source: "qr",
        categoryId,
        categoryName: category.label,
        severity,
        status: initialStatus,
        rating: report.rating,
        description: report.description,
        reporter: anonymous
          ? { anonymous: true }
          : { anonymous: false, name: input.name, email: input.email, phone: input.phone },
        trackingTokenHashes: [hash(token)],
        reportCount: 1,
        lastReportedAt: now,
        attachments: [],
        assignee: autoAssignee,
        currentLevel: 1,
        slaPolicyId: initialSla?.slaPolicyId ?? null,
        sla: initialSla?.sla ?? null,
        tags: [],
        reopenCount: 0,
      },
      { session },
    )
    await ticketActivities.forTenant(sys).insertOne(
      {
        branchId: ticket.branchId,
        ticketId: ticket._id,
        type: "ticket.created",
        actorId: "public",
        at: now,
        meta: report,
      },
      { session },
    )
    if (autoAssignee) {
      await ticketActivities.forTenant(sys).insertOne(
        {
          branchId: ticket.branchId,
          ticketId: ticket._id,
          type: "ticket.assigned",
          actorId: "system",
          actorName: "Auto-assignment",
          at: now,
          after: { status: "assigned", assignee: autoAssignee.name },
        },
        { session },
      )
    }
    return {
      ticketId: ticket._id,
      number,
      trackingToken: token,
      duplicate: false,
      assignee: autoAssignee,
    }
  })

  if (input.attachmentIds.length > 0) {
    const claimed = await claimPublicAttachments(
      sys,
      input.attachmentIds,
      input.attachmentTokens,
      result.ticketId,
    )
    if (claimed.length > 0) {
      await tickets
        .forTenant(sys)
        .updateOne({ _id: result.ticketId }, { $addToSet: { attachments: { $each: claimed } } })
    }
  }

  // Notify auto-assigned staff member
  if ("assignee" in result && result.assignee) {
    await notifyUser(sys, {
      userId: result.assignee.userId,
      type: "ticket.assigned",
      title: `New ticket ${result.number} · ${category.label}`,
      body: `${pub.locationPath.join(" › ")}${report.description ? `: ${report.description.slice(0, 140)}` : ""}`,
      href: `/tickets/${result.ticketId.toHexString()}`,
    })
  }

  // Reporter email/SMS confirmation if contact was provided (F-2.5 / P3 notifications)
  if (input.email || input.phone) {
    let baseUrl = "http://localhost:3000"
    try {
      baseUrl = env().BETTER_AUTH_URL
    } catch {
      // Test env without BETTER_AUTH_URL
    }
    await notifyReporterConfirmation({
      tenantName: pub.tenantName,
      ticketNumber: result.number,
      trackingUrl: `${baseUrl}/t/${result.trackingToken}`,
      locationName: pub.locationName,
      categoryName: category.label,
      email: input.email,
      phone: input.phone,
      duplicate: result.duplicate,
    })
  }

  return { number: result.number, trackingToken: result.trackingToken, duplicate: result.duplicate }
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Received",
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In progress",
  on_hold: "On hold",
  pending_verification: "Being verified",
  reopened: "Reopened",
  closed: "Resolved",
  cancelled: "Closed",
}

/** What the reporter's tracking link shows. Plain data only, and nothing about other people. */
export async function getPublicTicket(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null
  const t = await tickets.unscoped().findOne({ trackingTokenHashes: hash(token) })
  if (!t) return null
  const sys: TenantContext = {
    tenantId: t.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const [tenant, pubComments] = await Promise.all([
    tenantsCollection().findOne({ _id: t.tenantId }, { projection: { name: 1, branding: 1 } }),
    ticketComments
      .forTenant(sys)
      .find({ ticketId: t._id, visibility: "public" }, { sort: { createdAt: 1 } }),
  ])
  return {
    number: t.number,
    status: t.status,
    statusLabel: STATUS_LABELS[t.status],
    categoryName: t.categoryName,
    locationName: t.locationPath.at(-1) ?? "",
    locationPath: t.locationPath,
    tenantName: tenant?.name ?? "",
    branding: tenant?.branding ?? null,
    createdAt: t.createdAt.toISOString(),
    reportCount: t.reportCount,
    attachments: t.attachments ?? [],
    publicComments: pubComments.map((c) => ({
      id: c._id.toHexString(),
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
    requesterFeedback: t.requesterFeedback
      ? {
          resolved: t.requesterFeedback.resolved,
          rating: t.requesterFeedback.rating ?? null,
          comment: t.requesterFeedback.comment ?? "",
        }
      : null,
  }
}

const closureFeedbackSchema = z.object({
  resolved: z.boolean(),
  rating: z.preprocess(blank, z.coerce.number().int().min(1).max(5).optional()),
  comment: z.preprocess(blank, z.string().trim().max(1000).optional()),
})

/** Post-closure requester feedback from /t/[token] (phase.md F-5.3). One submission per ticket. */
export async function submitRequesterFeedback(
  token: string,
  raw: z.input<typeof closureFeedbackSchema>,
) {
  if (!token || token.length < 20 || token.length > 100) {
    throw new ApiError("NOT_FOUND", "Report not found.")
  }
  const t = await tickets.unscoped().findOne({ trackingTokenHashes: hash(token) })
  if (!t) throw new ApiError("NOT_FOUND", "Report not found.")
  if (t.status !== "closed") {
    throw new ApiError("CONFLICT", "Feedback can be submitted once the ticket is closed.")
  }
  if (t.requesterFeedback) {
    throw new ApiError("CONFLICT", "You have already rated this resolution.")
  }
  const input = parseInput(closureFeedbackSchema, raw)
  const sys: TenantContext = {
    tenantId: t.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const now = new Date()
  await withTransaction(async (session) => {
    await tickets.forTenant(sys).updateOne(
      { _id: t._id },
      {
        $set: {
          requesterFeedback: {
            resolved: input.resolved,
            rating: input.rating ?? null,
            comment: input.comment ?? "",
            submittedAt: now,
          },
        },
      },
      { session },
    )
    await ticketActivities.forTenant(sys).insertOne(
      {
        branchId: t.branchId,
        ticketId: t._id,
        type: "requester.feedback",
        actorId: "public",
        actorName: "Requester",
        at: now,
        note: input.comment,
        meta: { resolved: input.resolved, rating: input.rating ?? null },
      },
      { session },
    )
  })
}

export async function listTickets(
  ctx: TenantContext,
  {
    page = 1,
    pageSize = 25,
    status,
  }: { page?: number; pageSize?: number; status?: "open" | "all" } = {},
) {
  assertCan(ctx, "ticket:read")
  const filter = status === "open" ? { status: { $in: OPEN_TICKET_STATUSES } } : {}
  return tickets.forTenant(ctx).paginate(filter, { page, pageSize, sort: { createdAt: -1 } })
}

export async function listTicketActivities(ctx: TenantContext, ticketId: ObjectId) {
  assertCan(ctx, "ticket:read")
  return ticketActivities.forTenant(ctx).find({ ticketId }, { sort: { at: 1, _id: 1 } })
}

/** Dashboard numbers. Average rating covers the last 30 days. */
export async function ticketStats(ctx: TenantContext) {
  assertCan(ctx, "ticket:read")
  const repo = tickets.forTenant(ctx)
  const now = Date.now()
  const [open, last24h, rated] = await Promise.all([
    repo.count({ status: { $in: OPEN_TICKET_STATUSES } }),
    repo.count({ createdAt: { $gte: new Date(now - 86_400_000) } }),
    repo.find(
      { createdAt: { $gte: new Date(now - 30 * 86_400_000) }, rating: { $ne: null } },
      { limit: 5000 },
    ),
  ])
  const avgRating = rated.length
    ? Math.round((rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length) * 10) / 10
    : null
  return { open, avgRating, last24h }
}
