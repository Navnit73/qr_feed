import { fail, ok, withApi } from "@/lib/api/response"
import { getCurrentUser } from "@/server/auth/session"
import { getPlatformHealth } from "@/server/db/health"

// The reference route for the API envelope & observability probes (F-0.6, F-10.4).
export const GET = withApi(async (req) => {
  const detail = new URL(req.url).searchParams.get("detail") === "1"
  if (!detail) return ok({ status: "ok" })
  const [health, user] = await Promise.all([
    getPlatformHealth().catch(() => null),
    getCurrentUser().catch(() => null),
  ])
  if (!health) {
    return fail("INTERNAL", "Database health probe failed.", undefined, { status: 503 })
  }
  return ok({
    status: "ok",
    db: health.db,
    worker: { status: health.worker.status, lastBeatAt: health.worker.lastBeatAt },
    // Only super-admins receive cross-tenant global counts.
    ...(user?.isSuperAdmin ? { queue: health.queue } : {}),
  })
})
