import "server-only"
import { BSON } from "mongodb"
import { db } from "@/server/db/client"
import { ensureIndexes } from "@/server/db/indexes"

/** Serialises all user collections to Extended JSON for backup/restore drills (F-10.2). */
export async function dumpDatabaseToEjson(): Promise<string> {
  const database = db()
  const cols = await database.listCollections().toArray()
  const out: Record<string, unknown[]> = {}
  for (const col of cols) {
    if (col.name.startsWith("system.") || col.type === "view") continue
    out[col.name] = await database.collection(col.name).find({}).toArray()
  }
  return BSON.EJSON.stringify({ dumpedAt: new Date(), collections: out })
}

/** Restores collections from an EJSON archive and re-verifies all indexes. */
export async function restoreDatabaseFromEjson(payload: string): Promise<Record<string, number>> {
  const parsed = BSON.EJSON.parse(payload) as {
    collections?: Record<string, unknown>
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.collections ||
    typeof parsed.collections !== "object"
  ) {
    throw new Error("Invalid backup archive: missing collections map.")
  }
  const entries = Object.entries(parsed.collections).filter(([name]) => !name.startsWith("system."))
  for (const [name, docs] of entries) {
    if (!Array.isArray(docs)) {
      throw new Error(`Invalid backup archive: collection "${name}" is not an array.`)
    }
  }

  const database = db()
  const existingCols = await database.listCollections().toArray()
  const restoredNames = new Set(entries.map(([name]) => name))
  for (const col of existingCols) {
    if (col.name.startsWith("system.") || col.type === "view") continue
    if (!restoredNames.has(col.name)) {
      await database.collection(col.name).deleteMany({})
    }
  }

  const counts: Record<string, number> = {}
  for (const [name, docs] of entries) {
    const col = database.collection(name)
    await col.deleteMany({})
    if ((docs as Record<string, unknown>[]).length > 0) {
      await col.insertMany(docs as Record<string, unknown>[])
    }
    counts[name] = (docs as unknown[]).length
  }
  await ensureIndexes()
  return counts
}
