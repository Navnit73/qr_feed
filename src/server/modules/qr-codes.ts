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

function isShortCodeCollision(err: unknown): boolean {
  return isDuplicateKey(err) && String(err).includes("shortCode")
}

export async function createQrCode(ctx: TenantContext, locationIdRaw: ObjectId | string) {
  assertCan(ctx, "qr:create")
  const loc = await findLocation(ctx, parseInput(objectId, locationIdRaw))
  assertCan(ctx, "qr:create", { branchId: loc.branchId })
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (isShortCodeCollision(err) && attempt < 2) continue
      if (isDuplicateKey(err))
        throw new ApiError("CONFLICT", "This location already has an active QR code.")
      throw err
    }
  }
  throw new ApiError("INTERNAL", "Could not allocate a unique QR code.")
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
  assertCan(ctx, "qr:revoke")
  const qr = await findActive(ctx, idRaw)
  assertCan(ctx, "qr:revoke", { branchId: qr.branchId })
  await withTransaction(async (session) => {
    const revoked = await qrCodes
      .forTenant(ctx)
      .updateOne(
        { _id: qr._id, status: "active" },
        { $set: { status: "revoked", revokedAt: new Date() } },
        { session },
      )
    if (!revoked) throw new ApiError("NOT_FOUND", "QR code is no longer active.")
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
  assertCan(ctx, "qr:revoke")
  assertCan(ctx, "qr:create")
  const qr = await findActive(ctx, idRaw)
  assertCan(ctx, "qr:revoke", { branchId: qr.branchId })
  assertCan(ctx, "qr:create", { branchId: qr.branchId })
  const loc = await findLocation(ctx, qr.locationId)
  return withTransaction(async (session) => {
    const revoked = await qrCodes
      .forTenant(ctx)
      .updateOne(
        { _id: qr._id, status: "active" },
        { $set: { status: "revoked", revokedAt: new Date() } },
        { session },
      )
    if (!revoked) throw new ApiError("CONFLICT", "QR code was already revoked.")
    const fresh = await insertCode(ctx, { _id: loc._id, branchId: loc.branchId }, session)
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
  assertCan(ctx, "qr:read")
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
 * Lightweight QR check for public photo uploads: verifies code → tenant → branch → location
 * without fetching categories.
 */
export async function resolvePublicQrLite(shortCode: string): Promise<{
  qrId: ObjectId
  tenantId: ObjectId
  branchId: ObjectId
  locationId: ObjectId
} | null> {
  if (!isShortCode(shortCode)) return null
  const qr = await qrCodes
    .unscoped()
    .findOne(
      { shortCode, status: "active" },
      { projection: { _id: 1, tenantId: 1, branchId: 1, locationId: 1 } },
    )
  if (!qr) return null
  const sys: TenantContext = {
    tenantId: qr.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const [tenant, loc, branch] = await Promise.all([
    tenantsCollection().findOne({ _id: qr.tenantId, status: "active" }, { projection: { _id: 1 } }),
    locations.forTenant(sys).findById(qr.locationId, { projection: { status: 1 } }),
    branches.forTenant(sys).findById(qr.branchId, { projection: { status: 1 } }),
  ])
  if (!tenant || !loc || loc.status !== "active" || !branch || branch.status !== "active") {
    return null
  }
  return { qrId: qr._id, tenantId: qr.tenantId, branchId: qr.branchId, locationId: qr.locationId }
}

/**
 * What a scan resolves to. The code alone decides the tenant (never client input), and any
 * inactive link in the chain (code, tenant, branch, location) makes it a dead code.
 * Runs tenant, location, branch lookups in parallel (2 DB round-trips instead of 4).
 */
export async function resolvePublicQr(shortCode: string): Promise<PublicQr | null> {
  if (!isShortCode(shortCode)) return null
  const qr = await qrCodes.unscoped().findOne({ shortCode, status: "active" })
  if (!qr) return null
  const sys: TenantContext = {
    tenantId: qr.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const [tenant, loc, branch] = await Promise.all([
    tenantsCollection().findOne(
      { _id: qr.tenantId, status: "active" },
      { projection: { name: 1, industry: 1, branding: 1 } },
    ),
    locations
      .forTenant(sys)
      .findById(qr.locationId, { projection: { name: 1, path: 1, status: 1 } }),
    branches.forTenant(sys).findById(qr.branchId, { projection: { name: 1, status: 1 } }),
  ])
  if (!tenant || !loc || loc.status !== "active" || !branch || branch.status !== "active") {
    return null
  }
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
