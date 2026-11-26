import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import type { ApiError } from "@/lib/api/errors"
import { listAudit } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import {
  archiveLocation,
  createLocation,
  getLocationTree,
  renameLocation,
} from "@/server/modules/locations"
import { createBranch } from "@/server/modules/branches"
import { createOrganization } from "@/server/modules/onboarding"
import { resolveAccess } from "@/server/rbac/ability"
import { testContext, setupTestDb } from "@/test/db"

setupTestDb()

async function setup() {
  const { tenant, branch } = await createOrganization(
    { id: "owner", email: "o@x.test", name: "O" },
    { orgName: "Acme", industry: "hotel", branchName: "Delhi", timezone: "Asia/Kolkata" },
  )
  const ctx = (await resolveTenantContext("owner", tenant._id))!
  return { ctx, tenant, branch }
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return (e as ApiError).code
  }
  throw new Error("expected a rejection")
}

describe("locations", () => {
  it("builds ancestors and a readable path", async () => {
    const { ctx, branch } = await setup()
    const floor = await createLocation(ctx, {
      branchId: branch._id,
      type: "floor",
      name: "Floor 2",
    })
    const wc = await createLocation(ctx, {
      branchId: branch._id,
      parentId: floor._id,
      type: "location",
      name: "Washroom F2",
    })
    expect(wc.ancestors.map(String)).toEqual([String(floor._id)])
    expect(wc.path).toEqual(["Floor 2", "Washroom F2"])

    const tree = await getLocationTree(ctx, branch._id)
    expect(tree[0].name).toBe("Floor 2")
    expect(tree[0].children[0].name).toBe("Washroom F2")
  })

  it("rejects invalid nesting and parents from another branch or tenant", async () => {
    const { ctx, branch } = await setup()
    const floor = await createLocation(ctx, { branchId: branch._id, type: "floor", name: "F1" })
    expect(
      await codeOf(
        createLocation(ctx, {
          branchId: branch._id,
          parentId: floor._id,
          type: "building",
          name: "B",
        }),
      ),
    ).toBe("VALIDATION")

    const other = await createBranch(ctx, { name: "Mumbai", timezone: "Asia/Kolkata" })
    expect(
      await codeOf(
        createLocation(ctx, {
          branchId: other._id,
          parentId: floor._id,
          type: "location",
          name: "X",
        }),
      ),
    ).toBe("VALIDATION")

    const stranger = testContext()
    expect(
      await codeOf(
        createLocation(stranger, {
          branchId: branch._id,
          parentId: floor._id,
          type: "location",
          name: "X",
        }),
      ),
    ).toBe("NOT_FOUND")
  })

  it("rejects a branch that is not in the tenant", async () => {
    const { ctx } = await setup()
    expect(
      await codeOf(createLocation(ctx, { branchId: new ObjectId(), type: "floor", name: "F" })),
    ).toBe("NOT_FOUND")
  })

  it("renames a location and rewrites its descendants' paths", async () => {
    const { ctx, branch } = await setup()
    const floor = await createLocation(ctx, { branchId: branch._id, type: "floor", name: "F2" })
    await createLocation(ctx, {
      branchId: branch._id,
      parentId: floor._id,
      type: "location",
      name: "Washroom",
    })
    await renameLocation(ctx, floor._id, "Floor 2")
    const tree = await getLocationTree(ctx, branch._id)
    expect(tree[0].children[0].path).toEqual(["Floor 2", "Washroom"])
  })

  it("will not archive a location that still has active children", async () => {
    const { ctx, branch } = await setup()
    const floor = await createLocation(ctx, { branchId: branch._id, type: "floor", name: "F" })
    const room = await createLocation(ctx, {
      branchId: branch._id,
      parentId: floor._id,
      type: "location",
      name: "R",
    })
    expect(await codeOf(archiveLocation(ctx, floor._id))).toBe("CONFLICT")
    await archiveLocation(ctx, room._id)
    await archiveLocation(ctx, floor._id)
    expect(await getLocationTree(ctx, branch._id)).toEqual([])
  })

  it("keeps branch-scoped staff to their own branches", async () => {
    const { ctx, tenant, branch } = await setup()
    const other = await createBranch(ctx, { name: "Mumbai", timezone: "Asia/Kolkata" })
    const manager = testContext({
      tenantId: tenant._id,
      ...resolveAccess({ roles: ["branch_admin"], branchIds: [branch._id] }, []),
    })
    await createLocation(manager, { branchId: branch._id, type: "floor", name: "ok" })
    expect(
      await codeOf(createLocation(manager, { branchId: other._id, type: "floor", name: "no" })),
    ).toBe("FORBIDDEN")
  })

  it("logs location changes", async () => {
    const { ctx, branch } = await setup()
    const f = await createLocation(ctx, { branchId: branch._id, type: "floor", name: "F" })
    await renameLocation(ctx, f._id, "G")
    const actions = (await listAudit(ctx)).items.map((e) => e.action)
    expect(actions.slice(0, 2)).toEqual(["location.renamed", "location.created"])
  })
})
