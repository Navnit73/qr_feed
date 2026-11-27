import "server-only"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { buildTree, canNest, LOCATION_TYPES } from "@/lib/location-tree"
import { assertWithinLimit } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import { branches, locations, qrCodes } from "@/server/repositories"
import { isDuplicateKey, name, objectId } from "@/server/validation"

const createSchema = z.object({
  branchId: objectId,
  parentId: objectId.nullish(),
  type: z.enum(LOCATION_TYPES, { error: "Choose a type" }),
  // Rooms and wings are often one character ("5", "A").
  name: name("location name", 1),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, "Use 2–20 letters, digits or dashes")
    .optional()
    .or(z.literal("").transform(() => undefined)),
})

export async function getLocationTree(ctx: TenantContext, branchIdRaw: ObjectId | string) {
  const branchId = parseInput(objectId, branchIdRaw)
  assertCan(ctx, "location:read", { branchId })
  const flat = await locations
    .forTenant(ctx)
    .find({ branchId, status: "active" }, { sort: { name: 1 } })
  return buildTree(flat)
}

export async function createLocation(ctx: TenantContext, raw: z.input<typeof createSchema>) {
  const input = parseInput(createSchema, raw)
  assertCan(ctx, "location:manage", { branchId: input.branchId })

  try {
    return await withTransaction(async (session) => {
      const branch = await branches.forTenant(ctx).findById(input.branchId, { session })
      if (!branch || branch.status !== "active") {
        throw new ApiError("NOT_FOUND", "Branch not found.")
      }

      const repo = locations.forTenant(ctx)
      let ancestors: ObjectId[] = []
      let path: string[] = [input.name]
      if (input.parentId) {
        const parent = await repo.findById(input.parentId, { session })
        if (!parent || parent.status !== "active") {
          throw new ApiError("NOT_FOUND", "Parent location not found.")
        }
        if (!parent.branchId.equals(input.branchId)) {
          throw new ApiError("VALIDATION", "The parent is in a different branch.", {
            parentId: ["Pick a parent in the same branch"],
          })
        }
        if (!canNest(parent.type, input.type)) {
          throw new ApiError("VALIDATION", `A ${input.type} can't go inside a ${parent.type}.`, {
            type: [`A ${input.type} can't go inside a ${parent.type}`],
          })
        }
        ancestors = [...parent.ancestors, parent._id]
        path = [...parent.path, input.name]
      }

      // Count tenant-wide locations so branch-scoped admins cannot bypass the plan cap.
      const totalLocations = await locations
        .forTenant({ ...ctx, branchScope: "all" })
        .count({ status: "active" }, { session })
      await assertWithinLimit(ctx, "locations", totalLocations, session)

      const loc = await repo.insertOne(
        {
          branchId: input.branchId,
          type: input.type,
          name: input.name,
          parentId: input.parentId ?? null,
          ancestors,
          path,
          ...(input.code ? { code: input.code } : {}),
          status: "active",
        },
        { session },
      )
      await appendAudit(
        ctx,
        {
          action: "location.created",
          entity: "location",
          entityId: loc._id,
          after: { path, type: input.type, code: input.code },
        },
        { session },
      )
      return loc
    })
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError("CONFLICT", "That code is already used.", { code: ["Already used"] })
    }
    throw err
  }
}

export async function renameLocation(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  newName: string,
) {
  const id = parseInput(objectId, idRaw)
  const nextName = parseInput(name("location name", 1), newName)
  return withTransaction(async (session) => {
    const repo = locations.forTenant(ctx)
    const loc = await repo.findById(id, { session })
    if (!loc || loc.status !== "active") throw new ApiError("NOT_FOUND", "Location not found.")
    assertCan(ctx, "location:manage", { branchId: loc.branchId })
    const depth = loc.ancestors.length
    await repo.updateOne(
      { _id: loc._id },
      { $set: { name: nextName, [`path.${depth}`]: nextName } },
      { session },
    )
    // Every descendant stores this node's name at the same depth in its path.
    await repo.updateMany(
      { ancestors: loc._id },
      { $set: { [`path.${depth}`]: nextName } },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "location.renamed",
        entity: "location",
        entityId: loc._id,
        before: { name: loc.name },
        after: { name: nextName },
      },
      { session },
    )
  })
}

export async function archiveLocation(ctx: TenantContext, idRaw: ObjectId | string) {
  const id = parseInput(objectId, idRaw)
  return withTransaction(async (session) => {
    const repo = locations.forTenant(ctx)
    const loc = await repo.findById(id, { session })
    if (!loc || loc.status !== "active") throw new ApiError("NOT_FOUND", "Location not found.")
    assertCan(ctx, "location:manage", { branchId: loc.branchId })
    if (await repo.count({ parentId: loc._id, status: "active" }, { session })) {
      throw new ApiError("CONFLICT", "Archive or move the locations inside it first.")
    }
    await repo.updateOne({ _id: loc._id }, { $set: { status: "archived" } }, { session })
    // Revoke any active QR codes attached to the archived location so counts stay accurate.
    await qrCodes
      .forTenant(ctx)
      .updateMany(
        { locationId: loc._id, status: "active" },
        { $set: { status: "revoked", revokedAt: new Date() } },
        { session },
      )
    await appendAudit(
      ctx,
      {
        action: "location.archived",
        entity: "location",
        entityId: loc._id,
        before: { path: loc.path },
      },
      { session },
    )
  })
}

export async function moveLocation(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  newParentIdRaw: ObjectId | string | null,
) {
  const id = parseInput(objectId, idRaw)
  const newParentId = newParentIdRaw ? parseInput(objectId, newParentIdRaw) : null

  return withTransaction(async (session) => {
    const repo = locations.forTenant(ctx)
    const loc = await repo.findById(id, { session })
    if (!loc || loc.status !== "active") throw new ApiError("NOT_FOUND", "Location not found.")
    assertCan(ctx, "location:manage", { branchId: loc.branchId })

    if (newParentId && newParentId.equals(loc._id)) {
      throw new ApiError("VALIDATION", "A location can't be moved inside itself.", {
        parentId: ["Pick a different parent"],
      })
    }

    // Serialise concurrent moves within the same branch to prevent A->B / B->A cycles.
    await branches
      .forTenant(ctx)
      .updateOne({ _id: loc.branchId }, { $set: { updatedAt: new Date() } }, { session })

    let nextAncestors: ObjectId[] = []
    let nextPath: string[] = [loc.name]

    if (newParentId) {
      const parent = await repo.findById(newParentId, { session })
      if (!parent || parent.status !== "active") {
        throw new ApiError("NOT_FOUND", "Target parent location not found.")
      }
      if (!parent.branchId.equals(loc.branchId)) {
        throw new ApiError("VALIDATION", "Cannot move a location into a different branch.", {
          parentId: ["Pick a parent in the same branch"],
        })
      }
      if (parent.ancestors.some((a) => a.equals(loc._id))) {
        throw new ApiError("VALIDATION", "Cannot move a location inside one of its own children.", {
          parentId: ["Cannot move into a descendant"],
        })
      }
      if (!canNest(parent.type, loc.type)) {
        throw new ApiError("VALIDATION", `A ${loc.type} can't go inside a ${parent.type}.`, {
          parentId: [`A ${loc.type} can't go inside a ${parent.type}`],
        })
      }
      nextAncestors = [...parent.ancestors, parent._id]
      nextPath = [...parent.path, loc.name]
    } else if (!canNest(null, loc.type)) {
      throw new ApiError("VALIDATION", `A ${loc.type} can't sit at the top level.`)
    }

    const oldAncestorsLen = loc.ancestors.length
    const oldPathLen = loc.path.length
    const descendants = await repo.find({ ancestors: loc._id, status: "active" }, { session })

    await repo.updateOne(
      { _id: loc._id },
      { $set: { parentId: newParentId, ancestors: nextAncestors, path: nextPath } },
      { session },
    )

    for (const desc of descendants) {
      const suffixAncestors = desc.ancestors.slice(oldAncestorsLen)
      const suffixPath = desc.path.slice(oldPathLen)
      await repo.updateOne(
        { _id: desc._id },
        {
          $set: {
            ancestors: [...nextAncestors, ...suffixAncestors],
            path: [...nextPath, ...suffixPath],
          },
        },
        { session },
      )
    }

    await appendAudit(
      ctx,
      {
        action: "location.moved",
        entity: "location",
        entityId: loc._id,
        before: { path: loc.path },
        after: { path: nextPath },
      },
      { session },
    )
  })
}
