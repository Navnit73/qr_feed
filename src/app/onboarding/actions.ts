"use server"

import { redirect } from "next/navigation"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireUser, setActiveTenant } from "@/server/auth/session"
import { createOrganization, type OrganizationInput } from "@/server/modules/onboarding"

export async function createOrganizationAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser("/onboarding")
  const res = await runAction(() =>
    createOrganization(user, formObject(form) as unknown as OrganizationInput),
  )
  if (!res.ok) return res
  await setActiveTenant(res.data.tenant._id.toHexString())
  redirect("/dashboard")
}
