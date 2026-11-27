"use server"

import { headers } from "next/headers"
import { runAction, type ActionState } from "@/server/actions"
import { env } from "@/server/env"
import { submitSurveyResponse } from "@/server/modules/surveys"
import { clientIp } from "@/server/public-url"

export async function submitSurveyAction(
  code: string,
  form: FormData,
): Promise<ActionState<{ responseId: string; thankYouMessage: string }>> {
  const e = env()
  const ip = clientIp(await headers())

  const raw: Record<string, unknown> = {}
  for (const [key, val] of form.entries()) {
    if (typeof val !== "string") continue
    if (Object.hasOwn(raw, key)) {
      const existing = raw[key]
      raw[key] = Array.isArray(existing) ? [...existing, val] : [existing as string, val]
    } else {
      raw[key] = val
    }
  }

  return runAction(() =>
    submitSurveyResponse(code, raw, {
      ip,
      limits: e.INTAKE_RATE_LIMIT === "off" ? null : undefined,
      turnstile: {
        secret: e.TURNSTILE_SECRET_KEY,
        token: form.get("cf-turnstile-response") as string | null,
      },
    }),
  )
}
