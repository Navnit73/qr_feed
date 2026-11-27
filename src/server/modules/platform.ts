import "server-only"
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import type { ObjectId } from "mongodb"
import { after } from "next/server"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { env } from "@/server/env"
import { getTenant, PLAN_CATALOG, tenantsCollection, type PlanKey } from "@/server/modules/tenants"
import { assertCan, can } from "@/server/rbac/ability"
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

function webhookEncryptionKey(): Buffer {
  let secret = process.env.BETTER_AUTH_SECRET
  try {
    secret = env().BETTER_AUTH_SECRET
  } catch {
    secret ??= "qr-feed-test-fallback-webhook-key-0123456789"
  }
  return createHash("sha256").update(`webhook-secret:${secret}`).digest()
}

function encryptWebhookSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", webhookEncryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`
}

function decryptWebhookSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(".")
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted webhook secret")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    webhookEncryptionKey(),
    Buffer.from(ivB64, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

function isPrivateOrReservedIp(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower.startsWith("::ffff:")) {
    return isPrivateOrReservedIp(lower.slice(7))
  }
  if (isIP(ip) === 4) {
    const parts = ip.split(".").map(Number)
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true
    }
    const [a, b] = parts
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
    return false
  }
  if (isIP(ip) === 6) {
    if (lower === "::" || lower === "::1") return true
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true // ULA fc00::/7
    if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
    if (lower.startsWith("ff")) return true // multicast
    return false
  }
  return true
}

/** Syntactic SSRF check: requires public HTTPS URL with no credentials or local/private hostnames. */
export function isSafeExternalHttpsUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  if (parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!host) return false
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false
  }
  if (isIP(host) !== 0 && isPrivateOrReservedIp(host)) return false
  return true
}

/** Runtime SSRF guard before outbound fetch(): validates syntax and every resolved DNS address. */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  if (!isSafeExternalHttpsUrl(rawUrl)) {
    throw new ApiError("VALIDATION", "Webhook URL must be a public HTTPS endpoint.")
  }
  const parsed = new URL(rawUrl)
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host) === 0) {
    let records: { address: string }[]
    try {
      records = await lookup(host, { all: true })
    } catch {
      throw new ApiError("VALIDATION", "Could not resolve webhook hostname.")
    }
    if (records.length === 0 || records.some((r) => isPrivateOrReservedIp(r.address))) {
      throw new ApiError("FORBIDDEN", "Webhook target resolves to a private or blocked address.")
    }
  }
  return parsed
}

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

export function verifyHmacSignature(secret: string, body: string, providedHex: string): boolean {
  const expected = signWebhookPayload(secret, body)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(providedHex, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Verifies official Stripe `Stripe-Signature: t=<unix>,v1=<hex>` headers with a 5-min replay window. */
export function verifyStripeSignature(
  secret: string,
  body: string,
  header: string,
  nowMs = Date.now(),
): boolean {
  let timestamp: string | null = null
  const v1Sigs: string[] = []
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=")
    if (k === "t" && v) timestamp = v
    else if (k === "v1" && v) v1Sigs.push(v)
  }
  if (!timestamp || v1Sigs.length === 0) return false
  const tsNum = Number(timestamp)
  if (!Number.isFinite(tsNum) || Math.abs(nowMs / 1000 - tsNum) > 300) return false
  const signedPayload = `${timestamp}.${body}`
  return v1Sigs.some((sig) => verifyHmacSignature(secret, signedPayload, sig))
}

// ── Billing & Metering (F-9.1, F-9.2) ───────────────────────────────────────────────

export async function getBillingSummary(ctx: TenantContext) {
  if (!can(ctx, "billing:manage") && !can(ctx, "tenant:manage")) {
    throw new ApiError("FORBIDDEN", "You don't have permission to view billing.")
  }
  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const sys: TenantContext = { ...ctx, branchScope: "all" }
  const [sub, branchCount, locationCount, userCount, monthlyTickets] = await Promise.all([
    subscriptions.forTenant(sys).findOne({}),
    branches.forTenant(sys).count({ status: "active" }),
    locations.forTenant(sys).count({ status: "active" }),
    members.forTenant(sys).count({ status: "active" }),
    tickets.forTenant(sys).count({ createdAt: { $gte: monthStart } }),
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

const providerSchema = z.enum(["sandbox", "stripe", "razorpay"])

async function applyPlanUpdate(
  ctx: TenantContext,
  plan: PlanKey,
  provider: "sandbox" | "stripe" | "razorpay",
) {
  const catalog = PLAN_CATALOG[plan]
  if (!catalog) throw new ApiError("VALIDATION", "Unknown plan.")

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
    const tenant = await getTenant(ctx.tenantId, session)
    if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")
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

export async function changeTenantPlan(
  ctx: TenantContext,
  plan: PlanKey,
  provider: "sandbox" | "stripe" | "razorpay" = "sandbox",
) {
  assertCan(ctx, "billing:manage")
  const validProvider = parseInput(providerSchema, provider)
  if (!Object.hasOwn(PLAN_CATALOG, plan)) throw new ApiError("VALIDATION", "Unknown plan.")
  if (PLAN_CATALOG[plan].priceUsd === null) {
    throw new ApiError(
      "FORBIDDEN",
      "Enterprise plans require sales provisioning or a verified billing webhook.",
    )
  }
  if (validProvider !== "sandbox") {
    throw new ApiError(
      "FORBIDDEN",
      "External billing plans are activated via verified provider webhooks.",
    )
  }
  await applyPlanUpdate(ctx, plan, validProvider)
}

/** Invoked exclusively by the HMAC-verified Stripe/Razorpay billing webhook handler. */
export async function applyBillingWebhookPlan(
  tenantId: ObjectId,
  plan: PlanKey,
  provider: "stripe" | "razorpay",
) {
  const sys: TenantContext = {
    tenantId,
    actorId: `billing-webhook:${provider}`,
    roles: ["system"],
    permissions: new Set(),
    branchScope: "all",
  }
  await applyPlanUpdate(sys, plan, provider)
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
        branchScope: ctx.branchScope,
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
  // Throttle lastUsedAt writes to at most once every 5 minutes and run non-blocking via after().
  const now = new Date()
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > 5 * 60_000) {
    const touch = () =>
      apiKeys
        .unscoped()
        .updateOne({ _id: key._id }, { $set: { lastUsedAt: now } })
        .catch(() => {})
    try {
      after(touch)
    } catch {
      void touch()
    }
  }
  return {
    tenantId: key.tenantId,
    actorId: `apikey:${key._id.toHexString()}`,
    roles: ["api_key"],
    permissions: new Set(key.scopes as Permission[]),
    branchScope: key.branchScope ?? "all",
  }
}

// ── Webhooks (F-9.4) ────────────────────────────────────────────────────────────────

const webhookSchema = z.object({
  name: name("webhook name", 2),
  url: z
    .url({ error: "Enter a valid HTTPS URL" })
    .refine(isSafeExternalHttpsUrl, "Use a public https:// URL (local/private addresses blocked)"),
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
        signingSecretEnc: encryptWebhookSecret(secret),
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

  const safeUrl = await assertSafeOutboundUrl(hook.url)
  const signingSecret = hook.signingSecretEnc
    ? decryptWebhookSecret(hook.signingSecretEnc)
    : hook.secretHash

  const payload = JSON.stringify({
    event: "webhook.ping",
    tenantId: ctx.tenantId.toHexString(),
    sentAt: new Date().toISOString(),
  })
  let statusCode = 0
  let ok = false
  let snippet = ""
  try {
    const res = await fetch(safeUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QRFeed-Event": "webhook.ping",
        "X-QRFeed-Signature": signWebhookPayload(signingSecret, payload),
      },
      body: payload,
      redirect: "error",
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

async function deliverSingleWebhook(
  sys: TenantContext,
  hook: { _id: ObjectId; url: string; signingSecretEnc?: string; secretHash: string },
  event: string,
  body: string,
) {
  let statusCode = 0
  let ok = false
  let snippet = ""
  try {
    const safeUrl = await assertSafeOutboundUrl(hook.url)
    const signingSecret = hook.signingSecretEnc
      ? decryptWebhookSecret(hook.signingSecretEnc)
      : hook.secretHash
    const res = await fetch(safeUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QRFeed-Event": event,
        "X-QRFeed-Signature": signWebhookPayload(signingSecret, body),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    })
    statusCode = res.status
    ok = res.ok
    snippet = (await res.text()).slice(0, 200)
  } catch (err) {
    snippet = err instanceof Error ? err.message.slice(0, 200) : "Delivery failed"
  }
  await webhookDeliveries
    .forTenant(sys)
    .insertOne({
      webhookId: hook._id,
      event,
      statusCode,
      ok,
      responseSnippet: snippet,
      deliveredAt: new Date(),
    })
    .catch(() => {})
}

async function deliverConnectorMessage(url: string, text: string) {
  try {
    const safeUrl = await assertSafeOutboundUrl(url)
    await fetch(safeUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Non-fatal connector delivery failure
  }
}

/**
 * Dispatches real outbound webhooks + Slack/Teams connector alerts (phase.md F-9.4).
 * Runs non-blocking via Next.js `after()` when inside a request, or inline when awaited in workers.
 * Skipped during Vitest runs to keep unit/integration tests fast and offline.
 */
export function dispatchWebhookEvent(
  ctx: TenantContext,
  event: string,
  data: Record<string, unknown>,
  { inline = false }: { inline?: boolean } = {},
): Promise<void> | void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return
  const sys: TenantContext = { ...ctx, branchScope: "all" }
  const run = async () => {
    const [hooks, tenant] = await Promise.all([
      webhooks.forTenant(sys).find({ active: true, events: event }),
      getTenant(ctx.tenantId),
    ])
    const slackUrl = tenant?.settings?.slackWebhookUrl
    const teamsUrl = tenant?.settings?.teamsWebhookUrl
    if (hooks.length === 0 && !slackUrl && !teamsUrl) return

    const body = JSON.stringify({
      event,
      tenantId: ctx.tenantId.toHexString(),
      sentAt: new Date().toISOString(),
      data,
    })

    const tasks: Promise<unknown>[] = hooks.map((hook) =>
      deliverSingleWebhook(sys, hook, event, body),
    )

    if (slackUrl || teamsUrl) {
      const summary = `[QR Feed · ${tenant?.name ?? "Workspace"}] ${event}: ${
        typeof data.number === "string" ? data.number : ""
      } ${typeof data.summary === "string" ? data.summary : ""}`.trim()
      if (slackUrl) tasks.push(deliverConnectorMessage(slackUrl, summary))
      if (teamsUrl) tasks.push(deliverConnectorMessage(teamsUrl, summary))
    }

    await Promise.allSettled(tasks)
  }

  if (inline) return run()
  try {
    after(run)
  } catch {
    void run()
  }
}

/**
 * Background data-retention sweep (phase.md §10, F-9.5): automatically anonymises reporter PII
 * on closed/cancelled tickets older than each tenant's configured `settings.retentionDays`.
 */
export async function sweepDataRetention(now = new Date()): Promise<number> {
  const configured = await tenantsCollection()
    .find(
      { status: "active", "settings.retentionDays": { $gt: 0 } },
      { projection: { _id: 1, "settings.retentionDays": 1 } },
    )
    .toArray()
  if (configured.length === 0) return 0

  let total = 0
  for (const tenant of configured) {
    const days = tenant.settings?.retentionDays ?? 0
    if (days <= 0) continue
    const cutoff = new Date(now.getTime() - days * 86_400_000)
    const sys: TenantContext = {
      tenantId: tenant._id,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }
    const count = await tickets.forTenant(sys).updateMany(
      {
        status: { $in: ["closed", "cancelled"] },
        createdAt: { $lte: cutoff },
        "reporter.anonymous": false,
      },
      { $set: { reporter: { anonymous: true } } },
    )
    if (count > 0) {
      total += count
      await appendAudit(sys, {
        action: "tenant.retention_sweep_anonymised",
        entity: "tenant",
        entityId: tenant._id,
        after: { retentionDays: days, anonymisedTickets: count },
      }).catch(() => {})
    }
  }
  return total
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
  if (!Number.isFinite(olderThanDays) || olderThanDays < 0 || olderThanDays > 3650) {
    throw new ApiError("VALIDATION", "Retention window must be between 0 and 3650 days.")
  }
  const safeDays = Math.floor(olderThanDays)
  const cutoff = new Date(Date.now() - safeDays * 86_400_000)
  return withTransaction(async (session) => {
    const count = await tickets.forTenant({ ...ctx, branchScope: "all" }).updateMany(
      {
        status: { $in: ["closed", "cancelled"] },
        createdAt: { $lte: cutoff },
        "reporter.anonymous": false,
      },
      { $set: { reporter: { anonymous: true } } },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "tenant.reporter_pii_anonymised",
        entity: "tenant",
        entityId: ctx.tenantId,
        after: { olderThanDays: safeDays, anonymisedTickets: count },
      },
      { session },
    )
    return count
  })
}

export async function requestTenantDeletion(ctx: TenantContext, confirmSlug: string) {
  assertCan(ctx, "tenant:manage")
  await withTransaction(async (session) => {
    const tenant = await getTenant(ctx.tenantId, session)
    if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")
    if (confirmSlug.trim().toLowerCase() !== tenant.slug.toLowerCase()) {
      throw new ApiError("VALIDATION", `Type "${tenant.slug}" exactly to confirm.`, {
        confirmSlug: [`Must match ${tenant.slug}`],
      })
    }
    await tenantsCollection().updateOne(
      { _id: ctx.tenantId },
      { $set: { status: "suspended", updatedAt: new Date() } },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "tenant.deletion_requested",
        entity: "tenant",
        entityId: ctx.tenantId,
        after: { slug: tenant.slug, status: "suspended" },
      },
      { session },
    )
  })
}
