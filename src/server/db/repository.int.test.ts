import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { defineRepository, type TenantDoc } from "@/server/db/repository"
import { withTransaction } from "@/server/db/transaction"
import { testContext, setupTestDb } from "@/test/db"

type Widget = TenantDoc & { branchId: ObjectId; name: string; size?: number }
const widgets = defineRepository<Widget>("test_widgets", {
  branchField: "branchId",
  register: false,
})

setupTestDb()

const branchA1 = new ObjectId()
const branchA2 = new ObjectId()

describe("tenant-scoped repository", () => {
  it("stamps tenantId and timestamps on insert", async () => {
    const ctx = testContext()
    const w = await widgets.forTenant(ctx).insertOne({ branchId: branchA1, name: "Lobby" })
    expect(w.tenantId.equals(ctx.tenantId)).toBe(true)
    expect(w.createdAt).toBeInstanceOf(Date)
    expect(w.updatedAt).toBeInstanceOf(Date)
  })

  it("only ever returns the caller's tenant's documents", async () => {
    const a = testContext()
    const b = testContext()
    await widgets.forTenant(a).insertOne({ branchId: branchA1, name: "A" })
    await widgets.forTenant(b).insertOne({ branchId: branchA1, name: "B" })
    const seen = await widgets.forTenant(b).find({})
    expect(seen.map((w) => w.name)).toEqual(["B"])
  })

  it("cannot be tricked into another tenant through the filter", async () => {
    const a = testContext()
    const b = testContext()
    await widgets.forTenant(a).insertOne({ branchId: branchA1, name: "secret" })
    // An attacker-controlled filter naming tenant A must still be ANDed with tenant B.
    const hits = await widgets
      .forTenant(b)
      .find({ $or: [{ tenantId: a.tenantId }, { name: "secret" }] } as never)
    expect(hits).toEqual([])
  })

  it("refuses to insert or update a tenantId", async () => {
    const a = testContext()
    const b = testContext()
    await expect(
      widgets
        .forTenant(a)
        .insertOne({ branchId: branchA1, name: "x", tenantId: b.tenantId } as never),
    ).rejects.toThrow(/tenantId/)
    const w = await widgets.forTenant(a).insertOne({ branchId: branchA1, name: "x" })
    await expect(
      widgets.forTenant(a).updateOne({ _id: w._id }, { $set: { tenantId: b.tenantId } } as never),
    ).rejects.toThrow(/tenantId/)
  })

  it("bumps updatedAt and returns the updated document", async () => {
    const ctx = testContext()
    const w = await widgets.forTenant(ctx).insertOne({ branchId: branchA1, name: "old" })
    const updated = await widgets
      .forTenant(ctx)
      .updateOne({ _id: w._id }, { $set: { name: "new" } })
    expect(updated?.name).toBe("new")
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(w.updatedAt.getTime())
  })

  it("limits branch-scoped users to their branches", async () => {
    const tenantId = new ObjectId()
    const admin = testContext({ tenantId })
    const staff = testContext({ tenantId, branchScope: [branchA1] })
    await widgets.forTenant(admin).insertOne({ branchId: branchA1, name: "mine" })
    const other = await widgets.forTenant(admin).insertOne({ branchId: branchA2, name: "theirs" })

    expect((await widgets.forTenant(staff).find({})).map((w) => w.name)).toEqual(["mine"])
    expect(await widgets.forTenant(staff).findById(other._id)).toBeNull()
    await expect(
      widgets.forTenant(staff).insertOne({ branchId: branchA2, name: "nope" }),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      widgets.forTenant(staff).updateMany({}, { $set: { branchId: branchA2 } }),
    ).rejects.toThrow(/branch/)
  })

  it("paginates with meta", async () => {
    const ctx = testContext()
    for (let i = 0; i < 5; i++) {
      await widgets.forTenant(ctx).insertOne({ branchId: branchA1, name: `w${i}`, size: i })
    }
    const page = await widgets
      .forTenant(ctx)
      .paginate({}, { page: 2, pageSize: 2, sort: { size: 1 } })
    expect(page.items.map((w) => w.name)).toEqual(["w2", "w3"])
    expect(page.meta).toEqual({ total: 5, page: 2, pageSize: 2, totalPages: 3 })
  })

  it("rolls back every write in a failed transaction", async () => {
    const ctx = testContext()
    await expect(
      withTransaction(async (session) => {
        await widgets.forTenant(ctx).insertOne({ branchId: branchA1, name: "ghost" }, { session })
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(await widgets.forTenant(ctx).count({})).toBe(0)
  })
})
