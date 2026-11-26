import "server-only"
import { BSON } from "mongodb"
import { db } from "@/server/db/client"
import { ensureIndexes } from "@/server/db/indexes"

/** Serialises all collections to Extended JSON for backup/restore drills (F-10.2). */
export async function dumpDatabaseToEjson(): Promise<string> {
  const database = db()
  const cols = await database.listCollections().toArray()
  const out: Record<string, unknown[]> = {}
  for (const col of cols) {
    out[col.name] = await database.collection(col.name).find({}).toArray()
  }
  return BSON.EJSON.stringify({ dumpedAt: new Date(), collections: out })
}

/** Restores collections from an EJSON archive and re-verifies all indexes. */
export async function restoreDatabaseFromEjson(payload: string): Promise<Record<string, number>> {
  const parsed = BSON.EJSON.parse(payload) as {
    collections: Record<string, Record<string, unknown>[]>
  }
  const database = db()
  const counts: Record<string, number> = {}
  for (const [name, docs] of Object.entries(parsed.collections)) {
    const col = database.collection(name)
    await col.deleteMany({})
    if (docs.length > 0) {
      await col.insertMany(docs)
    }
    counts[name] = docs.length
  }
  await ensureIndexes()
  return counts
}
