import { describe, expect, it } from "vitest"
import { appendAudit, listAudit, verifyChain } from "@/server/audit/audit-log"
import { withTransaction } from "@/server/db/transaction"
import { auditLogs } from "@/server/repositories"
import { testContext, setupTestDb } from "@/test/db"

const { db } = setupTestDb()

const entry = (n: number) => ({
  action: "branch.updated",
  entity: "branch",
  entityId: `b${n}`,
  before: { name: `v${n - 1}` },
  after: { name: `v${n}` },
})

describe("audit log", () => {
  it("chains each entry to the previous one", async () => {
    const ctx = testContext()
    const first = await appendAudit(ctx, entry(1))
    const second = await appendAudit(ctx, entry(2))
    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)
    expect(second.prevHash).toBe(first.hash)
    expect(await verifyChain(ctx)).toEqual({ ok: true, count: 2 })
  })

  it("detects an edited entry", async () => {
    const ctx = testContext()
    for (let i = 1; i <= 3; i++) await appendAudit(ctx, entry(i))
    await db()
      .collection("auditLogs")
      .updateOne({ tenantId: ctx.tenantId, seq: 2 }, { $set: { "after.name": "forged" } })
    expect(await verifyChain(ctx)).toEqual({ ok: false, count: 3, brokenAtSeq: 2 })
  })

  it("detects a deleted entry", async () => {
    const ctx = testContext()
    for (let i = 1; i <= 3; i++) await appendAudit(ctx, entry(i))
    await db().collection("auditLogs").deleteOne({ tenantId: ctx.tenantId, seq: 2 })
    expect(await verifyChain(ctx)).toMatchObject({ ok: false, brokenAtSeq: 3 })
  })

  it("keeps a separate chain per tenant", async () => {
    const a = testContext()
    const b = testContext()
    await appendAudit(a, entry(1))
    const firstOfB = await appendAudit(b, entry(1))
    expect(firstOfB.seq).toBe(1)
    expect(firstOfB.prevHash).toBe("")
    expect((await listAudit(b)).items).toHaveLength(1)
  })

  it("stays gap-free under concurrent writes", async () => {
    const ctx = testContext()
    await Promise.all(Array.from({ length: 10 }, (_, i) => appendAudit(ctx, entry(i + 1))))
    const { items } = await listAudit(ctx, { pageSize: 50 })
    expect(items.map((e) => e.seq).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(await verifyChain(ctx)).toEqual({ ok: true, count: 10 })
  })

  it("rolls back with the caller's transaction", async () => {
    const ctx = testContext()
    await expect(
      withTransaction(async (session) => {
        await appendAudit(ctx, entry(1), { session })
        throw new Error("abort")
      }),
    ).rejects.toThrow("abort")
    expect((await listAudit(ctx)).items).toHaveLength(0)
    // The chain head rolled back too, so the next entry is still seq 1.
    expect((await appendAudit(ctx, entry(1))).seq).toBe(1)
  })

  it("lists newest first", async () => {
    const ctx = testContext()
    for (let i = 1; i <= 3; i++) await appendAudit(ctx, entry(i))
    expect((await listAudit(ctx)).items.map((e) => e.seq)).toEqual([3, 2, 1])
  })

  it("has no update or delete path", async () => {
    const ctx = testContext()
    const e = await appendAudit(ctx, entry(1))
    await expect(
      auditLogs.forTenant(ctx).updateOne({ _id: e._id }, { $set: { action: "x" } }),
    ).rejects.toThrow(/append-only/)
    await expect(auditLogs.forTenant(ctx).deleteOne({ _id: e._id })).rejects.toThrow(/append-only/)
  })
})
