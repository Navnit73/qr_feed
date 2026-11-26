import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { getCurrentUser } from "@/server/auth/session"
import { env } from "@/server/env"
import { sweepAutoClose, sweepSlaEscalations } from "@/server/modules/sla"

/**
 * HTTP trigger for SLA escalation & auto-close sweep (works with Cron or super-admin).
 * Dedicated long-running worker is in worker/index.mts.
 */
export const POST = withApi(async (req: Request) => {
  const e = env()
  const authHeader = req.headers.get("authorization") ?? ""
  const tokenMatch = e.CRON_SECRET && authHeader === `Bearer ${e.CRON_SECRET}`
  if (!tokenMatch) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
      throw new ApiError("FORBIDDEN", "Cron secret or super-admin session required.")
    }
  }
  const [sla, autoClosed] = await Promise.all([sweepSlaEscalations(), sweepAutoClose()])
  return ok({ sla, autoClosed, ranAt: new Date().toISOString() })
})
