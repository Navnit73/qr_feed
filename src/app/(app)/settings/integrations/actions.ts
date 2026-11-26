"use server"

import { revalidatePath } from "next/cache"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import {
  createApiKey,
  createWebhook,
  deleteWebhook,
  pingWebhook,
  revokeApiKey,
} from "@/server/modules/platform"
import { updateTenantSettings } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"

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
    await updateTenantSettings(ctx, {
      slackWebhookUrl: String(raw.slackWebhookUrl ?? "") || undefined,
      teamsWebhookUrl: String(raw.teamsWebhookUrl ?? "") || undefined,
      whatsappEnabled: raw.whatsappEnabled === "on",
      sso: {
        enabled: raw.ssoEnabled === "on",
        provider: raw.ssoProvider === "saml" ? "saml" : "oidc",
        issuerUrl: String(raw.ssoIssuerUrl ?? "") || undefined,
        clientId: String(raw.ssoClientId ?? "") || undefined,
        domain: String(raw.ssoDomain ?? "") || undefined,
      },
    })
    revalidatePath("/settings/integrations")
  })
}
