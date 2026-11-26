import "server-only"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { auth } from "@/server/auth/auth"
import { resolveTenantContext } from "@/server/auth/context"
import type { TenantContext } from "@/server/db/tenant-context"
import { env } from "@/server/env"
import type { SessionUser } from "@/server/modules/onboarding"

/** Which organisation the user is working in. Membership is re-checked on every request. */
export const TENANT_COOKIE = "qrf_tenant"

export type CurrentUser = SessionUser & { isSuperAdmin: boolean }

// cache(): one session lookup per request, however many components ask.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth().api.getSession({ headers: await headers() })
  if (!session) return null
  const { id, email, name } = session.user
  return { id, email, name, isSuperAdmin: env().SUPER_ADMIN_EMAILS.includes(email.toLowerCase()) }
})

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in")
  return user
}

export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const chosen = (await cookies()).get(TENANT_COOKIE)?.value
  return (
    (chosen ? await resolveTenantContext(user.id, chosen) : null) ??
    (await resolveTenantContext(user.id))
  )
})

/** For every (app) page and action: signed in, and an active member of an active tenant. */
export async function requireTenantContext(): Promise<TenantContext> {
  await requireUser()
  const ctx = await getTenantContext()
  if (!ctx) redirect("/onboarding")
  return ctx
}

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/super")
  if (!user.isSuperAdmin) redirect("/dashboard")
  return user
}

export async function setActiveTenant(tenantId: string) {
  ;(await cookies()).set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().BETTER_AUTH_URL.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}
