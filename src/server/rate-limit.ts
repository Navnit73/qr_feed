import "server-only"
import { db } from "@/server/db/client"

type Bucket = { _id: string; count: number; expiresAt: Date }

/**
 * Fixed-window counter in MongoDB (Redis arrives with the SLA worker in P4). One atomic
 * upsert per call, so concurrent requests can't slip past the limit. A TTL index removes old
 * windows.
 */
export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string
  limit: number
  windowMs: number
}): Promise<{ ok: boolean; remaining: number; retryAfterSec: number }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const resetAt = windowStart + windowMs
  const bucket = await db()
    .collection<Bucket>("rateLimits")
    .findOneAndUpdate(
      { _id: `${key}:${windowStart}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } },
      { upsert: true, returnDocument: "after" },
    )
  const count = bucket?.count ?? 1
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.ceil((resetAt - now) / 1000),
  }
}
