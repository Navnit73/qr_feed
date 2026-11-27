import "server-only"
import type { ClientSession } from "mongodb"
import { db } from "@/server/db/client"

/** Atomic sequence generator, e.g. ticket numbers per tenant per year. */
export async function nextSequence(key: string, session?: ClientSession): Promise<number> {
  const col = db().collection<{ _id: string; seq: number }>("counters")
  try {
    const doc = await col.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", session },
    )
    return doc!.seq
  } catch (err) {
    // Retry once on simultaneous first-hit E11000 upsert race when running outside a transaction.
    if (!session && err && typeof err === "object" && "code" in err && err.code === 11000) {
      const doc = await col.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { returnDocument: "after" },
      )
      return doc!.seq
    }
    throw err
  }
}
