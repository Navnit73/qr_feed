import "server-only"
import type { ClientSession } from "mongodb"
import { db } from "@/server/db/client"

/** Atomic, gap-free-per-commit sequence, e.g. ticket numbers per tenant per year. */
export async function nextSequence(key: string, session?: ClientSession): Promise<number> {
  const doc = await db()
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", session },
    )
  return doc!.seq
}
