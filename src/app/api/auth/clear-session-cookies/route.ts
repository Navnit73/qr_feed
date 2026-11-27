import { ok, withApi } from "@/lib/api/response"
import { clearActiveTenant } from "@/server/auth/session"

/** Clears HttpOnly tenant and impersonation cookies on sign-out so shared devices never leak state. */
export const POST = withApi(async () => {
  await clearActiveTenant()
  return ok({ cleared: true })
})
