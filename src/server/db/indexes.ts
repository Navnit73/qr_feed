import "server-only"
import { db } from "@/server/db/client"

/**
 * Indexes. Every tenant index starts with tenantId (phase.md §4.3). Run on boot
 * (instrumentation.ts) and in tests. createIndex is idempotent.
 */
export async function ensureIndexes() {
  const d = db()
  await Promise.all([
    d.collection("tenants").createIndex({ slug: 1 }, { unique: true }),
    d.collection("tenants").createIndex({ status: 1, createdAt: -1 }),

    d.collection("branches").createIndex({ tenantId: 1, status: 1, name: 1 }),

    d.collection("locations").createIndex({ tenantId: 1, branchId: 1, parentId: 1, name: 1 }),
    d.collection("locations").createIndex({ tenantId: 1, ancestors: 1 }),
    d
      .collection("locations")
      .createIndex(
        { tenantId: 1, code: 1 },
        { unique: true, partialFilterExpression: { code: { $type: "string" } } },
      ),

    d.collection("members").createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    d.collection("members").createIndex({ tenantId: 1, email: 1 }, { unique: true }),
    d.collection("members").createIndex({ userId: 1, status: 1 }),

    d.collection("invites").createIndex({ tokenHash: 1 }, { unique: true }),
    d.collection("invites").createIndex({ tenantId: 1, email: 1, status: 1 }),

    d.collection("roles").createIndex({ tenantId: 1, name: 1 }, { unique: true }),

    d.collection("auditLogs").createIndex({ tenantId: 1, seq: 1 }, { unique: true }),
    d.collection("auditLogs").createIndex({ tenantId: 1, entity: 1, entityId: 1, at: -1 }),
    d.collection("auditHeads").createIndex({ tenantId: 1 }, { unique: true }),

    d.collection("categories").createIndex({ tenantId: 1, key: 1 }, { unique: true }),

    d.collection("qrCodes").createIndex({ shortCode: 1 }, { unique: true }),
    d.collection("qrCodes").createIndex({ tenantId: 1, branchId: 1, status: 1 }),
    // One active code per location; revoked ones are kept for history.
    d
      .collection("qrCodes")
      .createIndex(
        { tenantId: 1, locationId: 1 },
        { unique: true, partialFilterExpression: { status: { $eq: "active" } } },
      ),

    d.collection("tickets").createIndex({ tenantId: 1, number: 1 }, { unique: true }),
    d.collection("tickets").createIndex({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 }),
    d
      .collection("tickets")
      .createIndex({ tenantId: 1, locationId: 1, categoryId: 1, status: 1, createdAt: -1 }),
    d.collection("tickets").createIndex({ trackingTokenHashes: 1 }),
    d.collection("ticketActivities").createIndex({ tenantId: 1, ticketId: 1, at: 1 }),

    d.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}
