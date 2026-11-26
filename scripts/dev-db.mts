/**
 * Local MongoDB without Docker or Atlas: a single-node replica set (transactions work) on
 * port 27017, with data kept in .data/mongo between runs.  `pnpm db:dev`
 */
import { mkdirSync } from "node:fs"
import { MongoMemoryReplSet } from "mongodb-memory-server"

const dbPath = ".data/mongo"
mkdirSync(dbPath, { recursive: true })

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: 27017, dbPath }],
})
console.info(`MongoDB ready: ${replSet.getUri()}\nPress Ctrl+C to stop.`)

const stop = async () => {
  await replSet.stop({ doCleanup: false })
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
