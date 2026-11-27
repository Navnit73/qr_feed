import { createHash, timingSafeEqual } from "node:crypto"
import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { getCurrentUser } from "@/server/auth/session"
import { env } from "@/server/env"
import { sweepRecurringAudits } from "@/server/modules/audits"
import { sweepDataRetention } from "@/server/modules/platform"
import { sweepScheduledReports } from "@/server/modules/reports"
import { sweepAutoClose, sweepOverdueCapas, sweepSlaEscalations } from "@/server/modules/sla"
import { sweepOrphanAttachments } from "@/server/storage"

function safeBearerMatch(authHeader: string, secret: string | undefined): boolean {
  if (!secret) return false
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest()
  const provided = createHash("sha256").update(authHeader).digest()
  return timingSafeEqual(expected, provided)
}

/**
 * HTTP trigger for SLA escalation, auto-close, overdue CAPAs, scheduled digests,
 * recurring audits, data retention & orphan cleanup (Cron or super-admin).
 * Dedicated long-running worker is in worker/index.mts.
 */
export const POST = withApi(async (req: Request) => {
  const e = env()
  const authHeader = req.headers.get("authorization") ?? ""
  const tokenMatch = safeBearerMatch(authHeader, e.CRON_SECRET)
  if (!tokenMatch) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
      throw new ApiError("FORBIDDEN", "Cron secret or super-admin session required.")
    }
  }
  const now = new Date()
  const [sla, autoClosed, capaSweep, digestsSent, recurringAudits, retentionAnon, orphansCleaned] =
    await Promise.all([
      sweepSlaEscalations(now),
      sweepAutoClose(now),
      sweepOverdueCapas(now),
      sweepScheduledReports(now),
      sweepRecurringAudits(now),
      sweepDataRetention(now),
      sweepOrphanAttachments(now),
    ])
  return ok({
    sla,
    autoClosed,
    capasReminded: capaSweep.reminded,
    digestsSent,
    recurringAudits,
    retentionAnon,
    orphansCleaned,
    ranAt: now.toISOString(),
  })
})
