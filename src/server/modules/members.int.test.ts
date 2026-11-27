import { describe, expect, it } from "vitest"
import type { ApiError } from "@/lib/api/errors"
import { listAudit } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import {
  acceptInvite,
  createInvite,
  listInvites,
  listMembers,
  revokeInvite,
  setMemberStatus,
  updateMemberAccess,
} from "@/server/modules/members"
import { createBranch } from "@/server/modules/branches"
import { createOrganization } from "@/server/modules/onboarding"
import { resolveAccess } from "@/server/rbac/ability"
import { testContext, setupTestDb } from "@/test/db"

const { db } = setupTestDb()

const owner = { id: "owner", email: "owner@acme.test", name: "Owner" }
const newbie = { id: "newbie", email: "asha@acme.test", name: "Asha" }

async function setup() {
  const { tenant, branch } = await createOrganization(owner, {
    orgName: "Acme",
    industry: "clinic",
    branchName: "Main",
    timezone: "Asia/Kolkata",
  })
  const ctx = (await resolveTenantContext(owner.id, tenant._id))!
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

describe("invites", () => {
  it("stores only a hash of the token", async () => {
    const { ctx, branch } = await setup()
    const { token } = await createInvite(ctx, {
      email: "Asha@Acme.test",
      roles: ["l1_staff"],
      branchIds: [branch._id.toHexString()],
    })
    expect(token.length).toBeGreaterThanOrEqual(40)
    const raw = await db().collection("invites").findOne({})
    expect(JSON.stringify(raw)).not.toContain(token)
    expect(raw?.email).toBe("asha@acme.test")
  })

  it("turns an accepted invite into an active membership, once", async () => {
    const { ctx, tenant, branch } = await setup()
    const { token } = await createInvite(ctx, {
      email: newbie.email,
      roles: ["l1_staff"],
      branchIds: [branch._id.toHexString()],
    })
    const member = await acceptInvite(newbie, token)
    expect(member.tenantId.equals(tenant._id)).toBe(true)
    expect(member.roles).toEqual(["l1_staff"])

    const staffCtx = await resolveTenantContext(newbie.id, tenant._id)
    expect(staffCtx?.branchScope).toEqual([branch._id])
    expect(await codeOf(acceptInvite(newbie, token))).toBe("NOT_FOUND")
  })

  it("rejects the wrong email, an expired token and a revoked invite", async () => {
    const { ctx } = await setup()
    const a = await createInvite(ctx, { email: newbie.email, roles: ["verifier"], branchIds: [] })
    expect(await codeOf(acceptInvite({ ...newbie, email: "other@x.test" }, a.token))).toBe(
      "FORBIDDEN",
    )

    await db()
      .collection("invites")
      .updateMany({}, { $set: { expiresAt: new Date(0) } })
    expect(await codeOf(acceptInvite(newbie, a.token))).toBe("NOT_FOUND")

    const b = await createInvite(ctx, { email: "b@x.test", roles: ["verifier"], branchIds: [] })
    await revokeInvite(ctx, b.invite._id)
    expect(await codeOf(acceptInvite({ ...newbie, email: "b@x.test" }, b.token))).toBe("NOT_FOUND")
  })

  it("blocks duplicates and unknown roles", async () => {
    const { ctx } = await setup()
    await createInvite(ctx, { email: newbie.email, roles: ["l1_staff"], branchIds: [] })
    expect(
      await codeOf(createInvite(ctx, { email: newbie.email, roles: ["l1_staff"], branchIds: [] })),
    ).toBe("CONFLICT")
    expect(
      await codeOf(createInvite(ctx, { email: owner.email, roles: ["l1_staff"], branchIds: [] })),
    ).toBe("CONFLICT")
    expect(
      await codeOf(createInvite(ctx, { email: "z@x.test", roles: ["wizard"], branchIds: [] })),
    ).toBe("VALIDATION")
  })

  it("stops a branch admin inviting an org admin (no privilege escalation)", async () => {
    const { tenant, branch } = await setup()
    const branchAdmin = testContext({
      tenantId: tenant._id,
      roles: ["branch_admin"],
      ...resolveAccess({ roles: ["branch_admin"], branchIds: [branch._id] }, []),
    })
    expect(
      await codeOf(
        createInvite(branchAdmin, { email: "evil@x.test", roles: ["org_admin"], branchIds: [] }),
      ),
    ).toBe("FORBIDDEN")
  })

  it("lists pending invites only", async () => {
    const { ctx } = await setup()
    const a = await createInvite(ctx, { email: "a@x.test", roles: ["verifier"], branchIds: [] })
    await createInvite(ctx, { email: "b@x.test", roles: ["verifier"], branchIds: [] })
    await revokeInvite(ctx, a.invite._id)
    expect((await listInvites(ctx)).map((i) => i.email)).toEqual(["b@x.test"])
  })
})

describe("members", () => {
  it("lists members and logs role changes", async () => {
    const { ctx, branch } = await setup()
    const { token } = await createInvite(ctx, {
      email: newbie.email,
      roles: ["l1_staff"],
      branchIds: [branch._id.toHexString()],
    })
    const m = await acceptInvite(newbie, token)
    await updateMemberAccess(ctx, m._id, {
      roles: ["l2_supervisor"],
      branchIds: [branch._id.toHexString()],
    })
    const list = await listMembers(ctx)
    expect(list.map((x) => [x.email, x.roles[0]])).toEqual([
      ["asha@acme.test", "l2_supervisor"],
      ["owner@acme.test", "org_admin"],
    ])
    const actions = (await listAudit(ctx)).items.map((e) => e.action)
    expect(actions.slice(0, 3)).toEqual(["member.updated", "member.added", "invite.created"])
  })

  it("never removes or deactivates the last org admin", async () => {
    const { ctx } = await setup()
    const [me] = await listMembers(ctx)
    expect(
      await codeOf(updateMemberAccess(ctx, me._id, { roles: ["verifier"], branchIds: [] })),
    ).toBe("CONFLICT")
    expect(await codeOf(setMemberStatus(ctx, me._id, "inactive"))).toBe("CONFLICT")
  })

  it("deactivates a member so they lose access", async () => {
    const { ctx, tenant } = await setup()
    const { token } = await createInvite(ctx, {
      email: newbie.email,
      roles: ["verifier"],
      branchIds: [],
    })
    const m = await acceptInvite(newbie, token)
    await setMemberStatus(ctx, m._id, "inactive")
    expect(await resolveTenantContext(newbie.id, tenant._id)).toBeNull()
  })

  it("isolates branch admins from other branches' members and org-wide invites", async () => {
    const { ctx, tenant, branch } = await setup()
    const branch2 = await createBranch(ctx, { name: "Annex", timezone: "Asia/Kolkata" })

    const invBranchAdmin = await createInvite(ctx, {
      email: "ba@acme.test",
      roles: ["branch_admin"],
      branchIds: [branch._id.toHexString()],
    })
    await acceptInvite(
      { id: "u-ba", email: "ba@acme.test", name: "Branch Admin" },
      invBranchAdmin.token,
    )

    const invOtherStaff = await createInvite(ctx, {
      email: "other@acme.test",
      roles: ["l1_staff"],
      branchIds: [branch2._id.toHexString()],
    })
    const otherStaff = await acceptInvite(
      { id: "u-other-staff", email: "other@acme.test", name: "Other Staff" },
      invOtherStaff.token,
    )

    const orgAdminInvite = await createInvite(ctx, {
      email: "exec@acme.test",
      roles: ["org_admin"],
      branchIds: [],
    })

    const baCtx = (await resolveTenantContext("u-ba", tenant._id))!
    expect((await listMembers(baCtx)).some((m) => m.userId === "u-other-staff")).toBe(false)
    expect((await listInvites(baCtx)).some((i) => i.email === "exec@acme.test")).toBe(false)
    expect(await codeOf(setMemberStatus(baCtx, otherStaff._id, "inactive"))).toBe("FORBIDDEN")
    expect(await codeOf(revokeInvite(baCtx, orgAdminInvite.invite._id))).toBe("FORBIDDEN")
  })
})
