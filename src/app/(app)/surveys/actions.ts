"use server"

import { revalidatePath } from "next/cache"
import { runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  createSurvey,
  regenerateSurveyQr,
  setSurveyStatus,
  updateSurvey,
  type SurveyInput,
} from "@/server/modules/surveys"

export async function createSurveyAction(
  input: SurveyInput,
): Promise<ActionState<{ id: string; shortCode: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const doc = await createSurvey(ctx, input)
    revalidatePath("/surveys")
    return { id: doc._id.toHexString(), shortCode: doc.shortCode }
  })
}

export async function updateSurveyAction(
  surveyId: string,
  input: SurveyInput,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const doc = await updateSurvey(ctx, surveyId, input)
    revalidatePath("/surveys")
    revalidatePath(`/surveys/${surveyId}`)
    revalidatePath(`/s/${doc.shortCode}`)
    return { id: doc._id.toHexString() }
  })
}

export async function setSurveyStatusAction(
  surveyId: string,
  status: "active" | "paused" | "archived",
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const doc = await setSurveyStatus(ctx, surveyId, status)
    revalidatePath("/surveys")
    revalidatePath(`/surveys/${surveyId}`)
    revalidatePath(`/s/${doc.shortCode}`)
  })
}

export async function regenerateSurveyQrAction(
  surveyId: string,
): Promise<ActionState<{ shortCode: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const doc = await regenerateSurveyQr(ctx, surveyId)
    revalidatePath("/surveys")
    revalidatePath(`/surveys/${surveyId}`)
    return { shortCode: doc.shortCode }
  })
}
