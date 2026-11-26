import "server-only"
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { getTenant, PLAN_CATALOG, tenantsCollection, type PlanKey } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import { isPermission, type Permission } from "@/server/rbac/permissions"
import {
  apiKeys,
  auditLogs,
  audits,
  branches,
  capas,
  categories,
  locations,
  members,
  rcas,
  subscriptions,
  ticketComments,
  tickets,
  webhookDeliveries,
  webhooks,
} from "@/server/repositories"
import { name, objectId } from "@/server/validation"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

export function verifyHmacSignature(secret: string, body: string, providedHex: string): boolean {
  const expected = signWebhookPayload(secret, body)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(providedHex, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Billing & Metering (F-9.1, F-9.2) ───────────────────────────────────────────────

export async function getBillingSummary(ctx: TenantContext) {
  assertCan(ctx, "tenant:manage")
  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const [sub, branchCount, locationCount, userCount, monthlyTickets] = await Promise.all([
    subscriptions.forTenant(ctx).findOne({}),
    branches.forTenant(ctx).count({ status: "active" }),
    locations.forTenant(ctx).count({ status: "active" }),
    members.forTenant(ctx).count({ status: "active" }),
    tickets.forTenant(ctx).count({ createdAt: { $gte: monthStart } }),
  ])

  const limits = {
    branches: tenant.limits.branches,
    users: tenant.limits.users,
    locations: tenant.limits.locations,
    monthlyTickets: tenant.limits.monthlyTickets ?? PLAN_CATALOG[tenant.plan].limits.monthlyTickets,
  }

  return {
    plan: tenant.plan,
    status: sub?.status ?? (tenant.plan === "trial" ? "trialing" : "active"),
    provider: sub?.provider ?? "sandbox",
    currentPeriodEnd:
      sub?.currentPeriodEnd ?? new Date(tenant.createdAt.getTime() + 14 * 86_400_000),
    limits,
    usage: {
      branches: branchCount,
      locations: locationCount,
      users: userCount,
      monthlyTickets,
    },
    invoices: sub?.invoices ?? [],
  }
}

export async function changeTenantPlan(
  ctx: TenantContext,
  plan: PlanKey,
  provider: "sandbox" | "stripe" | "razorpay" = "sandbox",
) {
  assertCan(ctx, "billing:manage")
  const catalog = PLAN_CATALOG[plan]
  if (!catalog) throw new ApiError("VALIDATION", "Unknown plan.")

  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 86_400_000)

  const invoice = {
    id: `INV-${now.getUTCFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`,
    plan,
    amountUsd: catalog.priceUsd ?? 0,
    status: "paid" as const,
    issuedAt: now,
  }

  await withTransaction(async (session) => {
    await tenantsCollection().updateOne(
      { _id: ctx.tenantId },
      { $set: { plan, limits: catalog.limits, updatedAt: now } },
      { session },
    )
    const subRepo = subscriptions.forTenant(ctx)
    const existing = await subRepo.findOne({}, { session })
    if (existing) {
      await subRepo.updateOne(
        { _id: existing._id },
        {
          $set: {
            plan,
            status: plan === "trial" ? "trialing" : "active",
            provider,
            currentPeriodEnd: periodEnd,
          },
          $push: { invoices: invoice },
        },
        { session },
      )
    } else {
      await subRepo.insertOne(
        {
          plan,
          status: plan === "trial" ? "trialing" : "active",
          provider,
          currentPeriodEnd: periodEnd,
          invoices: [invoice],
        },
        { session },
      )
    }
    await appendAudit(
      ctx,
      {
        action: "billing.plan_changed",
        entity: "subscription",
        entityId: ctx.tenantId,
        before: { plan: tenant.plan },
        after: { plan, provider, invoiceId: invoice.id },
      },
      { session },
    )
  })
}

// ── API Keys (F-9.4) ────────────────────────────────────────────────────────────────

const apiKeySchema = z.object({
  name: name("API key name", 2),
  scopes: z
    .array(z.string())
    .min(1, "Pick at least one scope")
    .refine((list) => list.every(isPermission), "Invalid scope"),
})

export async function listApiKeys(ctx: TenantContext) {
  assertCan(ctx, "settings:manage")
  return apiKeys.forTenant(ctx).find({}, { sort: { createdAt: -1 } })
}

export async function createApiKey(ctx: TenantContext, raw: z.input<typeof apiKeySchema>) {
  assertCan(ctx, "settings:manage")
  const input = parseInput(apiKeySchema, raw)
  for (const s of input.scopes) {
    if (!ctx.permissions.has(s as Permission)) {
      throw new ApiError("FORBIDDEN", "Cannot grant an API key more permissions than you hold.")
    }
  }

  const secret = randomBytes(24).toString("base64url")
  const rawKey = `qrf_live_${secret}`
  const prefix = rawKey.slice(0, 14)

  const doc = await withTransaction(async (session) => {
    const created = await apiKeys.forTenant(ctx).insertOne(
      {
        name: input.name,
        prefix,
        keyHash: sha256(rawKey),
        scopes: [...new Set(input.scopes)],
        createdBy: ctx.actorId,
        lastUsedAt: null,
        revokedAt: null,
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "api_key.created",
        entity: "apiKey",
        entityId: created._id,
        after: { name: created.name, prefix, scopes: created.scopes },
      },
      { session },
    )
    return created
  })

  return { doc, rawKey }
}

export async function revokeApiKey(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  await withTransaction(async (session) => {
    const updated = await apiKeys
      .forTenant(ctx)
      .updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session })
    if (!updated) throw new ApiError("NOT_FOUND", "API key not found.")
    await appendAudit(
      ctx,
      {
        action: "api_key.revoked",
        entity: "apiKey",
        entityId: id,
        before: { name: updated.name, prefix: updated.prefix },
      },
      { session },
    )
  })
}

/** Authenticates a Bearer API key without trusting any client-supplied tenantId. */
export async function authenticateApiKey(rawKey: string): Promise<TenantContext | null> {
  if (!rawKey.startsWith("qrf_") || rawKey.length < 20) return null
  const key = await apiKeys.unscoped().findOne({ keyHash: sha256(rawKey), revokedAt: null })
  if (!key) return null
  const tenant = await getTenant(key.tenantId)
  if (!tenant || tenant.status !== "active") return null
  await apiKeys.unscoped().updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } })
  return {
    tenantId: key.tenantId,
    actorId: `apikey:${key._id.toHexString()}`,
    roles: ["api_key"],
    permissions: new Set(key.scopes as Permission[]),
    branchScope: "all",
  }
}

// ── Webhooks (F-9.4) ────────────────────────────────────────────────────────────────

const webhookSchema = z.object({
  name: name("webhook name", 2),
  url: z.url({ error: "Enter a valid HTTPS URL" }),
  events: z.array(z.string().min(2)).min(1, "Pick at least one event"),
})

export async function listWebhooks(ctx: TenantContext) {
  assertCan(ctx, "settings:manage")
  const [hooks, deliveries] = await Promise.all([
    webhooks.forTenant(ctx).find({}, { sort: { createdAt: -1 } }),
    webhookDeliveries.forTenant(ctx).find({}, { sort: { deliveredAt: -1 }, limit: 25 }),
  ])
  return { hooks, deliveries }
}

export async function createWebhook(ctx: TenantContext, raw: z.input<typeof webhookSchema>) {
  assertCan(ctx, "settings:manage")
  const input = parseInput(webhookSchema, raw)
  const secret = `whsec_${randomBytes(20).toString("hex")}`
  const secretPreview = `${secret.slice(0, 10)}…${secret.slice(-4)}`

  const doc = await withTransaction(async (session) => {
    const created = await webhooks.forTenant(ctx).insertOne(
      {
        name: input.name,
        url: input.url,
        events: [...new Set(input.events)],
        secretHash: sha256(secret),
        secretPreview,
        active: true,
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "webhook.created",
        entity: "webhook",
        entityId: created._id,
        after: { name: created.name, url: created.url, events: created.events },
      },
      { session },
    )
    return created
  })
  return { doc, secret }
}

export async function deleteWebhook(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  await withTransaction(async (session) => {
    const ok = await webhooks.forTenant(ctx).deleteOne({ _id: id }, { session })
    if (!ok) throw new ApiError("NOT_FOUND", "Webhook not found.")
    await appendAudit(
      ctx,
      { action: "webhook.deleted", entity: "webhook", entityId: id },
      { session },
    )
  })
}

export async function pingWebhook(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  const hook = await webhooks.forTenant(ctx).findById(id)
  if (!hook) throw new ApiError("NOT_FOUND", "Webhook not found.")
  const payload = JSON.stringify({
    event: "webhook.ping",
    tenantId: ctx.tenantId.toHexString(),
    sentAt: new Date().toISOString(),
  })
  let statusCode = 0
  let ok = false
  let snippet = ""
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QRFeed-Event": "webhook.ping",
        "X-QRFeed-Signature": signWebhookPayload(hook.secretHash, payload),
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    })
    statusCode = res.status
    ok = res.ok
    snippet = (await res.text()).slice(0, 200)
  } catch (err) {
    snippet = err instanceof Error ? err.message.slice(0, 200) : "Connection failed"
  }

  return webhookDeliveries.forTenant(ctx).insertOne({
    webhookId: hook._id,
    event: "webhook.ping",
    statusCode,
    ok,
    responseSnippet: snippet,
    deliveredAt: new Date(),
  })
}

// ── GDPR / DPDP Data Export, Anonymisation & Deletion (F-9.5) ───────────────────────

export async function exportTenantData(ctx: TenantContext) {
  assertCan(ctx, "tenant:manage")
  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")
  const sys: TenantContext = { ...ctx, branchScope: "all" }

  const [
    branchList,
    locationList,
    categoryList,
    ticketList,
    commentList,
    rcaList,
    capaList,
    auditList,
    logList,
  ] = await Promise.all([
    branches.forTenant(sys).find({}),
    locations.forTenant(sys).find({}),
    categories.forTenant(sys).find({}),
    tickets.forTenant(sys).find({}, { limit: 10000 }),
    ticketComments.forTenant(sys).find({}, { limit: 20000 }),
    rcas.forTenant(sys).find({}, { limit: 5000 }),
    capas.forTenant(sys).find({}, { limit: 5000 }),
    audits.forTenant(sys).find({}, { limit: 5000 }),
    auditLogs.forTenant(sys).find({}, { sort: { seq: 1 }, limit: 10000 }),
  ])

  await appendAudit(ctx, {
    action: "tenant.data_exported",
    entity: "tenant",
    entityId: ctx.tenantId,
    after: { tickets: ticketList.length, rcas: rcaList.length, audits: auditList.length },
  })

  return {
    exportedAt: new Date().toISOString(),
    tenant: {
      id: tenant._id.toHexString(),
      name: tenant.name,
      slug: tenant.slug,
      industry: tenant.industry,
      plan: tenant.plan,
    },
    branches: branchList,
    locations: locationList,
    categories: categoryList,
    tickets: ticketList.map((t) => {
      const copy = { ...t }
      delete (copy as Partial<typeof copy>).trackingTokenHashes
      return copy
    }),
    comments: commentList,
    rcas: rcaList,
    capas: capaList,
    audits: auditList,
    auditLogs: logList,
  }
}

/** Strips PII (reporter name/email/phone) from closed tickets older than `olderThanDays`. */
export async function anonymiseOldReporterData(ctx: TenantContext, olderThanDays: number) {
  assertCan(ctx, "tenant:manage")
  const cutoff = new Date(Date.now() - Math.max(0, olderThanDays) * 86_400_000)
  const count = await tickets.forTenant({ ...ctx, branchScope: "all" }).updateMany(
    {
      status: { $in: ["closed", "cancelled"] },
      createdAt: { $lte: cutoff },
      "reporter.anonymous": false,
    },
    { $set: { reporter: { anonymous: true } } },
  )
  await appendAudit(ctx, {
    action: "tenant.reporter_pii_anonymised",
    entity: "tenant",
    entityId: ctx.tenantId,
    after: { olderThanDays, anonymisedTickets: count },
  })
  return count
}

export async function requestTenantDeletion(ctx: TenantContext, confirmSlug: string) {
  assertCan(ctx, "tenant:manage")
  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")
  if (confirmSlug.trim().toLowerCase() !== tenant.slug.toLowerCase()) {
    throw new ApiError("VALIDATION", `Type "${tenant.slug}" exactly to confirm.`, {
      confirmSlug: [`Must match ${tenant.slug}`],
    })
  }
  await tenantsCollection().updateOne(
    { _id: ctx.tenantId },
    { $set: { status: "suspended", updatedAt: new Date() } },
  )
  await appendAudit(ctx, {
    action: "tenant.deletion_requested",
    entity: "tenant",
    entityId: ctx.tenantId,
    after: { slug: tenant.slug, status: "suspended" },
  })
}
