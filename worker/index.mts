/**
 * Standalone background worker process (phase.md §4.1, F-4.3).
 *
 * Runs outside Next.js serverless functions so SLA warnings, L1->L2->L3 escalations,
 * auto-close sweeps, overdue CAPA reminders, scheduled email digests, recurring audits,
 * data retention anonymisation, and orphan upload cleanup run reliably even when no user
 * has the app open. Idempotent by design; safe to restart at any time.
 *
 *   pnpm worker
 */
import { mongoClient, db } from "@/server/db/client"
import { ensureIndexes } from "@/server/db/indexes"
import { sweepRecurringAudits } from "@/server/modules/audits"
import { sweepDataRetention } from "@/server/modules/platform"
import { sweepScheduledReports } from "@/server/modules/reports"
import { sweepAutoClose, sweepOverdueCapas, sweepSlaEscalations } from "@/server/modules/sla"
import { sweepOrphanAttachments } from "@/server/storage"

const rawInterval = Number(process.env.WORKER_SWEEP_MS ?? 60_000)
const SWEEP_INTERVAL_MS =
  Number.isFinite(rawInterval) && rawInterval >= 1_000 ? rawInterval : 60_000

let running = true
let activeCycle: Promise<void> | null = null

async function runCycle() {
  if (activeCycle) return
  const task = (async () => {
    const startedAt = new Date()
    try {
      const [
        sla,
        autoClosed,
        capaSweep,
        digestsSent,
        recurringAudits,
        retentionAnon,
        orphansCleaned,
      ] = await Promise.all([
        sweepSlaEscalations(startedAt),
        sweepAutoClose(startedAt),
        sweepOverdueCapas(startedAt),
        sweepScheduledReports(startedAt),
        sweepRecurringAudits(startedAt),
        sweepDataRetention(startedAt),
        sweepOrphanAttachments(startedAt),
      ])
      await db()
        .collection("systemHeartbeats")
        .updateOne(
          { _id: "worker" as never },
          {
            $set: {
              lastBeatAt: new Date(),
              lastDurationMs: Date.now() - startedAt.getTime(),
              lastSlaResult: {
                ...sla,
                autoClosed,
                capasReminded: capaSweep.reminded,
                digestsSent,
                recurringAudits,
                retentionAnon,
                orphansCleaned,
              },
              redisConfigured: Boolean(process.env.REDIS_URL),
              status: "ok",
            },
          },
          { upsert: true },
        )
      if (sla.warned > 0 || sla.escalated > 0 || autoClosed > 0 || capaSweep.reminded > 0) {
        console.info(
          `[worker] sweep ok: sla(checked=${sla.checked} warned=${sla.warned} escalated=${sla.escalated}) autoClosed=${autoClosed} capasReminded=${capaSweep.reminded} digests=${digestsSent} audits=${recurringAudits} retention=${retentionAnon} orphans=${orphansCleaned}`,
        )
      }
    } catch (err) {
      console.error("[worker] sweep failed:", err)
      await db()
        .collection("systemHeartbeats")
        .updateOne(
          { _id: "worker" as never },
          { $set: { lastBeatAt: new Date(), status: "error", lastError: String(err) } },
          { upsert: true },
        )
        .catch(() => {})
    }
  })()
  activeCycle = task
  try {
    await task
  } finally {
    activeCycle = null
  }
}

async function main() {
  await ensureIndexes()
  console.info(
    `[worker] started (sweep every ${SWEEP_INTERVAL_MS}ms, redis=${process.env.REDIS_URL ? "configured" : "mongo-sweeper"})`,
  )
  await runCycle()

  const timer = setInterval(() => {
    if (running) void runCycle()
  }, SWEEP_INTERVAL_MS)

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    running = false
    clearInterval(timer)
    if (activeCycle) await activeCycle.catch(() => {})
    await mongoClient()
      .close()
      .catch(() => {})
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())
}

main().catch((err) => {
  console.error("[worker] fatal startup error:", err)
  process.exit(1)
})
