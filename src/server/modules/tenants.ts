import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import { appendAudit } from "@/server/audit/audit-log"
import { db } from "@/server/db/client"
import type { TenantContext } from "@/server/db/tenant-context"

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

export async function getTenant(tenantId: ObjectId, session?: ClientSession) {
  return tenantsCollection().findOne({ _id: tenantId }, { session })
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
  const before = await getTenant(tenantId)
  if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
  if (before.status === status) return before
  const after = await tenantsCollection().findOneAndUpdate(
    { _id: tenantId },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  await appendAudit(platformContext(actorId, tenantId), {
    action: status === "suspended" ? "tenant.suspended" : "tenant.reactivated",
    entity: "tenant",
    entityId: tenantId,
    before: { status: before.status },
    after: { status },
  })
  return after!
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
  const before = await getTenant(tenantId)
  if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
  const $set: Record<string, unknown> = { limits, updatedAt: new Date() }
  if (plan) $set.plan = plan
  await tenantsCollection().updateOne({ _id: tenantId }, { $set })
  await appendAudit(platformContext(actorId, tenantId), {
    action: "tenant.limits_changed",
    entity: "tenant",
    entityId: tenantId,
    before: { plan: before.plan, limits: before.limits },
    after: { plan: plan ?? before.plan, limits },
  })
}

export async function updateTenantBranding(ctx: TenantContext, branding: TenantBranding) {
  const before = await getTenant(ctx.tenantId)
  if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
  await tenantsCollection().updateOne(
    { _id: ctx.tenantId },
    { $set: { branding, updatedAt: new Date() } },
  )
  await appendAudit(ctx, {
    action: "tenant.branding_updated",
    entity: "tenant",
    entityId: ctx.tenantId,
    before: before.branding ?? {},
    after: branding,
  })
}

export async function updateTenantSettings(ctx: TenantContext, patch: Partial<TenantSettings>) {
  const before = await getTenant(ctx.tenantId)
  if (!before) throw new ApiError("NOT_FOUND", "Tenant not found.")
  const next: TenantSettings = { ...(before.settings ?? {}), ...patch }
  await tenantsCollection().updateOne(
    { _id: ctx.tenantId },
    { $set: { settings: next, updatedAt: new Date() } },
  )
  await appendAudit(ctx, {
    action: "tenant.settings_updated",
    entity: "tenant",
    entityId: ctx.tenantId,
    before: before.settings ?? {},
    after: next,
  })
  return next
}
