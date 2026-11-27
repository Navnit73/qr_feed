/**
 * Backup & restore drill utility (phase.md F-10.2).
 *
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/backup-restore.mts dump ./backup.ejson
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/backup-restore.mts restore ./backup.ejson
 */
import { readFile, writeFile } from "node:fs/promises"
import { dumpDatabaseToEjson, restoreDatabaseFromEjson } from "@/server/db/backup"
import { mongoClient } from "@/server/db/client"

const [mode, file] = process.argv.slice(2)
if (!mode || !file || !["dump", "restore"].includes(mode)) {
  console.error("Usage: backup-restore.mts <dump|restore> <file.ejson>")
  process.exit(1)
}

let touchedDb = false
try {
  if (mode === "dump") {
    touchedDb = true
    const json = await dumpDatabaseToEjson()
    await writeFile(file, json, "utf8")
    console.info(`✓ Dumped database to ${file} (${json.length} bytes)`)
  } else {
    const json = await readFile(file, "utf8")
    touchedDb = true
    const counts = await restoreDatabaseFromEjson(json)
    console.info("✓ Restored collections:", counts)
  }
} finally {
  if (touchedDb) {
    await mongoClient()
      .close()
      .catch(() => {})
  }
}
