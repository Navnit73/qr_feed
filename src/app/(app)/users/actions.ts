"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { env } from "@/server/env"
import { sendMail } from "@/server/mail"
import {
  createInvite,
  revokeInvite,
  setMemberStatus,
  updateMemberAccess,
} from "@/server/modules/members"
import { createCustomRole, deleteCustomRole, updateCustomRole } from "@/server/modules/roles"
import { getTenant } from "@/server/modules/tenants"

export async function inviteAction(
  _: ActionState<{ link: string }>,
  form: FormData,
): Promise<ActionState<{ link: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["roles", "branchIds"])
    const { invite, token } = await createInvite(ctx, raw as never)
    const link = `${env().BETTER_AUTH_URL}/invite/${token}`
    const tenant = await getTenant(ctx.tenantId)
    void sendMail({
      to: invite.email,
      subject: `You're invited to ${tenant?.name ?? "QR Feed"}`,
      text: `You have been invited to join ${tenant?.name ?? "an organisation"} on QR Feed.\n\nAccept your invite (valid for 7 days): ${link}`,
    }).catch(() => {})
    revalidatePath("/users")
    return { link }
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

export async function createRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await createCustomRole(ctx, formObject(form, ["permissions"]) as never)
    revalidatePath("/users")
  })
}

export async function updateRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const input = formObject(form, ["permissions"])
    await updateCustomRole(ctx, String(input.id), input as never)
    revalidatePath("/users")
  })
}

export async function deleteRoleAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await deleteCustomRole(ctx, id)
    revalidatePath("/users")
  })
}
