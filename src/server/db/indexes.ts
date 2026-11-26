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
    d.collection("tickets").createIndex({ tenantId: 1, "assignee.userId": 1, status: 1 }),
    d.collection("tickets").createIndex({ tenantId: 1, "sla.resolveDueAt": 1, status: 1 }),
    d
      .collection("tickets")
      .createIndex({ tenantId: 1, locationId: 1, categoryId: 1, status: 1, createdAt: -1 }),
    d.collection("tickets").createIndex({ trackingTokenHashes: 1 }),
    d.collection("ticketActivities").createIndex({ tenantId: 1, ticketId: 1, at: 1 }),
    d.collection("ticketComments").createIndex({ tenantId: 1, ticketId: 1, createdAt: 1 }),
    d.collection("assignmentRules").createIndex({ tenantId: 1, active: 1, priority: 1 }),
    d.collection("savedViews").createIndex({ tenantId: 1, ownerId: 1 }),
    d.collection("notifications").createIndex({ tenantId: 1, userId: 1, readAt: 1, createdAt: -1 }),
    d.collection("slaPolicies").createIndex({ tenantId: 1, active: 1, createdAt: 1 }),
    d.collection("escalationEvents").createIndex({ tenantId: 1, ticketId: 1, at: 1 }),
    d.collection("escalationEvents").createIndex({ tenantId: 1, at: -1 }),
    d.collection("rcas").createIndex({ tenantId: 1, number: 1 }, { unique: true }),
    d.collection("rcas").createIndex({ tenantId: 1, status: 1, createdAt: -1 }),
    d.collection("capas").createIndex({ tenantId: 1, number: 1 }, { unique: true }),
    d.collection("capas").createIndex({ tenantId: 1, rcaId: 1, createdAt: 1 }),
    d.collection("auditTemplates").createIndex({ tenantId: 1, name: 1 }),
    d.collection("audits").createIndex({ tenantId: 1, number: 1 }, { unique: true }),
    d.collection("audits").createIndex({ tenantId: 1, branchId: 1, scheduledAt: -1 }),
    d.collection("auditFindings").createIndex({ tenantId: 1, auditId: 1, createdAt: 1 }),
    d
      .collection("notificationPreferences")
      .createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    d.collection("savedReports").createIndex({ tenantId: 1, createdAt: -1 }),
    d.collection("subscriptions").createIndex({ tenantId: 1 }, { unique: true }),
    d.collection("apiKeys").createIndex({ keyHash: 1 }, { unique: true }),
    d.collection("apiKeys").createIndex({ tenantId: 1, createdAt: -1 }),
    d.collection("webhooks").createIndex({ tenantId: 1, active: 1 }),
    d.collection("webhookDeliveries").createIndex({ tenantId: 1, webhookId: 1, deliveredAt: -1 }),
    d.collection("attachments").createIndex({ tenantId: 1, entityId: 1, createdAt: -1 }),
    d.collection("attachments").createIndex({ tenantId: 1, storageKey: 1 }, { unique: true }),

    d.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}
