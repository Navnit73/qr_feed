import "server-only"
import type { ClientSession } from "mongodb"
import { ObjectId } from "mongodb"
import { cache } from "react"
import { ApiError } from "@/lib/api/errors"
import { appendAudit } from "@/server/audit/audit-log"
import { db } from "@/server/db/client"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { assertCan, can } from "@/server/rbac/ability"

/*
 * The tenants collection is global (it defines tenants), so it lives outside the scoped
 * repositories. Only onboarding, session resolution and the super-admin console touch it.
 */

export const INDUSTRIES = ["hospital", "clinic", "hotel", "mall", "manufacturing", "other"] as const
export type Industry = (typeof INDUSTRIES)[number]

export type PlanKey = "trial" | "starter" | "growth" | "business" | "enterprise"
export type PlanLimits = {
  branches: number
  users: number
  locations: number
  monthlyTickets?: number
}
export const TRIAL_LIMITS: PlanLimits = {
  branches: 3,
  users: 15,
  locations: 200,
  monthlyTickets: 500,
}

export const PLAN_CATALOG: Record<
  PlanKey,
  { name: string; priceUsd: number | null; limits: Required<PlanLimits>; summary: string }
> = {
  trial: {
    name: "Trial",
    priceUsd: 0,
    limits: { branches: 3, users: 15, locations: 200, monthlyTickets: 500 },
    summary: "14-day full access trial for pilot evaluation.",
  },
  starter: {
    name: "Starter",
    priceUsd: 39,
    limits: { branches: 1, users: 10, locations: 100, monthlyTickets: 300 },
    summary: "1 branch, up to 10 users, 300 tickets/mo, basic SLA.",
  },
  growth: {
    name: "Growth",
    priceUsd: 79,
    limits: { branches: 3, users: 30, locations: 500, monthlyTickets: 1500 },
    summary: "3 branches, up to 30 users, SLA escalation & RCA/CAPA.",
  },
  business: {
    name: "Business",
    priceUsd: 149,
    limits: { branches: 10, users: 100, locations: 2000, monthlyTickets: 10000 },
    summary: "10 branches, audits, analytics, exports & API.",
  },
  enterprise: {
    name: "Enterprise",
    priceUsd: null,
    limits: { branches: 100, users: 1000, locations: 25000, monthlyTickets: 100000 },
    summary: "Custom limits, white-label, SSO, webhooks & dedicated SLA.",
  },
}

export type TenantBranding = {
  logoUrl?: string
  primaryColor?: string
  customDomain?: string
  emailSenderDomain?: string
  publicDisclaimer?: string
}

export type TenantSettings = {
  autoCloseDays?: number
  repeatRcaThreshold?: number
  retentionDays?: number
  slackWebhookUrl?: string
  teamsWebhookUrl?: string
  whatsappEnabled?: boolean
  sso?: {
    enabled: boolean
    provider: "oidc" | "saml"
    issuerUrl?: string
    clientId?: string
    domain?: string
  }
}

export type TenantRecord = {
  _id: ObjectId
  name: string
  slug: string
  industry: Industry
  plan: PlanKey
  status: "active" | "suspended"
  limits: PlanLimits
  branding?: TenantBranding
  settings?: TenantSettings
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export const tenantsCollection = () => db().collection<TenantRecord>("tenants")

const getTenantCached = cache(async (tenantHex: string) =>
  tenantsCollection().findOne({ _id: new ObjectId(tenantHex) }),
)

export async function getTenant(tenantId: ObjectId, session?: ClientSession) {
  if (session) return tenantsCollection().findOne({ _id: tenantId }, { session })
  return getTenantCached(tenantId.toHexString())
}

/** Throws CONFLICT when adding one more would pass the plan's limit. */
export async function assertWithinLimit(
  ctx: TenantContext,
  kind: keyof PlanLimits,
  currentCount: number,
  session?: ClientSession,
) {
  const tenant = await getTenant(ctx.tenantId, session)
  const limit = tenant?.limits[kind] ?? 0
  if (currentCount >= limit) {
    throw new ApiError(
      "CONFLICT",
      `Your plan allows ${limit} ${kind}. Upgrade the plan or archive one first.`,
    )
  }
}

// ── Super-admin console ──────────────────────────────────────────────────────────────

export async function listTenants() {
  return tenantsCollection().find({}).sort({ createdAt: -1 }).limit(500).toArray()
}

/** A context for platform staff acting inside a tenant: logged, never permission-bearing. */
function platformContext(actorId: string, tenantId: ObjectId): TenantContext {
  return { tenantId, actorId, roles: ["super_admin"], permissions: new Set(), branchScope: "all" }
}

export async function setTenantStatus({
  actorId,
  tenantId,
  status,
}: {
  actorId: string
  tenantId: ObjectId
  status: TenantRecord["status"]
}) {
  return withTransaction(async (session) => {
    const before = await getTenant(tenantId, session)
    if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
    if (before.status === status) return before
    const after = await tenantsCollection().findOneAndUpdate(
      { _id: tenantId },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after", session },
    )
    await appendAudit(
      platformContext(actorId, tenantId),
      {
        action: status === "suspended" ? "tenant.suspended" : "tenant.reactivated",
        entity: "tenant",
        entityId: tenantId,
        before: { status: before.status },
        after: { status },
      },
      { session },
    )
    return after!
  })
}

export async function setTenantLimits({
  actorId,
  tenantId,
  limits,
  plan,
}: {
  actorId: string
  tenantId: ObjectId
  limits: PlanLimits
  plan?: PlanKey
}) {
  await withTransaction(async (session) => {
    const before = await getTenant(tenantId, session)
    if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
    const $set: Record<string, unknown> = { limits, updatedAt: new Date() }
    if (plan) $set.plan = plan
    await tenantsCollection().updateOne({ _id: tenantId }, { $set }, { session })
    await appendAudit(
      platformContext(actorId, tenantId),
      {
        action: "tenant.limits_changed",
        entity: "tenant",
        entityId: tenantId,
        before: { plan: before.plan, limits: before.limits },
        after: { plan: plan ?? before.plan, limits },
      },
      { session },
    )
  })
}

function assertHttpsUrlIfPresent(raw: string | undefined, field: string) {
  if (!raw) return
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ApiError("VALIDATION", `Enter a valid HTTPS URL for ${field}.`, {
      [field]: ["Enter a valid HTTPS URL"],
    })
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ApiError("VALIDATION", `Only HTTPS URLs are allowed for ${field}.`, {
      [field]: ["Use an https:// URL without credentials"],
    })
  }
}

export async function updateTenantBranding(ctx: TenantContext, branding: TenantBranding) {
  assertCan(ctx, "tenant:manage")
  assertHttpsUrlIfPresent(branding.logoUrl, "logoUrl")
  if (branding.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor)) {
    throw new ApiError("VALIDATION", "Use a 6-digit hex colour like #3730a3.", {
      primaryColor: ["Use a 6-digit hex colour like #3730a3"],
    })
  }
  await withTransaction(async (session) => {
    const before = await getTenant(ctx.tenantId, session)
    if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
    await tenantsCollection().updateOne(
      { _id: ctx.tenantId },
      { $set: { branding, updatedAt: new Date() } },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "tenant.branding_updated",
        entity: "tenant",
        entityId: ctx.tenantId,
        before: before.branding ?? {},
        after: branding,
      },
      { session },
    )
  })
}

export async function updateTenantSettings(ctx: TenantContext, patch: Partial<TenantSettings>) {
  if (!can(ctx, "settings:manage") && !can(ctx, "tenant:manage")) {
    throw new ApiError("FORBIDDEN", "You don't have permission to update workspace settings.")
  }
  assertHttpsUrlIfPresent(patch.slackWebhookUrl, "slackWebhookUrl")
  assertHttpsUrlIfPresent(patch.teamsWebhookUrl, "teamsWebhookUrl")
  assertHttpsUrlIfPresent(patch.sso?.issuerUrl, "ssoIssuerUrl")
  return withTransaction(async (session) => {
    const before = await getTenant(ctx.tenantId, session)
    if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
    const next: TenantSettings = { ...(before.settings ?? {}), ...patch }
    await tenantsCollection().updateOne(
      { _id: ctx.tenantId },
      { $set: { settings: next, updatedAt: new Date() } },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "tenant.settings_updated",
        entity: "tenant",
        entityId: ctx.tenantId,
        before: before.settings ?? {},
        after: next,
      },
      { session },
    )
    return next
  })
}
