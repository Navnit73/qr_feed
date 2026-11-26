import "server-only"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { assertWithinLimit } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import { branches } from "@/server/repositories"
import { name, objectId, timeZone } from "@/server/validation"

const createSchema = z.object({
  name: name("branch name"),
  timezone: timeZone,
  address: z.string().trim().max(200).optional(),
})
const updateSchema = createSchema.partial()

export async function listBranches(ctx: TenantContext) {
  assertCan(ctx, "branch:read")
  return branches.forTenant(ctx).find({ status: "active" }, { sort: { name: 1 } })
}

export async function getBranch(ctx: TenantContext, id: ObjectId | string) {
  assertCan(ctx, "branch:read")
  const branch = await branches.forTenant(ctx).findById(id)
  if (!branch) throw new ApiError("NOT_FOUND", "Branch not found.")
  return branch
}

export async function createBranch(ctx: TenantContext, raw: z.input<typeof createSchema>) {
  assertCan(ctx, "branch:manage")
  if (ctx.branchScope !== "all") {
    throw new ApiError("FORBIDDEN", "Only organisation-wide admins can add branches.")
  }
  const input = parseInput(createSchema, raw)
  return withTransaction(async (session) => {
    const repo = branches.forTenant(ctx)
    await assertWithinLimit(
      ctx,
      "branches",
      await repo.count({ status: "active" }, { session }),
      session,
    )
    const branch = await repo.insertOne({ ...input, status: "active" }, { session })
    await appendAudit(
      ctx,
      { action: "branch.created", entity: "branch", entityId: branch._id, after: input },
      { session },
    )
    return branch
  })
}

export async function updateBranch(
  ctx: TenantContext,
  id: ObjectId | string,
  raw: z.input<typeof updateSchema>,
) {
  const branchId = parseInput(objectId, id)
  assertCan(ctx, "branch:manage", { branchId })
  const input = parseInput(updateSchema, raw)
  return withTransaction(async (session) => {
    const repo = branches.forTenant(ctx)
    const before = await repo.findById(branchId, { session })
    if (!before) throw new ApiError("NOT_FOUND", "Branch not found.")
    const after = await repo.updateOne({ _id: branchId }, { $set: input }, { session })
    await appendAudit(
      ctx,
      {
        action: "branch.updated",
        entity: "branch",
        entityId: branchId,
        before: { name: before.name, timezone: before.timezone, address: before.address },
        after: input,
      },
      { session },
    )
    return after!
  })
}
