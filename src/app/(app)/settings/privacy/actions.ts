"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { parseInput } from "@/lib/api/validation"
import { runAction, type ActionState } from "@/server/actions"
import { clearActiveTenant, requireTenantContext } from "@/server/auth/session"
import { anonymiseOldReporterData, requestTenantDeletion } from "@/server/modules/platform"
import { updateTenantSettings } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"

const retentionSchema = z.object({
  retentionDays: z.coerce.number().int().min(30).max(3650),
})

export async function saveRetentionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    assertCan(ctx, "tenant:manage")
    const { retentionDays } = parseInput(retentionSchema, {
      retentionDays: form.get("retentionDays"),
    })
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
  const res = await runAction(async () => {
    await requestTenantDeletion(ctx, String(form.get("confirmSlug") ?? ""))
    await clearActiveTenant()
  })
  if (res.ok) redirect("/onboarding")
  return res
}
