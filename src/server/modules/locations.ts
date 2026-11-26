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
import { branches, locations } from "@/server/repositories"
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

  const branch = await branches.forTenant(ctx).findById(input.branchId)
  if (!branch || branch.status !== "active") throw new ApiError("NOT_FOUND", "Branch not found.")

  let ancestors: ObjectId[] = []
  let path: string[] = [input.name]
  if (input.parentId) {
    const parent = await locations.forTenant(ctx).findById(input.parentId)
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

  try {
    return await withTransaction(async (session) => {
      const repo = locations.forTenant(ctx)
      await assertWithinLimit(
        ctx,
        "locations",
        await repo.count({ status: "active" }, { session }),
        session,
      )
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

async function loadForWrite(ctx: TenantContext, idRaw: ObjectId | string) {
  const id = parseInput(objectId, idRaw)
  const loc = await locations.forTenant(ctx).findById(id)
  if (!loc || loc.status !== "active") throw new ApiError("NOT_FOUND", "Location not found.")
  assertCan(ctx, "location:manage", { branchId: loc.branchId })
  return loc
}

export async function renameLocation(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  newName: string,
) {
  const loc = await loadForWrite(ctx, idRaw)
  const nextName = parseInput(name("location name", 1), newName)
  const depth = loc.ancestors.length
  return withTransaction(async (session) => {
    const repo = locations.forTenant(ctx)
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
  const loc = await loadForWrite(ctx, idRaw)
  return withTransaction(async (session) => {
    const repo = locations.forTenant(ctx)
    if (await repo.count({ parentId: loc._id, status: "active" }, { session })) {
      throw new ApiError("CONFLICT", "Archive or move the locations inside it first.")
    }
    await repo.updateOne({ _id: loc._id }, { $set: { status: "archived" } }, { session })
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
