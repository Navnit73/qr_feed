import "server-only"
import { MongoClient, type Db } from "mongodb"
import { env } from "@/server/env"

/**
 * The one MongoClient for the process. Only code in src/server/db and src/server/auth may
 * import this (ESLint enforces it); everything else goes through tenant-scoped repositories.
 */
type State = { client: MongoClient; dbName: string }

// Cached on globalThis so dev hot reloads don't open a new pool on every edit.
const g = globalThis as typeof globalThis & { __qrFeedMongo?: State }

function state(): State {
  if (!g.__qrFeedMongo) {
    const { MONGODB_URI, MONGODB_DB } = env()
    // The driver connects lazily on the first operation, so this stays synchronous.
    // Tuned pool sizing keeps latency low under burst traffic without exhausting Atlas sockets.
    g.__qrFeedMongo = {
      client: new MongoClient(MONGODB_URI, {
        appName: "qr-feed",
        maxPoolSize: 50,
        minPoolSize: 2,
        maxIdleTimeMS: 60_000,
        serverSelectionTimeoutMS: 5_000,
        connectTimeoutMS: 5_000,
      }),
      dbName: MONGODB_DB,
    }
  }
  return g.__qrFeedMongo
}

export function mongoClient(): MongoClient {
  return state().client
}

export function db(): Db {
  const s = state()
  return s.client.db(s.dbName)
}

/** Tests point the app at their own database on the shared test mongod. */
export function setDatabaseForTests(client: MongoClient, dbName: string) {
  g.__qrFeedMongo = { client, dbName }
}
