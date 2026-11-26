import "server-only"
import type { ClientSession } from "mongodb"
import { mongoClient } from "@/server/db/client"

/**
 * Runs `fn` in a MongoDB transaction. The driver retries the whole callback on transient
 * errors (write conflicts), so `fn` must be safe to run more than once.
 * Pass `session` to every repository call inside, or the write escapes the transaction.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = mongoClient().startSession()
  try {
    return await session.withTransaction(fn, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    })
  } finally {
    await session.endSession()
  }
}
