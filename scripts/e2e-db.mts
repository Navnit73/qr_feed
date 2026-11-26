/** Throwaway MongoDB for Playwright runs (in-memory, port 27999). Started by playwright.config. */
import { MongoMemoryReplSet } from "mongodb-memory-server"

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: "rs0", count: 1 },
  instanceOpts: [{ port: 27999 }],
})
console.info(`E2E MongoDB ready: ${replSet.getUri()}`)
const stop = async () => {
  await replSet.stop()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
