"use server"

import { revalidatePath } from "next/cache"
import { runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { anonymiseOldReporterData, requestTenantDeletion } from "@/server/modules/platform"
import { updateTenantSettings } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"

export async function saveRetentionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    assertCan(ctx, "tenant:manage")
    const retentionDays = Math.max(30, Math.min(3650, Number(form.get("retentionDays")) || 365))
    await updateTenantSettings(ctx, { retentionDays })
    revalidatePath("/settings/privacy")
  })
}

export async function anonymiseNowAction(days: number): Promise<ActionState<{ count: number }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const count = await anonymiseOldReporterData(ctx, days)
    revalidatePath("/settings/privacy")
    return { count }
  })
}

export async function deleteTenantAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await requestTenantDeletion(ctx, String(form.get("confirmSlug") ?? ""))
  })
}
