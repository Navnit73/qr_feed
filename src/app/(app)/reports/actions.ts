"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { createSavedReport, deleteSavedReport, sendDigestNow } from "@/server/modules/reports"

export async function createSavedReportAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    const recipients = String(raw.recipients ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    await createSavedReport(ctx, {
      name: String(raw.name ?? ""),
      rangeDays: Number(raw.rangeDays) || 30,
      branchId: String(raw.branchId ?? "") || null,
      schedule: String(raw.schedule || "none") as "none" | "daily" | "weekly",
      recipients,
    })
    revalidatePath("/reports")
  })
}

export async function deleteSavedReportAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await deleteSavedReport(ctx, id)
    revalidatePath("/reports")
  })
}

export async function sendDigestNowAction(id: string): Promise<ActionState<{ sentTo: number }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const res = await sendDigestNow(ctx, id)
    revalidatePath("/reports")
    return res
  })
}
