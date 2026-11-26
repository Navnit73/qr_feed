"use server"

import { revalidatePath } from "next/cache"
import { runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { markAllRead, markNotificationRead } from "@/server/modules/notifications"

export async function markAllReadAction(): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await markAllRead(ctx)
    revalidatePath("/notifications")
    revalidatePath("/dashboard")
  })
}

export async function markOneReadAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await markNotificationRead(ctx, id)
    revalidatePath("/notifications")
  })
}
