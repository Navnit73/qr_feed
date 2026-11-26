import "server-only"
import { db } from "@/server/db/client"

export async function getPlatformHealth() {
  const t0 = Date.now()
  await db().command({ ping: 1 })
  const pingMs = Date.now() - t0

  const [heartbeat, openTickets, breachedTickets, totalTenants] = await Promise.all([
    db()
      .collection("systemHeartbeats")
      .findOne({ _id: "worker" as never }),
    db()
      .collection("tickets")
      .countDocuments({ status: { $nin: ["closed", "cancelled"] } }),
    db()
      .collection("tickets")
      .countDocuments({
        status: { $nin: ["closed", "cancelled"] },
        "sla.breached": true,
      }),
    db().collection("tenants").countDocuments({}),
  ])

  return {
    db: { ok: true, pingMs },
    worker: heartbeat
      ? {
          status: String(heartbeat.status ?? "unknown"),
          lastBeatAt:
            heartbeat.lastBeatAt instanceof Date ? heartbeat.lastBeatAt.toISOString() : null,
          lastDurationMs: Number(heartbeat.lastDurationMs ?? 0),
        }
      : { status: "idle", lastBeatAt: null, lastDurationMs: 0 },
    queue: { openTickets, breachedTickets, totalTenants },
  }
}
