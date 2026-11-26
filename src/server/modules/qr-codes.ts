import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { generateShortCode, isShortCode } from "@/lib/short-code"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { listCategories } from "@/server/modules/categories"
import { tenantsCollection } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import { branches, locations, qrCodes } from "@/server/repositories"
import { isDuplicateKey, objectId } from "@/server/validation"

/** Locations are looked up tenant-wide, so a branch-scoped user gets FORBIDDEN, not NOT_FOUND. */
async function findLocation(ctx: TenantContext, id: ObjectId) {
  const loc = await locations.forTenant({ ...ctx, branchScope: "all" }).findById(id)
  if (!loc || loc.status !== "active") throw new ApiError("NOT_FOUND", "Location not found.")
  return loc
}

async function insertCode(
  ctx: TenantContext,
  loc: { _id: ObjectId; branchId: ObjectId },
  session: ClientSession,
) {
  return qrCodes.forTenant(ctx).insertOne(
    {
      branchId: loc.branchId,
      locationId: loc._id,
      shortCode: generateShortCode(),
      status: "active",
      scanCount: 0,
      createdBy: ctx.actorId,
    },
    { session },
  )
}

export async function createQrCode(ctx: TenantContext, locationIdRaw: ObjectId | string) {
  const loc = await findLocation(ctx, parseInput(objectId, locationIdRaw))
  assertCan(ctx, "qr:create", { branchId: loc.branchId })
  try {
    return await withTransaction(async (session) => {
      const qr = await insertCode(ctx, loc, session)
      await appendAudit(
        ctx,
        {
          action: "qr.created",
          entity: "qrCode",
          entityId: qr._id,
          after: { location: loc.path, shortCode: qr.shortCode },
        },
        { session },
      )
      return qr
    })
  } catch (err) {
    if (isDuplicateKey(err))
      throw new ApiError("CONFLICT", "This location already has an active QR code.")
    throw err
  }
}

/** One code for every leaf location in the branch that doesn't have one yet. */
export async function generateMissingQrCodes(ctx: TenantContext, branchIdRaw: ObjectId | string) {
  const branchId = parseInput(objectId, branchIdRaw)
  assertCan(ctx, "qr:create", { branchId })
  return withTransaction(async (session) => {
    const locs = await locations
      .forTenant(ctx)
      .find({ branchId, status: "active", type: "location" }, { session })
    const covered = new Set(
      (await qrCodes.forTenant(ctx).find({ branchId, status: "active" }, { session })).map((q) =>
        q.locationId.toHexString(),
      ),
    )
    const missing = locs.filter((l) => !covered.has(l._id.toHexString()))
    for (const loc of missing) await insertCode(ctx, loc, session)
    if (missing.length) {
      await appendAudit(
        ctx,
        {
          action: "qr.bulk_created",
          entity: "branch",
          entityId: branchId,
          after: { count: missing.length },
        },
        { session },
      )
    }
    return missing.length
  })
}

async function findActive(ctx: TenantContext, idRaw: ObjectId | string) {
  const id = parseInput(objectId, idRaw)
  const qr = await qrCodes.forTenant({ ...ctx, branchScope: "all" }).findById(id)
  if (!qr || qr.status !== "active") throw new ApiError("NOT_FOUND", "QR code not found.")
  return qr
}

export async function revokeQrCode(ctx: TenantContext, idRaw: ObjectId | string) {
  const qr = await findActive(ctx, idRaw)
  assertCan(ctx, "qr:revoke", { branchId: qr.branchId })
  await withTransaction(async (session) => {
    await qrCodes
      .forTenant(ctx)
      .updateOne(
        { _id: qr._id },
        { $set: { status: "revoked", revokedAt: new Date() } },
        { session },
      )
    await appendAudit(
      ctx,
      {
        action: "qr.revoked",
        entity: "qrCode",
        entityId: qr._id,
        before: { shortCode: qr.shortCode },
      },
      { session },
    )
  })
}

/** Revokes a code (lost, defaced or photographed) and issues a fresh one for the same spot. */
export async function regenerateQrCode(ctx: TenantContext, idRaw: ObjectId | string) {
  const qr = await findActive(ctx, idRaw)
  assertCan(ctx, "qr:revoke", { branchId: qr.branchId })
  assertCan(ctx, "qr:create", { branchId: qr.branchId })
  return withTransaction(async (session) => {
    await qrCodes
      .forTenant(ctx)
      .updateOne(
        { _id: qr._id },
        { $set: { status: "revoked", revokedAt: new Date() } },
        { session },
      )
    const fresh = await insertCode(ctx, { _id: qr.locationId, branchId: qr.branchId }, session)
    await appendAudit(
      ctx,
      {
        action: "qr.regenerated",
        entity: "qrCode",
        entityId: fresh._id,
        before: { shortCode: qr.shortCode },
        after: { shortCode: fresh.shortCode },
      },
      { session },
    )
    return fresh
  })
}

export async function listQrCodes(ctx: TenantContext, branchIdRaw: ObjectId | string) {
  const branchId = parseInput(objectId, branchIdRaw)
  assertCan(ctx, "qr:read", { branchId })
  return qrCodes.forTenant(ctx).find({ branchId, status: "active" })
}

export async function getQrCode(ctx: TenantContext, idRaw: ObjectId | string) {
  const qr = await findActive(ctx, idRaw)
  assertCan(ctx, "qr:read", { branchId: qr.branchId })
  const loc = await locations.forTenant({ ...ctx, branchScope: "all" }).findById(qr.locationId)
  return { qr, locationPath: loc?.path ?? [] }
}

export type PublicQr = {
  qrId: ObjectId
  shortCode: string
  tenantId: ObjectId
  tenantName: string
  industry: import("@/server/modules/tenants").Industry
  branding: import("@/server/modules/tenants").TenantBranding | null
  branchId: ObjectId
  branchName: string
  locationId: ObjectId
  locationName: string
  locationPath: string[]
  categories: {
    id: string
    key: string
    label: string
    defaultSeverity: import("@/lib/feedback-presets").Severity
  }[]
}

/**
 * What a scan resolves to. The code alone decides the tenant (never client input), and any
 * inactive link in the chain (code, tenant, branch, location) makes it a dead code.
 */
export async function resolvePublicQr(shortCode: string): Promise<PublicQr | null> {
  if (!isShortCode(shortCode)) return null
  const qr = await qrCodes.unscoped().findOne({ shortCode, status: "active" })
  if (!qr) return null
  const tenant = await tenantsCollection().findOne({ _id: qr.tenantId, status: "active" })
  if (!tenant) return null
  const sys: TenantContext = {
    tenantId: tenant._id,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const [loc, branch] = await Promise.all([
    locations.forTenant(sys).findById(qr.locationId),
    branches.forTenant(sys).findById(qr.branchId),
  ])
  if (!loc || loc.status !== "active" || !branch || branch.status !== "active") return null
  const cats = await listCategories(sys, tenant.industry)
  return {
    qrId: qr._id,
    shortCode,
    tenantId: tenant._id,
    tenantName: tenant.name,
    industry: tenant.industry,
    branding: tenant.branding ?? null,
    branchId: branch._id,
    branchName: branch.name,
    locationId: loc._id,
    locationName: loc.name,
    locationPath: loc.path,
    categories: cats.map((c) => ({
      id: c._id.toHexString(),
      key: c.key,
      label: c.label,
      defaultSeverity: c.defaultSeverity,
    })),
  }
}

export async function recordScan(qrId: ObjectId) {
  await qrCodes
    .unscoped()
    .updateOne({ _id: qrId }, { $inc: { scanCount: 1 }, $set: { lastScannedAt: new Date() } })
}
