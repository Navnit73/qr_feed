"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { parseInput } from "@/lib/api/validation"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  createApiKey,
  createWebhook,
  deleteWebhook,
  isSafeExternalHttpsUrl,
  pingWebhook,
  revokeApiKey,
} from "@/server/modules/platform"
import { updateTenantSettings } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || isSafeExternalHttpsUrl(v), "Must be a public HTTPS URL.")
  .optional()

const integrationsSettingsSchema = z.object({
  slackWebhookUrl: optionalHttpsUrl,
  teamsWebhookUrl: optionalHttpsUrl,
  ssoIssuerUrl: optionalHttpsUrl,
  ssoClientId: z.string().trim().max(200).optional(),
  ssoDomain: z.string().trim().max(120).optional(),
})

export async function createApiKeyAction(
  _: ActionState<{ rawKey: string }>,
  form: FormData,
): Promise<ActionState<{ rawKey: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["scopes"])
    const { rawKey } = await createApiKey(ctx, {
      name: String(raw.name ?? ""),
      scopes: (raw.scopes as string[]) ?? [],
    })
    revalidatePath("/settings/integrations")
    return { rawKey }
  })
}

export async function revokeApiKeyAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await revokeApiKey(ctx, id)
    revalidatePath("/settings/integrations")
  })
}

export async function createWebhookAction(
  _: ActionState<{ secret: string }>,
  form: FormData,
): Promise<ActionState<{ secret: string }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const raw = formObject(form, ["events"])
    const { secret } = await createWebhook(ctx, {
      name: String(raw.name ?? ""),
      url: String(raw.url ?? ""),
      events: (raw.events as string[]) ?? [],
    })
    revalidatePath("/settings/integrations")
    return { secret }
  })
}

export async function deleteWebhookAction(id: string): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    await deleteWebhook(ctx, id)
    revalidatePath("/settings/integrations")
  })
}

export async function pingWebhookAction(
  id: string,
): Promise<ActionState<{ ok: boolean; statusCode: number }>> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    const d = await pingWebhook(ctx, id)
    revalidatePath("/settings/integrations")
    return { ok: d.ok, statusCode: d.statusCode }
  })
}

export async function saveIntegrationsSettingsAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    assertCan(ctx, "settings:manage")
    const raw = formObject(form)
    const parsed = parseInput(integrationsSettingsSchema, {
      slackWebhookUrl: String(raw.slackWebhookUrl ?? ""),
      teamsWebhookUrl: String(raw.teamsWebhookUrl ?? ""),
      ssoIssuerUrl: String(raw.ssoIssuerUrl ?? ""),
      ssoClientId: String(raw.ssoClientId ?? ""),
      ssoDomain: String(raw.ssoDomain ?? ""),
    })
    await updateTenantSettings(ctx, {
      slackWebhookUrl: parsed.slackWebhookUrl || undefined,
      teamsWebhookUrl: parsed.teamsWebhookUrl || undefined,
      whatsappEnabled: raw.whatsappEnabled === "on",
      sso: {
        enabled: raw.ssoEnabled === "on",
        provider: raw.ssoProvider === "saml" ? "saml" : "oidc",
        issuerUrl: parsed.ssoIssuerUrl || undefined,
        clientId: parsed.ssoClientId || undefined,
        domain: parsed.ssoDomain || undefined,
      },
    })
    revalidatePath("/settings/integrations")
  })
}
