"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { saveNotificationPreferences } from "@/server/modules/reports"

export async function savePrefsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    await saveNotificationPreferences(ctx, {
      channels: {
        in_app: raw.ch_in_app === "on",
        email: raw.ch_email === "on",
        sms: raw.ch_sms === "on",
        whatsapp: raw.ch_whatsapp === "on",
        push: raw.ch_push === "on",
      },
      events: {
        assigned: raw.ev_assigned === "on",
        escalated: raw.ev_escalated === "on",
        verification: raw.ev_verification === "on",
        capaDue: raw.ev_capaDue === "on",
        digest: raw.ev_digest === "on",
      },
      digestMode: String(raw.digestMode || "instant") as "instant" | "daily" | "weekly",
      quietHours: {
        enabled: raw.qh_enabled === "on",
        start: String(raw.qh_start || "22:00"),
        end: String(raw.qh_end || "07:00"),
        timezone: String(raw.qh_timezone || "Asia/Kolkata"),
      },
    })
    revalidatePath("/settings/notifications")
  })
}
