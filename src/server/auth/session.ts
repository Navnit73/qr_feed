import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { ObjectId } from "mongodb"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { ApiError } from "@/lib/api/errors"
import { appendAudit } from "@/server/audit/audit-log"
import { auth } from "@/server/auth/auth"
import { resolveSessionTenantContext } from "@/server/auth/context"
import type { TenantContext } from "@/server/db/tenant-context"
import { env } from "@/server/env"
import type { SessionUser } from "@/server/modules/onboarding"
import { getTenant } from "@/server/modules/tenants"
import { canSeePath } from "@/server/rbac/menus"
import { ALL_PERMISSIONS } from "@/server/rbac/permissions"

/** Set by `src/proxy.ts` on every app request, so server code knows which page is rendering. */
export const PATHNAME_HEADER = "x-qrf-pathname"

/** Which organisation the user is working in. Membership is re-checked on every request. */
export const TENANT_COOKIE = "qrf_tenant"

/** Signed HttpOnly cookie for logged Super Admin tenant impersonation (phase.md §7, §10). */
export const IMPERSONATE_COOKIE = "qrf_impersonate"

export type CurrentUser = SessionUser & { isSuperAdmin: boolean }

export type ImpersonationInfo = {
  tenantId: string
  tenantName: string
  reason: string
  startedAt: string
}

function signImpersonation(payloadB64: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET)
    .update(`impersonate:${payloadB64}`)
    .digest("base64url")
}

function encodeImpersonation(data: {
  actorId: string
  tenantId: string
  reason: string
  startedAt: string
  exp: number
}) {
  const payloadB64 = Buffer.from(JSON.stringify(data), "utf8").toString("base64url")
  return `${payloadB64}.${signImpersonation(payloadB64)}`
}

function decodeImpersonation(
  raw: string | undefined,
  expectedActorId: string,
): {
  tenantId: string
  reason: string
  startedAt: string
} | null {
  if (!raw) return null
  const [payloadB64, sig] = raw.split(".")
  if (!payloadB64 || !sig) return null
  const expected = signImpersonation(payloadB64)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(sig, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      actorId?: string
      tenantId?: string
      reason?: string
      startedAt?: string
      exp?: number
    }
    if (parsed.actorId !== expectedActorId) return null
    if (!parsed.tenantId || !ObjectId.isValid(parsed.tenantId) || !parsed.reason) return null
    if (!parsed.exp || Date.now() > parsed.exp) return null
    return {
      tenantId: parsed.tenantId,
      reason: parsed.reason,
      startedAt: parsed.startedAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

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

export const getActiveImpersonation = cache(async (): Promise<ImpersonationInfo | null> => {
  const user = await getCurrentUser()
  if (!user?.isSuperAdmin) return null
  const decoded = decodeImpersonation((await cookies()).get(IMPERSONATE_COOKIE)?.value, user.id)
  if (!decoded) return null
  const tenant = await getTenant(new ObjectId(decoded.tenantId))
  if (!tenant) return null
  return {
    tenantId: decoded.tenantId,
    tenantName: tenant.name,
    reason: decoded.reason,
    startedAt: decoded.startedAt,
  }
})

export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const store = await cookies()

  // Logged Super Admin impersonation (phase.md §7, §10): only valid for verified super admins.
  if (user.isSuperAdmin) {
    const imp = decodeImpersonation(store.get(IMPERSONATE_COOKIE)?.value, user.id)
    if (imp) {
      const tenant = await getTenant(new ObjectId(imp.tenantId))
      if (tenant) {
        return {
          tenantId: tenant._id,
          actorId: user.id,
          roles: ["org_admin"],
          permissions: new Set(ALL_PERMISSIONS),
          branchScope: "all",
        }
      }
    }
  }

  const chosen = store.get(TENANT_COOKIE)?.value
  return resolveSessionTenantContext(user.id, chosen)
})

/** For every (app) page and action: signed in, and an active member of an active tenant. */
export async function requireTenantContext(): Promise<TenantContext> {
  await requireUser()
  const ctx = await getTenantContext()
  if (!ctx) redirect("/onboarding")
  // A member whose admin switched a menu off can't reach its pages by URL either.
  if (ctx.menus) {
    const pathname = (await headers()).get(PATHNAME_HEADER)
    if (pathname && !canSeePath(ctx, pathname)) redirect("/dashboard")
  }
  return ctx
}

/** For API route handlers: returns 401/403 JSON instead of redirecting with HTML. */
export async function requireApiTenantContext(): Promise<TenantContext> {
  const user = await getCurrentUser()
  if (!user) throw new ApiError("UNAUTHORIZED", "Sign in to continue.")
  const ctx = await getTenantContext()
  if (!ctx) throw new ApiError("FORBIDDEN", "No active organisation membership.")
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

export async function clearActiveTenant() {
  const store = await cookies()
  store.delete(TENANT_COOKIE)
  store.delete(IMPERSONATE_COOKIE)
}

export async function startImpersonation(
  user: CurrentUser,
  tenantIdRaw: string,
  reasonRaw: string,
) {
  if (!user.isSuperAdmin) throw new ApiError("FORBIDDEN", "Super admin access required.")
  if (!ObjectId.isValid(tenantIdRaw)) throw new ApiError("VALIDATION", "Invalid tenant id.")
  const reason = reasonRaw.trim()
  if (reason.length < 5) {
    throw new ApiError(
      "VALIDATION",
      "Provide a reason (at least 5 characters) for impersonation.",
      {
        reason: ["Enter at least 5 characters explaining why you are impersonating this tenant"],
      },
    )
  }
  const tenantId = new ObjectId(tenantIdRaw)
  const tenant = await getTenant(tenantId)
  if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.")

  const startedAt = new Date().toISOString()
  await appendAudit(
    {
      tenantId,
      actorId: user.id,
      roles: ["super_admin"],
      permissions: new Set(),
      branchScope: "all",
    },
    {
      action: "super.impersonation_started",
      entity: "tenant",
      entityId: tenantId,
      after: { actorEmail: user.email, reason, startedAt },
    },
  )

  const token = encodeImpersonation({
    actorId: user.id,
    tenantId: tenantIdRaw,
    reason,
    startedAt,
    // 2-hour max impersonation session
    exp: Date.now() + 2 * 60 * 60 * 1000,
  })
  ;(await cookies()).set(IMPERSONATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().BETTER_AUTH_URL.startsWith("https://"),
    path: "/",
    maxAge: 2 * 60 * 60,
  })
}

export async function stopImpersonation(user: CurrentUser) {
  const store = await cookies()
  const imp = decodeImpersonation(store.get(IMPERSONATE_COOKIE)?.value, user.id)
  store.delete(IMPERSONATE_COOKIE)
  if (imp && user.isSuperAdmin) {
    await appendAudit(
      {
        tenantId: new ObjectId(imp.tenantId),
        actorId: user.id,
        roles: ["super_admin"],
        permissions: new Set(),
        branchScope: "all",
      },
      {
        action: "super.impersonation_ended",
        entity: "tenant",
        entityId: imp.tenantId,
        after: { actorEmail: user.email, reason: imp.reason },
      },
    ).catch(() => {})
  }
}
