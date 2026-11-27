"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { betterAuthIdentity } from "@/server/auth/accounts"
import { requireTenantContext } from "@/server/auth/session"
import {
  createInvite,
  createMemberWithPassword,
  inviteEmail,
  revokeInvite,
  setMemberStatus,
  updateMemberAccess,
} from "@/server/modules/members"
import { appUrl } from "@/server/public-url"
import { createCustomRole, deleteCustomRole, updateCustomRole } from "@/server/modules/roles"

export async function inviteAction(
  _: ActionState<{ link: string }>,
  form: FormData,
): Promise<ActionState<{ link: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["roles", "branchIds", "menus"])
    const { invite, token } = await createInvite(ctx, raw as never)
    const link = appUrl(`/invite/${token}`)
    void inviteEmail(ctx, invite, link)
    revalidatePath("/users")
    return { link }
  })
}

export async function createUserAction(
  _: ActionState<{ email: string }>,
  form: FormData,
): Promise<ActionState<{ email: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["roles", "branchIds", "menus"])
    const member = await createMemberWithPassword(ctx, raw as never, betterAuthIdentity)
    revalidatePath("/users")
    return { email: member.email }
  })
}

export async function updateAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const input = formObject(form, ["roles", "branchIds", "menus"])
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
