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
