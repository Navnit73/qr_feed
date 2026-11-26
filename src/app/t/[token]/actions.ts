"use server"

import { revalidatePath } from "next/cache"
import { runAction, type ActionState } from "@/server/actions"
import { submitRequesterFeedback } from "@/server/modules/intake"

export async function submitClosureFeedbackAction(
  token: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await submitRequesterFeedback(token, {
      resolved: form.get("resolved") === "yes",
      rating: form.get("rating") ? Number(form.get("rating")) : undefined,
      comment: String(form.get("comment") ?? "") || undefined,
    })
    revalidatePath(`/t/${token}`)
  })
}
