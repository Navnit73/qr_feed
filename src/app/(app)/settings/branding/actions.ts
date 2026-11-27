"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { parseInput } from "@/lib/api/validation"
import { formObject, runAction, type ActionState } from "@/server/actions"
import { requireTenantContext } from "@/server/auth/session"
import { isSafeExternalHttpsUrl } from "@/server/modules/platform"
import { updateTenantBranding } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"

const schema = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || isSafeExternalHttpsUrl(v), "Use a public HTTPS image URL.")
    .optional(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^$|^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #3730a3")
    .optional(),
  customDomain: z.string().trim().max(120).optional(),
  emailSenderDomain: z.string().trim().max(120).optional(),
  publicDisclaimer: z.string().trim().max(500).optional(),
})

export async function saveBrandingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireTenantContext()
  return runAction(async () => {
    assertCan(ctx, "tenant:manage")
    const input = parseInput(schema, formObject(form))
    await updateTenantBranding(ctx, {
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      ...(input.primaryColor ? { primaryColor: input.primaryColor } : {}),
      ...(input.customDomain ? { customDomain: input.customDomain } : {}),
      ...(input.emailSenderDomain ? { emailSenderDomain: input.emailSenderDomain } : {}),
      ...(input.publicDisclaimer ? { publicDisclaimer: input.publicDisclaimer } : {}),
    })
    revalidatePath("/settings/branding")
  })
}
