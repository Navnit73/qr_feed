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
  const bucketId = `${key}:${windowStart}`
  const col = db().collection<Bucket>("rateLimits")
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } }
  let bucket: Bucket | null
  try {
    bucket = await col.findOneAndUpdate({ _id: bucketId }, update, {
      upsert: true,
      returnDocument: "after",
    })
  } catch (err) {
    // Retry once on simultaneous first-hit E11000 upsert race on a fresh window.
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      bucket = await col.findOneAndUpdate(
        { _id: bucketId },
        { $inc: { count: 1 } },
        {
          returnDocument: "after",
        },
      )
    } else {
      throw err
    }
  }
  const count = bucket?.count ?? 1
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.ceil((resetAt - now) / 1000),
  }
}
