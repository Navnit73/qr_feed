import { randomUUID } from "node:crypto"
import { MongoClient, ObjectId } from "mongodb"
import { afterAll, beforeAll, beforeEach, inject } from "vitest"
import { setDatabaseForTests } from "@/server/db/client"
import { ensureIndexes } from "@/server/db/indexes"
import type { TenantContext } from "@/server/db/tenant-context"
import { ALL_PERMISSIONS } from "@/server/rbac/permissions"

/**
 * Gives the calling test file its own fresh database on the shared test mongod, with indexes,
 * and empties every collection before each test.
 */
export function setupTestDb() {
  let client: MongoClient
  const name = `test_${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    client = new MongoClient(inject("mongoUri"))
    await client.connect()
    setDatabaseForTests(client, name)
    await ensureIndexes()
  })

  beforeEach(async () => {
    const db = client.db(name)
    const collections = await db.collections()
    await Promise.all(collections.map((c) => c.deleteMany({})))
  })

  afterAll(async () => {
    await client.db(name).dropDatabase()
    await client.close()
  })

  return { db: () => client.db(name) }
}

/** A tenant context with every permission and every branch unless overridden. */
export function testContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: new ObjectId(),
    actorId: "test-user",
    roles: ["org_admin"],
    permissions: new Set(ALL_PERMISSIONS),
    branchScope: "all",
    ...overrides,
  }
}
