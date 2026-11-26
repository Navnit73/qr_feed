"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  createAssignmentRule,
  deleteAssignmentRule,
  toggleAssignmentRule,
} from "@/server/modules/assignment"
import { createCategory, updateCategory } from "@/server/modules/categories"
import { createSlaPolicy, deleteSlaPolicy, sweepSlaEscalations } from "@/server/modules/sla"
import { updateTenantSettings } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"

export async function createSlaPolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    await createSlaPolicy(ctx, {
      name: String(raw.name ?? ""),
      businessHoursMode: raw.businessHoursMode === "24x7" ? "24x7" : "business_hours",
      appliesTo: {
        branchId: String(raw.branchId ?? "") || null,
        categoryId: String(raw.categoryId ?? "") || null,
        severity: String(raw.severity ?? "") || null,
      },
      levels: [
        {
          level: 1,
          acceptWithinMin: Number(raw.l1Accept) || 15,
          resolveWithinMin: Number(raw.l1Resolve) || 180,
          escalateAfterMin: Number(raw.l1Resolve) || 180,
          targetRole: String(raw.l1Role || "l1_staff"),
          action: String(raw.l1Action || "both") as "notify" | "transfer" | "both",
        },
        {
          level: 2,
          acceptWithinMin: Number(raw.l2Accept) || 30,
          resolveWithinMin: Number(raw.l2Resolve) || 300,
          escalateAfterMin: Number(raw.l2Resolve) || 300,
          targetRole: String(raw.l2Role || "l2_supervisor"),
          action: String(raw.l2Action || "both") as "notify" | "transfer" | "both",
        },
        {
          level: 3,
          acceptWithinMin: Number(raw.l3Accept) || 60,
          resolveWithinMin: Number(raw.l3Resolve) || 480,
          escalateAfterMin: Number(raw.l3Resolve) || 480,
          targetRole: String(raw.l3Role || "l3_manager"),
          action: String(raw.l3Action || "both") as "notify" | "transfer" | "both",
        },
      ],
    })
    revalidatePath("/settings")
  })
}

export async function deleteSlaPolicyAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await deleteSlaPolicy(ctx, id)
    revalidatePath("/settings")
  })
}

export async function runSlaSweepNowAction(): Promise<
  ActionState<{ checked: number; warned: number; escalated: number }>
> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    assertCan(ctx, "settings:sla")
    const result = await sweepSlaEscalations()
    revalidatePath("/settings")
    revalidatePath("/tickets")
    return result
  })
}

export async function createAssignmentRuleAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["userIds"])
    await createAssignmentRule(ctx, {
      name: String(raw.name ?? ""),
      priority: Number(raw.priority) || 10,
      conditions: {
        branchId: String(raw.branchId ?? "") || null,
        categoryId: String(raw.categoryId ?? "") || null,
        severity: String(raw.severity ?? "") || null,
      },
      strategy: String(raw.strategy || "round_robin") as "fixed" | "round_robin" | "least_loaded",
      userIds: (raw.userIds as string[]) ?? [],
    })
    revalidatePath("/settings")
  })
}

export async function toggleAssignmentRuleAction(
  id: string,
  active: boolean,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await toggleAssignmentRule(ctx, id, active)
    revalidatePath("/settings")
  })
}

export async function deleteAssignmentRuleAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await deleteAssignmentRule(ctx, id)
    revalidatePath("/settings")
  })
}

export async function createCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    await createCategory(ctx, {
      label: String(raw.label ?? ""),
      defaultSeverity: String(raw.defaultSeverity || "medium") as never,
      requiresRCA: raw.requiresRCA === "on",
      requiresResolutionEvidence: raw.requiresResolutionEvidence === "on",
    })
    revalidatePath("/settings")
  })
}

export async function updateCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form)
    await updateCategory(ctx, String(raw.id ?? ""), {
      label: String(raw.label ?? ""),
      defaultSeverity: String(raw.defaultSeverity || "medium") as never,
      requiresRCA: raw.requiresRCA === "on",
      requiresResolutionEvidence: raw.requiresResolutionEvidence === "on",
      active: raw.active === "on",
    })
    revalidatePath("/settings")
  })
}

export async function updateAutomationSettingsAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    assertCan(ctx, "settings:manage")
    const autoCloseDays = Math.max(0, Math.min(90, Number(form.get("autoCloseDays")) || 0))
    const repeatRcaThreshold = Math.max(
      2,
      Math.min(20, Number(form.get("repeatRcaThreshold")) || 3),
    )
    await updateTenantSettings(ctx, { autoCloseDays, repeatRcaThreshold })
    revalidatePath("/settings")
  })
}
