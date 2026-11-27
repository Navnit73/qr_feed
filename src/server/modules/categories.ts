import "server-only"
import type { ClientSession, ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { FEEDBACK_PRESETS, SEVERITIES } from "@/lib/feedback-presets"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import type { Industry } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import { categories } from "@/server/repositories"
import { isDuplicateKey, name, objectId } from "@/server/validation"

const categorySchema = z.object({
  label: name("category name", 2),
  defaultSeverity: z.enum(SEVERITIES).default("medium"),
  requiresRCA: z.boolean().default(false),
  requiresResolutionEvidence: z.boolean().default(false),
  active: z.boolean().default(true),
})

/** Seeds the industry's starter categories. Called at onboarding and lazily for older tenants. */
export async function seedCategories(
  ctx: TenantContext,
  industry: Industry,
  session?: ClientSession,
) {
  const repo = categories.forTenant(ctx)
  const presets = FEEDBACK_PRESETS[industry] ?? FEEDBACK_PRESETS.other
  for (const [order, p] of presets.entries()) {
    await repo.insertOne(
      {
        ...p,
        order,
        active: true,
        requiresRCA: p.defaultSeverity === "high" || p.defaultSeverity === "critical",
        requiresResolutionEvidence: false,
      },
      { session },
    )
  }
}

export async function listCategories(ctx: TenantContext, industry: Industry) {
  const repo = categories.forTenant(ctx)
  let list = await repo.find({ active: true }, { sort: { order: 1 } })
  // Only lazily seed when the tenant has zero categories at all (not when all were intentionally disabled).
  if (list.length === 0 && (await repo.count({})) === 0) {
    await seedCategories(ctx, industry).catch(() => {
      // A concurrent request seeded first (unique key); re-read below.
    })
    list = await repo.find({ active: true }, { sort: { order: 1 } })
  }
  return list
}

export async function listAllCategories(ctx: TenantContext, industry: Industry) {
  const repo = categories.forTenant(ctx)
  let list = await repo.find({}, { sort: { order: 1 } })
  if (list.length === 0) {
    await seedCategories(ctx, industry).catch(() => {})
    list = await repo.find({}, { sort: { order: 1 } })
  }
  return list
}

export async function createCategory(ctx: TenantContext, raw: z.input<typeof categorySchema>) {
  assertCan(ctx, "settings:manage")
  const input = parseInput(categorySchema, raw)
  const key = input.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)

  try {
    return await withTransaction(async (session) => {
      const count = await categories.forTenant(ctx).count({}, { session })
      const doc = await categories.forTenant(ctx).insertOne(
        {
          key: key || `cat_${Date.now()}`,
          label: input.label,
          defaultSeverity: input.defaultSeverity,
          requiresRCA: input.requiresRCA,
          requiresResolutionEvidence: input.requiresResolutionEvidence,
          order: count,
          active: input.active,
        },
        { session },
      )
      await appendAudit(
        ctx,
        {
          action: "category.created",
          entity: "category",
          entityId: doc._id,
          after: { label: doc.label, defaultSeverity: doc.defaultSeverity },
        },
        { session },
      )
      return doc
    })
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError("CONFLICT", "A category with that name already exists.", {
        label: ["Already exists"],
      })
    }
    throw err
  }
}

export async function updateCategory(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof categorySchema>,
) {
  assertCan(ctx, "settings:manage")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(categorySchema, raw)
  return withTransaction(async (session) => {
    const before = await categories.forTenant(ctx).findById(id, { session })
    if (!before) throw new ApiError("NOT_FOUND", "Category not found.")
    const updated = await categories.forTenant(ctx).updateOne(
      { _id: id },
      {
        $set: {
          label: input.label,
          defaultSeverity: input.defaultSeverity,
          requiresRCA: input.requiresRCA,
          requiresResolutionEvidence: input.requiresResolutionEvidence,
          active: input.active,
        },
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "category.updated",
        entity: "category",
        entityId: id,
        before: {
          label: before.label,
          defaultSeverity: before.defaultSeverity,
          requiresRCA: before.requiresRCA,
          requiresResolutionEvidence: before.requiresResolutionEvidence,
          active: before.active,
        },
        after: input,
      },
      { session },
    )
    return updated!
  })
}
