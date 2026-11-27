"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireSuperAdmin, startImpersonation, stopImpersonation } from "@/server/auth/session"
import { setTenantLimits, setTenantStatus, type PlanKey } from "@/server/modules/tenants"

const planSchema = z.object({
  tenantId: z.string().refine((v) => ObjectId.isValid(v), "Invalid tenant"),
  plan: z.enum(["trial", "starter", "growth", "business", "enterprise"]),
  branches: z.coerce.number().int().min(1).max(10000),
  users: z.coerce.number().int().min(1).max(100000),
  locations: z.coerce.number().int().min(1).max(500000),
  monthlyTickets: z.coerce.number().int().min(10).max(5000000),
})

const statusSchema = z.enum(["active", "suspended"])

const impersonateSchema = z.object({
  tenantId: z.string().refine((v) => ObjectId.isValid(v), "Invalid tenant"),
  reason: z.string().trim().min(5, "Enter a reason (at least 5 characters)").max(300),
})

export async function setTenantStatusAction(
  tenantId: string,
  status: "active" | "suspended",
): Promise<ActionState> {
  const admin = await requireSuperAdmin()
  return runAction(async () => {
    if (!ObjectId.isValid(tenantId)) throw new ApiError("NOT_FOUND", "Tenant not found.")
    const validStatus = parseInput(statusSchema, status)
    await setTenantStatus({
      actorId: admin.id,
      tenantId: new ObjectId(tenantId),
      status: validStatus,
    })
    revalidatePath("/super")
  })
}

export async function updateTenantPlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin()
  return runAction(async () => {
    const input = parseInput(planSchema, formObject(form))
    await setTenantLimits({
      actorId: admin.id,
      tenantId: new ObjectId(input.tenantId),
      plan: input.plan as PlanKey,
      limits: {
        branches: input.branches,
        users: input.users,
        locations: input.locations,
        monthlyTickets: input.monthlyTickets,
      },
    })
    revalidatePath("/super")
  })
}

export async function impersonateTenantAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireSuperAdmin()
  const res = await runAction(async () => {
    const input = parseInput(impersonateSchema, formObject(form))
    await startImpersonation(admin, input.tenantId, input.reason)
  })
  if (res.ok) redirect("/dashboard")
  return res
}

export async function stopImpersonationAction(): Promise<void> {
  const admin = await requireSuperAdmin()
  await stopImpersonation(admin)
  revalidatePath("/", "layout")
  redirect("/super")
}
