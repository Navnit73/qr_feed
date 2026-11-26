"use server"

import { redirect } from "next/navigation"
import { runAction, type ActionState } from "@/server/actions"
import { requireUser, setActiveTenant } from "@/server/auth/session"
import { acceptInvite } from "@/server/modules/members"

export async function acceptInviteAction(token: string): Promise<ActionState> {
  const user = await requireUser(`/invite/${token}`)
  const res = await runAction(() => acceptInvite(user, token))
  if (!res.ok) return res
  await setActiveTenant(res.data.tenantId.toHexString())
  redirect("/dashboard")
}
