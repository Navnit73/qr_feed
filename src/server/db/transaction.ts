import "server-only"
import type { ClientSession } from "mongodb"
import { mongoClient } from "@/server/db/client"

function isInternalCounterCollision(err: unknown): boolean {
  if (!err || typeof err !== "object" || (err as { code?: unknown }).code !== 11000) return false
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes(".counters") || msg.includes(".auditHeads")
}

/**
 * Runs `fn` in a MongoDB transaction. The driver retries the whole callback on transient
 * errors (write conflicts), so `fn` must be safe to run more than once.
 * Pass `session` to every repository call inside, or the write escapes the transaction.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = mongoClient().startSession()
    try {
      return await session.withTransaction(fn, {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      })
    } catch (err) {
      // Concurrent first-time upserts into `counters` or `auditHeads` inside a transaction can
      // surface E11000 without the TransientTransactionError label; retry with a fresh snapshot.
      if (attempt < 2 && isInternalCounterCollision(err)) continue
      throw err
    } finally {
      await session.endSession()
    }
  }
  throw new Error("Transaction failed after retries.")
}
