"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { env } from "@/server/env"
import {
  createInvite,
  revokeInvite,
  setMemberStatus,
  updateMemberAccess,
} from "@/server/modules/members"

export async function inviteAction(
  _: ActionState<{ link: string }>,
  form: FormData,
): Promise<ActionState<{ link: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const { token } = await createInvite(ctx, formObject(form, ["roles", "branchIds"]) as never)
    revalidatePath("/users")
    // Email delivery arrives with notifications (P3). Until then the admin shares the link.
    return { link: `${env().BETTER_AUTH_URL}/invite/${token}` }
  })
}

export async function updateAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const input = formObject(form, ["roles", "branchIds"])
    await updateMemberAccess(ctx, String(input.id), input as never)
    revalidatePath("/users")
  })
}

export async function revokeInviteAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await revokeInvite(ctx, id)
    revalidatePath("/users")
  })
}

export async function setMemberStatusAction(
  id: string,
  status: "active" | "inactive",
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await setMemberStatus(ctx, id, status)
    revalidatePath("/users")
  })
}
