import "server-only"
import { db } from "@/server/db/client"

/**
 * Indexes. Every tenant index starts with tenantId (phase.md §4.3), plus targeted cross-tenant
 * indexes for the background SLA/auto-close/retention/orphan sweepers. Run on boot
 * (instrumentation.ts) and in tests. Batched with `createIndexes()` per collection to minimise
 * round-trips and catalog lock contention.
 */
export async function ensureIndexes() {
  const d = db()
  await Promise.all([
    d
      .collection("tenants")
      .createIndexes([
        { key: { slug: 1 }, unique: true },
        { key: { status: 1, createdAt: -1 } },
        { key: { createdAt: -1 } },
      ]),

    d.collection("branches").createIndexes([{ key: { tenantId: 1, status: 1, name: 1 } }]),

    d.collection("locations").createIndexes([
      { key: { tenantId: 1, status: 1 } },
      { key: { tenantId: 1, branchId: 1, status: 1, name: 1 } },
      { key: { tenantId: 1, branchId: 1, parentId: 1, name: 1 } },
      { key: { tenantId: 1, status: 1, path: 1 } },
      { key: { tenantId: 1, ancestors: 1 } },
      {
        key: { tenantId: 1, code: 1 },
        unique: true,
        partialFilterExpression: { code: { $type: "string" } },
      },
    ]),

    d
      .collection("members")
      .createIndexes([
        { key: { tenantId: 1, userId: 1 }, unique: true },
        { key: { tenantId: 1, email: 1 }, unique: true },
        { key: { tenantId: 1, status: 1, name: 1 } },
        { key: { tenantId: 1, status: 1, roles: 1 } },
        { key: { userId: 1, status: 1, createdAt: 1 } },
      ]),

    d
      .collection("invites")
      .createIndexes([
        { key: { tokenHash: 1 }, unique: true },
        { key: { tenantId: 1, email: 1, status: 1 } },
        { key: { tenantId: 1, status: 1, expiresAt: 1, createdAt: -1 } },
      ]),

    d.collection("roles").createIndexes([{ key: { tenantId: 1, name: 1 }, unique: true }]),

    d
      .collection("auditLogs")
      .createIndexes([
        { key: { tenantId: 1, seq: 1 }, unique: true },
        { key: { tenantId: 1, entity: 1, entityId: 1, at: -1 } },
        { key: { tenantId: 1, action: 1, at: -1 } },
      ]),
    d.collection("auditHeads").createIndexes([{ key: { tenantId: 1 }, unique: true }]),

    d
      .collection("categories")
      .createIndexes([
        { key: { tenantId: 1, key: 1 }, unique: true },
        { key: { tenantId: 1, active: 1, order: 1 } },
      ]),

    d.collection("qrCodes").createIndexes([
      { key: { shortCode: 1 }, unique: true },
      { key: { tenantId: 1, status: 1 } },
      { key: { tenantId: 1, branchId: 1, status: 1 } },
      // One active code per location; revoked ones are kept for history.
      {
        key: { tenantId: 1, locationId: 1 },
        unique: true,
        partialFilterExpression: { status: { $eq: "active" } },
      },
    ]),

    d.collection("tickets").createIndexes([
      { key: { tenantId: 1, number: 1 }, unique: true },
      { key: { tenantId: 1, createdAt: -1 } },
      { key: { tenantId: 1, createdAt: -1, _id: -1 } },
      { key: { tenantId: 1, status: 1, createdAt: -1 } },
      { key: { tenantId: 1, status: 1, createdAt: -1, _id: -1 } },
      { key: { tenantId: 1, branchId: 1, status: 1, createdAt: -1 } },
      { key: { tenantId: 1, "assignee.userId": 1, status: 1, "sla.resolveDueAt": 1 } },
      { key: { tenantId: 1, "sla.resolveDueAt": 1, status: 1 } },
      { key: { tenantId: 1, locationId: 1, categoryId: 1, status: 1, createdAt: -1 } },
      { key: { tenantId: 1, locationId: 1, categoryId: 1, createdAt: -1 } },
      { key: { tenantId: 1, status: 1, submittedForVerificationAt: 1 } },
      // Cross-tenant indexes for background SLA sweeper & health probe (avoid full collection scans).
      { key: { status: 1, "sla.pausedAt": 1, "sla.resolveDueAt": 1 } },
      { key: { status: 1, "sla.breached": 1 } },
      { key: { trackingTokenHashes: 1 } },
    ]),

    d.collection("ticketActivities").createIndexes([{ key: { tenantId: 1, ticketId: 1, at: 1 } }]),
    d
      .collection("ticketComments")
      .createIndexes([{ key: { tenantId: 1, ticketId: 1, createdAt: 1 } }]),
    d
      .collection("assignmentRules")
      .createIndexes([{ key: { tenantId: 1, active: 1, priority: 1 } }]),
    d.collection("savedViews").createIndexes([{ key: { tenantId: 1, ownerId: 1 } }]),
    d
      .collection("notifications")
      .createIndexes([
        { key: { tenantId: 1, userId: 1, channel: 1, createdAt: -1 } },
        { key: { tenantId: 1, userId: 1, channel: 1, readAt: 1 } },
      ]),
    d.collection("slaPolicies").createIndexes([{ key: { tenantId: 1, active: 1, createdAt: 1 } }]),
    d
      .collection("escalationEvents")
      .createIndexes([
        { key: { tenantId: 1, ticketId: 1, at: 1 } },
        { key: { tenantId: 1, at: -1 } },
      ]),
    d
      .collection("rcas")
      .createIndexes([
        { key: { tenantId: 1, number: 1 }, unique: true },
        { key: { tenantId: 1, createdAt: -1 } },
        { key: { tenantId: 1, branchId: 1, createdAt: -1 } },
        { key: { tenantId: 1, status: 1, createdAt: -1 } },
      ]),
    d
      .collection("capas")
      .createIndexes([
        { key: { tenantId: 1, number: 1 }, unique: true },
        { key: { tenantId: 1, createdAt: -1 } },
        { key: { tenantId: 1, rcaId: 1, createdAt: 1 } },
        { key: { status: 1, "actions.dueDate": 1 } },
      ]),
    d.collection("auditTemplates").createIndexes([{ key: { tenantId: 1, name: 1 } }]),
    d
      .collection("audits")
      .createIndexes([
        { key: { tenantId: 1, number: 1 }, unique: true },
        { key: { tenantId: 1, scheduledAt: -1 } },
        { key: { tenantId: 1, branchId: 1, scheduledAt: -1 } },
        { key: { status: 1, recurrence: 1, scheduledAt: 1 } },
      ]),
    d
      .collection("auditFindings")
      .createIndexes([
        { key: { tenantId: 1, auditId: 1, createdAt: 1 } },
        { key: { tenantId: 1, createdAt: -1 } },
      ]),
    d
      .collection("notificationPreferences")
      .createIndexes([{ key: { tenantId: 1, userId: 1 }, unique: true }]),
    d
      .collection("savedReports")
      .createIndexes([
        { key: { tenantId: 1, createdAt: -1 } },
        { key: { schedule: 1, lastSentAt: 1 } },
      ]),
    d.collection("subscriptions").createIndexes([{ key: { tenantId: 1 }, unique: true }]),
    d
      .collection("apiKeys")
      .createIndexes([
        { key: { keyHash: 1 }, unique: true },
        { key: { tenantId: 1, createdAt: -1 } },
      ]),
    d
      .collection("webhooks")
      .createIndexes([
        { key: { tenantId: 1, active: 1 } },
        { key: { tenantId: 1, createdAt: -1 } },
      ]),
    d
      .collection("webhookDeliveries")
      .createIndexes([
        { key: { tenantId: 1, webhookId: 1, deliveredAt: -1 } },
        { key: { tenantId: 1, deliveredAt: -1 } },
      ]),
    d
      .collection("attachments")
      .createIndexes([
        { key: { tenantId: 1, entityId: 1, createdAt: -1 } },
        { key: { tenantId: 1, storageKey: 1 }, unique: true },
        { key: { claimed: 1, createdAt: 1 } },
      ]),

    d.collection("rateLimits").createIndexes([{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }]),

    d
      .collection("surveys")
      .createIndexes([
        { key: { shortCode: 1 }, unique: true },
        { key: { tenantId: 1, status: 1, createdAt: -1 } },
        { key: { tenantId: 1, branchId: 1, status: 1 } },
      ]),

    d
      .collection("surveyResponses")
      .createIndexes([
        { key: { tenantId: 1, surveyId: 1, submittedAt: -1, _id: -1 } },
        { key: { tenantId: 1, submittedAt: -1 } },
      ]),

    d
      .collection("surveys")
      .createIndexes([
        { key: { shortCode: 1 }, unique: true },
        { key: { tenantId: 1, status: 1, createdAt: -1 } },
        { key: { tenantId: 1, branchId: 1, status: 1 } },
      ]),

    d
      .collection("surveyResponses")
      .createIndexes([
        { key: { tenantId: 1, surveyId: 1, submittedAt: -1, _id: -1 } },
        { key: { tenantId: 1, submittedAt: -1 } },
      ]),
  ])
}
