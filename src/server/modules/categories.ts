import "server-only"
import type { ClientSession } from "mongodb"
import { FEEDBACK_PRESETS } from "@/lib/feedback-presets"
import type { TenantContext } from "@/server/db/tenant-context"
import type { Industry } from "@/server/modules/tenants"
import { categories } from "@/server/repositories"

/** Seeds the industry's starter categories. Called at onboarding and lazily for older tenants. */
export async function seedCategories(
  ctx: TenantContext,
  industry: Industry,
  session?: ClientSession,
) {
  const repo = categories.forTenant(ctx)
  const presets = FEEDBACK_PRESETS[industry] ?? FEEDBACK_PRESETS.other
  for (const [order, p] of presets.entries()) {
    await repo.insertOne({ ...p, order, active: true }, { session })
  }
}

export async function listCategories(ctx: TenantContext, industry: Industry) {
  const repo = categories.forTenant(ctx)
  let list = await repo.find({ active: true }, { sort: { order: 1 } })
  if (list.length === 0) {
    await seedCategories(ctx, industry).catch(() => {
      // A concurrent request seeded first (unique key); re-read below.
    })
    list = await repo.find({ active: true }, { sort: { order: 1 } })
  }
  return list
}
