/**
 * Standalone background worker process (phase.md §4.1, F-4.3).
 *
 * Runs outside Next.js serverless functions so SLA warnings, L1->L2->L3 escalations,
 * auto-close sweeps, overdue CAPA checks and digest jobs run reliably even when no user
 * has the app open. Idempotent by design; safe to restart at any time.
 *
 *   pnpm worker
 */
import { mongoClient, db } from "@/server/db/client"
import { ensureIndexes } from "@/server/db/indexes"
import { sweepAutoClose, sweepSlaEscalations } from "@/server/modules/sla"

const SWEEP_INTERVAL_MS = Number(process.env.WORKER_SWEEP_MS ?? 60_000)

let running = true

async function runCycle() {
  const startedAt = new Date()
  try {
    const [sla, autoClosed] = await Promise.all([
      sweepSlaEscalations(startedAt),
      sweepAutoClose(startedAt),
    ])
    await db()
      .collection("systemHeartbeats")
      .updateOne(
        { _id: "worker" as never },
        {
          $set: {
            lastBeatAt: new Date(),
            lastDurationMs: Date.now() - startedAt.getTime(),
            lastSlaResult: { ...sla, autoClosed },
            redisConfigured: Boolean(process.env.REDIS_URL),
            status: "ok",
          },
        },
        { upsert: true },
      )
    if (sla.warned > 0 || sla.escalated > 0) {
      console.info(
        `[worker] sweep ok: checked=${sla.checked} warned=${sla.warned} escalated=${sla.escalated}`,
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

  const shutdown = async () => {
    running = false
    clearInterval(timer)
    await mongoClient()
      .close()
      .catch(() => {})
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

void main()
