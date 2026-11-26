"use server"

import { revalidatePath } from "next/cache"
import { runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { changeTenantPlan } from "@/server/modules/platform"
import type { PlanKey } from "@/server/modules/tenants"

export async function changePlanAction(
  plan: PlanKey,
  provider: "sandbox" | "stripe" | "razorpay",
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await changeTenantPlan(ctx, plan, provider)
    revalidatePath("/settings/billing")
    revalidatePath("/dashboard")
  })
}
