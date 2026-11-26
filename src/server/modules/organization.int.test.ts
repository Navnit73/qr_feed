import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { listAudit, verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { createBranch, listBranches, updateBranch } from "@/server/modules/branches"
import { createOrganization } from "@/server/modules/onboarding"
import { listTenants, setTenantLimits, setTenantStatus } from "@/server/modules/tenants"
import { resolveAccess } from "@/server/rbac/ability"
import { members } from "@/server/repositories"
import { testContext, setupTestDb } from "@/test/db"

setupTestDb()

const owner = { id: "user-owner", email: "owner@acme.test", name: "Owner" }
const input = {
  orgName: "Acme Hotels",
  industry: "hotel" as const,
  branchName: "Hotel Delhi",
  timezone: "Asia/Kolkata",
}

async function errorOf(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error("expected a rejection")
}

describe("createOrganization()", () => {
  it("creates the tenant, first branch and owner membership in one go", async () => {
    const { tenant, branch, member } = await createOrganization(owner, input)
    expect(tenant.name).toBe("Acme Hotels")
    expect(tenant.slug).toBe("acme-hotels")
    expect(tenant.status).toBe("active")
    expect(branch.tenantId.equals(tenant._id)).toBe(true)
    expect(member.roles).toEqual(["org_admin"])
    expect(member.userId).toBe(owner.id)
  })

  it("logs every step in the tenant's audit chain", async () => {
    const { tenant } = await createOrganization(owner, input)
    const ctx = testContext({ tenantId: tenant._id })
    const actions = (await listAudit(ctx)).items.map((e) => e.action).reverse()
    expect(actions).toEqual(["tenant.created", "branch.created", "member.added"])
    expect(await verifyChain(ctx)).toEqual({ ok: true, count: 3 })
  })

  it("gives a clashing name a unique slug", async () => {
    await createOrganization(owner, input)
    const second = await createOrganization({ ...owner, id: "u2" }, input)
    expect(second.tenant.slug).toMatch(/^acme-hotels-[a-z0-9]{4}$/)
  })

  it("rejects bad input field by field", async () => {
    const err = await errorOf(
      createOrganization(owner, { ...input, orgName: " ", timezone: "Mars/Olympus" }),
    )
    expect(err.code).toBe("VALIDATION")
    expect(Object.keys(err.details ?? {}).sort()).toEqual(["orgName", "timezone"])
  })
})

describe("branches", () => {
  it("lets an org admin create and rename branches, with audit entries", async () => {
    const { tenant } = await createOrganization(owner, input)
    const ctx = (await resolveTenantContext(owner.id, tenant._id))!
    const b = await createBranch(ctx, { name: "Hotel Mumbai", timezone: "Asia/Kolkata" })
    await updateBranch(ctx, b._id, { name: "Hotel Mumbai Central" })
    expect((await listBranches(ctx)).map((x) => x.name).sort()).toEqual([
      "Hotel Delhi",
      "Hotel Mumbai Central",
    ])
    const actions = (await listAudit(ctx)).items.map((e) => e.action)
    expect(actions.slice(0, 2)).toEqual(["branch.updated", "branch.created"])
  })

  it("refuses branch creation without branch:manage or tenant-wide scope", async () => {
    const tenantId = new ObjectId()
    const l1 = testContext({
      tenantId,
      ...resolveAccess({ roles: ["l1_staff"], branchIds: [new ObjectId()] }, []),
    })
    expect((await errorOf(createBranch(l1, { name: "X", timezone: "UTC" }))).code).toBe("FORBIDDEN")
    const branchAdmin = testContext({
      tenantId,
      ...resolveAccess({ roles: ["branch_admin"], branchIds: [new ObjectId()] }, []),
    })
    expect((await errorOf(createBranch(branchAdmin, { name: "X", timezone: "UTC" }))).code).toBe(
      "FORBIDDEN",
    )
  })

  it("shows branch-scoped users only their branches", async () => {
    const { tenant, branch } = await createOrganization(owner, input)
    const admin = (await resolveTenantContext(owner.id, tenant._id))!
    await createBranch(admin, { name: "Other", timezone: "UTC" })
    const staff = testContext({
      tenantId: tenant._id,
      ...resolveAccess({ roles: ["branch_admin"], branchIds: [branch._id] }, []),
    })
    expect((await listBranches(staff)).map((b) => b.name)).toEqual(["Hotel Delhi"])
  })
})

describe("resolveTenantContext()", () => {
  it("builds permissions and scope from the membership", async () => {
    const { tenant } = await createOrganization(owner, input)
    const ctx = await resolveTenantContext(owner.id, tenant._id)
    expect(ctx?.permissions.has("user:invite")).toBe(true)
    expect(ctx?.branchScope).toBe("all")
    expect(ctx?.actorId).toBe(owner.id)
  })

  it("returns null for a non-member, an inactive member or a suspended tenant", async () => {
    const { tenant, member } = await createOrganization(owner, input)
    expect(await resolveTenantContext("stranger", tenant._id)).toBeNull()

    await setTenantStatus({ actorId: "super", tenantId: tenant._id, status: "suspended" })
    expect(await resolveTenantContext(owner.id, tenant._id)).toBeNull()
    await setTenantStatus({ actorId: "super", tenantId: tenant._id, status: "active" })
    expect(await resolveTenantContext(owner.id, tenant._id)).not.toBeNull()

    const ctx = testContext({ tenantId: tenant._id })
    await members.forTenant(ctx).updateOne({ _id: member._id }, { $set: { status: "inactive" } })
    expect(await resolveTenantContext(owner.id, tenant._id)).toBeNull()
  })

  it("picks the user's first active tenant when none is given", async () => {
    const { tenant } = await createOrganization(owner, input)
    expect((await resolveTenantContext(owner.id))?.tenantId.equals(tenant._id)).toBe(true)
  })
})

describe("super admin tenant console", () => {
  it("lists tenants and logs suspensions in the tenant's own chain", async () => {
    const { tenant } = await createOrganization(owner, input)
    await createOrganization({ ...owner, id: "u2" }, { ...input, orgName: "Beta Clinic" })
    expect((await listTenants()).map((t) => t.name).sort()).toEqual(["Acme Hotels", "Beta Clinic"])

    await setTenantStatus({ actorId: "super-1", tenantId: tenant._id, status: "suspended" })
    const ctx = testContext({ tenantId: tenant._id })
    const [last] = (await listAudit(ctx)).items
    expect(last).toMatchObject({ action: "tenant.suspended", actorId: "super-1" })
    expect(await verifyChain(ctx)).toMatchObject({ ok: true })
  })

  it("enforces plan limits set by the super admin", async () => {
    const { tenant } = await createOrganization(owner, input)
    await setTenantLimits({
      actorId: "super-1",
      tenantId: tenant._id,
      limits: { branches: 1, users: 15, locations: 200 },
    })
    const ctx = (await resolveTenantContext(owner.id, tenant._id))!
    const err = await errorOf(createBranch(ctx, { name: "Second", timezone: "UTC" }))
    expect(err.code).toBe("CONFLICT")
    expect(err.message).toMatch(/plan allows 1 branches/)
  })
})
