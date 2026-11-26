import { describe, expect, it } from "vitest"
import { listAudit } from "@/server/audit/audit-log"
import { createBranch } from "@/server/modules/branches"
import { archiveLocation, createLocation } from "@/server/modules/locations"
import {
  createQrCode,
  generateMissingQrCodes,
  listQrCodes,
  recordScan,
  regenerateQrCode,
  resolvePublicQr,
  revokeQrCode,
} from "@/server/modules/qr-codes"
import { setTenantStatus } from "@/server/modules/tenants"
import { resolveAccess } from "@/server/rbac/ability"
import { testContext, setupTestDb } from "@/test/db"
import { errorCode, orgWithRoom } from "@/test/fixtures"

setupTestDb()

describe("QR codes", () => {
  it("creates one active code per location, and logs it", async () => {
    const { ctx, room } = await orgWithRoom()
    const qr = await createQrCode(ctx, room._id)
    expect(qr.shortCode).toMatch(/^[a-z2-9]{10}$/)
    expect(qr.status).toBe("active")
    expect(await errorCode(createQrCode(ctx, room._id))).toBe("CONFLICT")
    expect((await listAudit(ctx)).items[0].action).toBe("qr.created")
  })

  it("bulk-generates codes for every location that lacks one, once", async () => {
    const { ctx, branch, floor, room } = await orgWithRoom()
    await createLocation(ctx, {
      branchId: branch._id,
      parentId: floor._id,
      type: "location",
      name: "Lift lobby",
    })
    await createQrCode(ctx, room._id)
    expect(await generateMissingQrCodes(ctx, branch._id)).toBe(1)
    expect(await generateMissingQrCodes(ctx, branch._id)).toBe(0)
    // Floors are containers, not places people report from, so they get no code in bulk.
    expect((await listQrCodes(ctx, branch._id)).length).toBe(2)
  })

  it("resolves a public code to its tenant, location and categories", async () => {
    const { ctx, room } = await orgWithRoom({ industry: "hotel" })
    const qr = await createQrCode(ctx, room._id)
    const pub = await resolvePublicQr(qr.shortCode)
    expect(pub?.tenantName).toBe("Sunrise Hotels")
    expect(pub?.locationPath).toEqual(["Floor 2", "Washroom F2"])
    expect(pub?.categories.map((c) => c.label)).toContain("Housekeeping")
    expect(pub?.categories.at(-1)?.key).toBe("other")
  })

  it("regenerating revokes the old code and issues a new one", async () => {
    const { ctx, room } = await orgWithRoom()
    const old = await createQrCode(ctx, room._id)
    const fresh = await regenerateQrCode(ctx, old._id)
    expect(fresh.shortCode).not.toBe(old.shortCode)
    expect(await resolvePublicQr(old.shortCode)).toBeNull()
    expect(await resolvePublicQr(fresh.shortCode)).not.toBeNull()
  })

  it("stops resolving after revoke, location archive or tenant suspension", async () => {
    const a = await orgWithRoom()
    const qa = await createQrCode(a.ctx, a.room._id)
    await revokeQrCode(a.ctx, qa._id)
    expect(await resolvePublicQr(qa.shortCode)).toBeNull()

    const b = await orgWithRoom()
    const qb = await createQrCode(b.ctx, b.room._id)
    await archiveLocation(b.ctx, b.room._id)
    expect(await resolvePublicQr(qb.shortCode)).toBeNull()

    const c = await orgWithRoom()
    const qc = await createQrCode(c.ctx, c.room._id)
    await setTenantStatus({ actorId: "super", tenantId: c.tenant._id, status: "suspended" })
    expect(await resolvePublicQr(qc.shortCode)).toBeNull()
  })

  it("ignores malformed codes without touching the database", async () => {
    expect(await resolvePublicQr("../../etc")).toBeNull()
    expect(await resolvePublicQr("")).toBeNull()
  })

  it("counts scans", async () => {
    const { ctx, branch, room } = await orgWithRoom()
    const qr = await createQrCode(ctx, room._id)
    await recordScan(qr._id)
    await recordScan(qr._id)
    const [listed] = await listQrCodes(ctx, branch._id)
    expect(listed.scanCount).toBe(2)
    expect(listed.lastScannedAt).toBeInstanceOf(Date)
  })

  it("needs qr:create in the location's branch", async () => {
    const { ctx, tenant, branch, room } = await orgWithRoom()
    const staff = testContext({
      tenantId: tenant._id,
      ...resolveAccess({ roles: ["l1_staff"], branchIds: [branch._id] }, []),
    })
    expect(await errorCode(createQrCode(staff, room._id))).toBe("FORBIDDEN")

    const other = await createBranch(ctx, { name: "Mumbai", timezone: "Asia/Kolkata" })
    const otherRoom = await createLocation(ctx, {
      branchId: other._id,
      type: "location",
      name: "Lobby",
    })
    const manager = testContext({
      tenantId: tenant._id,
      ...resolveAccess({ roles: ["branch_admin"], branchIds: [branch._id] }, []),
    })
    expect(await errorCode(createQrCode(manager, otherRoom._id))).toBe("FORBIDDEN")
    expect((await createQrCode(manager, room._id)).status).toBe("active")
  })
})
