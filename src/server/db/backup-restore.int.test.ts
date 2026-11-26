import { describe, expect, it } from "vitest"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { db } from "@/server/db/client"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import { queryTickets } from "@/server/modules/tickets"
import { setupTestDb } from "@/test/db"
import { dumpDatabaseToEjson, restoreDatabaseFromEjson } from "@/server/db/backup"

setupTestDb()

describe("Phase 10 backup & restore drill (F-10.2)", () => {
  it("dumps the database, wipes all collections, restores cleanly, and verifies audit hash-chain", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "owner-bk", email: "owner@bk.test", name: "Backup Owner" },
      { orgName: "Drill Corp", industry: "hotel", branchName: "HQ", timezone: "Asia/Kolkata" },
    )
    const ctx = (await resolveTenantContext("owner-bk", tenant._id))!
    const loc = await createLocation(ctx, { branchId: branch._id, type: "location", name: "Lobby" })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "hotel")
    const sub = await submitFeedback(
      qr.shortCode,
      { categoryId: cats[0]._id.toHexString(), description: "AC leak", consent: "on" },
      { ip: "127.0.0.1", limits: null },
    )

    const archive = await dumpDatabaseToEjson()

    const cols = await db().listCollections().toArray()
    for (const c of cols) await db().collection(c.name).deleteMany({})
    expect((await queryTickets(ctx, {})).items).toHaveLength(0)

    const counts = await restoreDatabaseFromEjson(archive)
    expect(counts.tickets).toBe(1)

    const restoredTickets = (await queryTickets(ctx, { q: sub.number })).items
    expect(restoredTickets).toHaveLength(1)
    const chain = await verifyChain(ctx)
    expect(chain.ok).toBe(true)
    expect(chain.count).toBeGreaterThanOrEqual(4)
  })
})
