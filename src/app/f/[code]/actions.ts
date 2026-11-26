"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { env } from "@/server/env"
import { submitFeedback } from "@/server/modules/intake"
import { clientIp } from "@/server/public-url"

export async function submitFeedbackAction(code: string, form: FormData): Promise<ActionState> {
  const e = env()
  const ip = clientIp(await headers())
  const res = await runAction(() =>
    submitFeedback(code, formObject(form), {
      ip,
      limits: e.INTAKE_RATE_LIMIT === "off" ? null : undefined,
      turnstile: {
        secret: e.TURNSTILE_SECRET_KEY,
        token: form.get("cf-turnstile-response") as string | null,
      },
    }),
  )
  if (!res.ok) return res
  // The token is in the URL so the reporter can bookmark it; it's never stored in plain text.
  redirect(`/t/${res.data.trackingToken}?${res.data.duplicate ? "dup" : "new"}=1`)
}
