/**
 * Phase 0 exit criterion: tenant isolation for EVERY repository.
 *
 * Every repository registers itself in the registry. This file must hold a factory for each
 * registered name, so adding a collection without isolation tests fails CI.
 */
import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import { registeredRepositories } from "@/server/db/repository"
import "@/server/repositories"
import { testContext, setupTestDb } from "@/test/db"

/** A valid new document for each collection, minus tenant fields. */
const factories: Record<string, (branchId: ObjectId) => Record<string, unknown>> = {
  branches: () => ({ name: "Hotel Delhi", timezone: "Asia/Kolkata", status: "active" }),
  locations: (branchId) => ({
    branchId,
    type: "location",
    name: "Washroom F2",
    parentId: null,
    ancestors: [],
    path: ["Washroom F2"],
    status: "active",
  }),
  members: () => ({
    userId: new ObjectId().toHexString(),
    email: `${new ObjectId().toHexString()}@example.com`,
    name: "Asha",
    roles: ["l1_staff"],
    branchIds: [],
    status: "active",
  }),
  invites: () => ({
    email: "new@example.com",
    roles: ["l1_staff"],
    branchIds: [],
    tokenHash: new ObjectId().toHexString(),
    expiresAt: new Date(Date.now() + 86_400_000),
    invitedBy: "u1",
    status: "pending",
  }),
  roles: () => ({ name: "Night shift", permissions: ["ticket:read"], scope: "branch" }),
  categories: () => ({
    key: `c${new ObjectId().toHexString()}`,
    label: "Cleanliness",
    defaultSeverity: "medium",
    order: 1,
    active: true,
  }),
  qrCodes: (branchId) => ({
    branchId,
    locationId: new ObjectId(),
    shortCode: new ObjectId().toHexString().slice(0, 10),
    status: "active",
    scanCount: 0,
    createdBy: "u1",
  }),
  tickets: (branchId) => ({
    branchId,
    locationId: new ObjectId(),
    locationPath: ["Lobby"],
    qrCodeId: null,
    number: `TKT-2026-${new ObjectId().toHexString().slice(-6)}`,
    source: "qr",
    categoryId: new ObjectId(),
    categoryName: "Other",
    severity: "medium",
    status: "new",
    rating: 3,
    description: "x",
    reporter: { anonymous: true },
    trackingTokenHashes: [new ObjectId().toHexString()],
    reportCount: 1,
    lastReportedAt: new Date(),
  }),
  ticketActivities: (branchId) => ({
    branchId,
    ticketId: new ObjectId(),
    type: "ticket.created",
    actorId: "public",
    at: new Date(),
  }),
  ticketComments: (branchId) => ({
    branchId,
    ticketId: new ObjectId(),
    authorId: "u1",
    authorName: "Asha",
    body: "Checked",
    visibility: "internal",
    attachments: [],
  }),
  assignmentRules: (branchId) => ({
    name: "Default rule",
    priority: 1,
    active: true,
    conditions: { branchId },
    strategy: "fixed",
    userIds: ["u1"],
    lastAssignedIndex: 0,
  }),
  savedViews: () => ({
    name: "My view",
    ownerId: "u1",
    shared: false,
    filters: { status: "open" },
  }),
  notifications: () => ({
    userId: "u1",
    channel: "in_app",
    type: "ticket.assigned",
    title: "New ticket",
    body: "Assigned to you",
    readAt: null,
    sentAt: new Date(),
    status: "sent",
  }),
  slaPolicies: () => ({
    name: "Default SLA",
    active: true,
    businessHoursMode: "24x7",
    appliesTo: {},
    levels: [
      {
        level: 1,
        acceptWithinMin: 15,
        resolveWithinMin: 180,
        escalateAfterMin: 180,
        targetRole: "l1_staff",
        action: "both",
      },
    ],
    pauseStatuses: ["on_hold"],
  }),
  escalationEvents: (branchId) => ({
    branchId,
    ticketId: new ObjectId(),
    ticketNumber: "TKT-2026-000001",
    fromLevel: 1,
    toLevel: 2,
    reason: "SLA resolve breached",
    action: "both",
    at: new Date(),
    notifiedUserIds: ["u2"],
  }),
  rcas: (branchId) => ({
    number: `RCA-2026-${new ObjectId().toHexString().slice(-6)}`,
    title: "Recurring leak",
    method: "5why",
    sourceTicketIds: [],
    branchId,
    problemStatement: "Pipe leaked repeatedly",
    whys: ["Valve worn"],
    fishbone: { man: [], machine: [], method: [], material: [], measurement: [], environment: [] },
    contributingFactors: [],
    rootCause: "Worn seal",
    ownerId: "u1",
    ownerName: "Asha",
    status: "draft",
    approvals: [],
    attachments: [],
  }),
  capas: () => ({
    number: `CAPA-2026-${new ObjectId().toHexString().slice(-6)}`,
    rcaId: new ObjectId(),
    rcaNumber: "RCA-2026-000001",
    title: "Replace seals",
    type: "corrective",
    actions: [],
    status: "open",
  }),
  auditTemplates: () => ({
    name: "ISO 9001 Walk",
    standard: "ISO 9001",
    items: [{ id: "1", clause: "8.5", section: "Ops", question: "SOP posted?" }],
  }),
  audits: (branchId) => ({
    branchId,
    number: `AUD-2026-${new ObjectId().toHexString().slice(-6)}`,
    title: "Q4 Audit",
    templateId: new ObjectId(),
    templateName: "ISO 9001 Walk",
    auditorId: "u1",
    auditorName: "Priya",
    recurrence: "quarterly",
    scheduledAt: new Date(),
    status: "scheduled",
    checklistResults: [],
  }),
  auditFindings: (branchId) => ({
    branchId,
    auditId: new ObjectId(),
    auditNumber: "AUD-2026-000001",
    severity: "minor",
    clause: "7.1.5",
    description: "Unlabelled gauge",
    evidence: [],
    status: "open",
  }),
  notificationPreferences: () => ({
    userId: `u-${new ObjectId().toHexString()}`,
    channels: { in_app: true, email: true, sms: false, whatsapp: false, push: false },
    events: { assigned: true, escalated: true, verification: true, capaDue: true, digest: false },
    digestMode: "instant",
  }),
  savedReports: () => ({
    name: "Weekly digest",
    ownerId: "u1",
    rangeDays: 7,
    schedule: "weekly",
    recipients: ["admin@example.com"],
  }),
  subscriptions: () => ({
    plan: "trial",
    status: "trialing",
    provider: "sandbox",
    currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000),
    invoices: [],
  }),
  apiKeys: () => ({
    name: "Sync",
    prefix: "qrf_live_abcd",
    keyHash: new ObjectId().toHexString(),
    scopes: ["ticket:read"],
    createdBy: "u1",
  }),
  webhooks: () => ({
    name: "Ops hook",
    url: "https://example.com/hook",
    events: ["ticket.created"],
    secretHash: new ObjectId().toHexString(),
    secretPreview: "whsec_…1234",
    active: true,
  }),
  webhookDeliveries: () => ({
    webhookId: new ObjectId(),
    event: "ticket.created",
    statusCode: 200,
    ok: true,
    deliveredAt: new Date(),
  }),
  attachments: (branchId) => ({
    branchId,
    storageKey: `t/${new ObjectId().toHexString()}.jpg`,
    filename: "photo.jpg",
    contentType: "image/jpeg",
    size: 1024,
    uploadedBy: "u1",
    scope: "ticket",
  }),
  auditLogs: () => ({
    seq: 1,
    actorId: "u1",
    action: "test",
    entity: "test",
    entityId: null,
    at: new Date(),
    prevHash: "",
    hash: new ObjectId().toHexString(),
  }),
}

setupTestDb()

describe("tenant isolation", () => {
  it("has a factory (and so isolation tests) for every repository", () => {
    const names = [...registeredRepositories().keys()].sort()
    expect(names.length).toBeGreaterThan(0)
    expect(Object.keys(factories).sort()).toEqual(names)
  })

  for (const [name, repo] of registeredRepositories()) {
    describe(name, () => {
      async function seed() {
        const a = testContext()
        const b = testContext()
        const branchId = new ObjectId()
        const doc = await repo.forTenant(a).insertOne(factories[name](branchId) as never)
        return { a, b, doc }
      }

      it("tenant B cannot read tenant A's document", async () => {
        const { b, doc } = await seed()
        expect(await repo.forTenant(b).findById(doc._id)).toBeNull()
        expect(await repo.forTenant(b).find({ _id: doc._id })).toEqual([])
        expect(await repo.forTenant(b).count({})).toBe(0)
      })

      it("tenant B cannot update tenant A's document", async () => {
        const { a, b, doc } = await seed()
        if (!repo.writable) return
        expect(await repo.forTenant(b).updateOne({ _id: doc._id }, { $set: { x: 1 } })).toBeNull()
        expect(await repo.forTenant(b).updateMany({}, { $set: { x: 1 } })).toBe(0)
        expect((await repo.forTenant(a).findById(doc._id)) as never).not.toHaveProperty("x")
      })

      it("tenant B cannot delete tenant A's document", async () => {
        const { a, b, doc } = await seed()
        if (!repo.writable) return
        expect(await repo.forTenant(b).deleteOne({ _id: doc._id })).toBe(false)
        expect(await repo.forTenant(a).findById(doc._id)).not.toBeNull()
      })
    })
  }
})
