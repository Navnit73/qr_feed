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
import { resolvePublicQr } from "@/server/modules/qr-codes"
import { tenantsCollection } from "@/server/modules/tenants"
import { rateLimit } from "@/server/rate-limit"
import { assertCan } from "@/server/rbac/ability"
import {
  OPEN_TICKET_STATUSES,
  ticketActivities,
  tickets,
  type TicketStatus,
} from "@/server/repositories"
import { verifyTurnstile } from "@/server/turnstile"
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

  return withTransaction(async (session) => {
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
      return { number: open.number, trackingToken: token, duplicate: true }
    }

    const year = now.getUTCFullYear()
    const seq = await nextSequence(`${pub.tenantId.toHexString()}:tickets:${year}`, session)
    const number = `TKT-${year}-${String(seq).padStart(6, "0")}`
    const anonymous = !input.name && !input.email && !input.phone
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
        status: "new",
        rating: report.rating,
        description: report.description,
        reporter: anonymous
          ? { anonymous: true }
          : { anonymous: false, name: input.name, email: input.email, phone: input.phone },
        trackingTokenHashes: [hash(token)],
        reportCount: 1,
        lastReportedAt: now,
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
    return { number, trackingToken: token, duplicate: false }
  })
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
  const tenant = await tenantsCollection().findOne({ _id: t.tenantId }, { projection: { name: 1 } })
  return {
    number: t.number,
    status: t.status,
    statusLabel: STATUS_LABELS[t.status],
    categoryName: t.categoryName,
    locationName: t.locationPath.at(-1) ?? "",
    locationPath: t.locationPath,
    tenantName: tenant?.name ?? "",
    createdAt: t.createdAt.toISOString(),
    reportCount: t.reportCount,
  }
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
