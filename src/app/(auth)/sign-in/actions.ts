"use server"

import { redirect } from "next/navigation"
import { safeNext } from "@/lib/safe-next"
import { runAction, type ActionState } from "@/server/actions"
import { auth } from "@/server/auth/auth"
import { setActiveTenant } from "@/server/auth/session"
import { ensureDemoWorkspace } from "@/server/modules/demo"

/**
 * One-click Demo Login (phase.md P10): idempotently ensures the Sunrise Hospital demo workspace
 * exists, signs the browser in via Better Auth (setting HttpOnly cookies via nextCookies()),
 * sets the active tenant cookie, and redirects directly to the dashboard.
 */
export async function demoSignInAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const nextRaw = form.get("next")
  const target = safeNext(typeof nextRaw === "string" ? nextRaw : null, "/dashboard")
  const res = await runAction(async () => {
    const demo = await ensureDemoWorkspace()
    await auth().api.signInEmail({
      body: { email: demo.email, password: demo.password },
    })
    await setActiveTenant(demo.tenantId)
    return { target }
  })
  if (res.ok) redirect(res.data.target)
  return res
}
