import { ok, withApi } from "@/lib/api/response"
import { getPlatformHealth } from "@/server/db/health"

// The reference route for the API envelope & observability probes (F-0.6, F-10.4).
export const GET = withApi(async (req) => {
  const detail = new URL(req.url).searchParams.get("detail") === "1"
  if (!detail) return ok({ status: "ok" })
  const health = await getPlatformHealth().catch(() => null)
  return ok({
    status: "ok",
    ...(health ? { db: health.db, worker: health.worker, queue: health.queue } : {}),
  })
})
