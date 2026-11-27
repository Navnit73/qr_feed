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
import {
  membersWhoCan,
  notifyReporterConfirmation,
  notifyUser,
} from "@/server/modules/notifications"
import { dispatchWebhookEvent } from "@/server/modules/platform"
import { resolvePublicQr } from "@/server/modules/qr-codes"
import { computeInitialTicketSla } from "@/server/modules/sla"
import { assertWithinLimit, tenantsCollection } from "@/server/modules/tenants"
import { rateLimit } from "@/server/rate-limit"
import { assertCan, resolveAccess } from "@/server/rbac/ability"
import {
  attachments,
  categories,
  members,
  OPEN_TICKET_STATUSES,
  roles as rolesRepo,
  ticketActivities,
  ticketComments,
  tickets,
  type TicketStatus,
} from "@/server/repositories"
import { inBranchScope } from "@/server/db/tenant-context"
import { appBaseUrl } from "@/server/public-url"
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
  /** Whether to merge repeat open reports at the same spot within 2h. Defaults to true. */
  dedupe?: boolean
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

  let allocatedSeq: number | undefined
  const shouldDedupe = opts.dedupe !== false

  const result = await withTransaction(async (session) => {
    const repo = tickets.forTenant(sys)
    const now = new Date()
    const open = shouldDedupe
      ? await repo.findOne(
          {
            locationId: pub.locationId,
            categoryId,
            status: { $in: OPEN_TICKET_STATUSES },
            createdAt: { $gte: new Date(now.getTime() - DEDUPE_WINDOW_MS) },
          },
          { session, sort: { createdAt: -1 } },
        )
      : null

    if (open) {
      const nextSeverity = maxSeverity(open.severity, severity)
      await repo.updateOne(
        { _id: open._id },
        {
          $inc: { reportCount: 1 },
          $push: { trackingTokenHashes: hash(token) },
          $set: {
            lastReportedAt: now,
            ...(nextSeverity !== open.severity ? { severity: nextSeverity } : {}),
          },
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

    // Enforce tenant monthly ticket quota (phase.md F-9.1).
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthlyCount = await repo.count({ createdAt: { $gte: monthStart } }, { session })
    await assertWithinLimit(sys, "monthlyTickets", monthlyCount, session)

    const year = now.getUTCFullYear()
    // Allocate the sequence atomically outside the transaction so concurrent submissions don't
    // serialize on a single counter document lock across the full transaction RTT.
    allocatedSeq ??= await nextSequence(`${pub.tenantId.toHexString()}:tickets:${year}`)
    const number = `TKT-${year}-${String(allocatedSeq).padStart(6, "0")}`
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
      hash(result.trackingToken),
    )
    if (claimed.length > 0) {
      await tickets
        .forTenant(sys)
        .updateOne({ _id: result.ticketId }, { $addToSet: { attachments: { $each: claimed } } })
    }
  }

  // A new ticket goes to whoever it was auto-assigned to; if nobody, to the people who can
  // assign it in that branch, so it doesn't sit unseen. Merged repeat reports aren't news.
  if (!result.duplicate) {
    const notice = {
      title: `New ticket ${result.number} · ${category.label}`,
      body: report.description
        ? report.description.slice(0, 280)
        : `${category.label} reported at ${pub.locationPath.join(" › ")}.`,
      href: `/tickets/${result.ticketId.toHexString()}`,
      details: [
        ["Ticket", result.number],
        ["Location", `${pub.branchName} › ${pub.locationPath.join(" › ")}`],
        ["Issue", category.label],
        ["Priority", severity],
        ...(report.rating ? [["Rating", `${report.rating}/5`]] : []),
      ] as [string, string][],
    }
    if ("assignee" in result && result.assignee) {
      await notifyUser(sys, {
        ...notice,
        userId: result.assignee.userId,
        type: "ticket.assigned",
        cta: "Open ticket",
      })
    } else {
      const assigners = await membersWhoCan(sys, ["ticket:assign"], pub.branchId)
      await Promise.allSettled(
        assigners.map((m) =>
          notifyUser(sys, {
            ...notice,
            userId: m.userId,
            type: "ticket.created",
            body: `Nobody was auto-assigned. ${notice.body}`,
            cta: "Assign ticket",
          }),
        ),
      )
    }
  }

  // Reporter email/SMS confirmation if contact was provided (F-2.5 / P3 notifications)
  if (input.email || input.phone) {
    let baseUrl = "http://localhost:3000"
    try {
      baseUrl = appBaseUrl()
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

  if (!result.duplicate) {
    dispatchWebhookEvent(sys, "ticket.created", {
      ticketId: result.ticketId.toHexString(),
      number: result.number,
      source: "qr",
      category: category.label,
      severity,
      location: pub.locationPath.join(" › "),
      summary: `${category.label} at ${pub.locationPath.join(" › ")} (${severity})`,
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
  const tokenHash = hash(token)
  const t = await tickets.unscoped().findOne({ trackingTokenHashes: tokenHash })
  if (!t) return null
  const sys: TenantContext = {
    tenantId: t.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const attIds = (t.attachments ?? [])
    .filter((id) => objectId.safeParse(id).success)
    .map((id) => parseInput(objectId, id))
  const [tenant, pubComments, attDocs, catDoc] = await Promise.all([
    tenantsCollection().findOne({ _id: t.tenantId }, { projection: { name: 1, branding: 1 } }),
    ticketComments
      .forTenant(sys)
      .find({ ticketId: t._id, visibility: "public" }, { sort: { createdAt: 1 } }),
    attIds.length > 0 ? attachments.forTenant(sys).find({ _id: { $in: attIds } }) : [],
    categories.forTenant(sys).findById(t.categoryId, { projection: { key: 1 } }),
  ])
  const visibleAttachments = attDocs
    .filter((doc) => !doc.reporterTokenHash || doc.reporterTokenHash === tokenHash)
    .map((doc) => doc._id.toHexString())

  return {
    number: t.number,
    status: t.status,
    statusLabel: STATUS_LABELS[t.status],
    categoryKey: catDoc?.key ?? null,
    categoryName: t.categoryName,
    locationName: t.locationPath.at(-1) ?? "",
    locationPath: t.locationPath,
    tenantName: tenant?.name ?? "",
    branding: tenant?.branding ?? null,
    createdAt: t.createdAt.toISOString(),
    reportCount: t.reportCount,
    attachments: visibleAttachments,
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
    const updated = await tickets.forTenant(sys).updateOne(
      {
        _id: t._id,
        status: "closed",
        $or: [{ requesterFeedback: null }, { requesterFeedback: { $exists: false } }],
      },
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
    if (!updated) {
      throw new ApiError("CONFLICT", "Feedback can no longer be submitted for this report.")
    }
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

  // Alert verifiers/admins when a requester reports the issue is NOT resolved.
  if (!input.resolved) {
    const [allActive, customRoles] = await Promise.all([
      members.forTenant(sys).find({ status: "active" }),
      rolesRepo.forTenant(sys).find({}),
    ])
    const targets = allActive.filter((m) => {
      const access = resolveAccess(m, customRoles)
      return (
        (access.permissions.has("ticket:verify") || access.permissions.has("ticket:close")) &&
        inBranchScope(access.branchScope, t.branchId)
      )
    })
    await Promise.allSettled(
      targets.slice(0, 5).map((m) =>
        notifyUser(sys, {
          userId: m.userId,
          type: "ticket.reopened",
          title: `Requester unsatisfied · ${t.number}`,
          body: input.comment
            ? `Requester reported issue still unresolved: ${input.comment.slice(0, 140)}`
            : `Requester reported ${t.categoryName} at ${t.locationPath.at(-1)} is still unresolved.`,
          href: `/tickets/${t._id.toHexString()}`,
        }),
      ),
    )
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

/** Dashboard/list numbers via fast MongoDB aggregation (no 5,000-doc client scan). */
export async function ticketStats(ctx: TenantContext) {
  assertCan(ctx, "ticket:read")
  const repo = tickets.forTenant(ctx)
  const now = Date.now()
  const dayAgo = new Date(now - 86_400_000)
  const monthAgo = new Date(now - 30 * 86_400_000)
  const [open, last24h, ratingAgg] = await Promise.all([
    repo.count({ status: { $in: OPEN_TICKET_STATUSES } }),
    repo.count({ createdAt: { $gte: dayAgo } }),
    repo.aggregate<{ _id: null; avg: number }>([
      { $match: { createdAt: { $gte: monthAgo }, rating: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]),
  ])
  const rawAvg = ratingAgg[0]?.avg
  const avgRating = typeof rawAvg === "number" ? Math.round(rawAvg * 10) / 10 : null
  return { open, avgRating, last24h }
}
