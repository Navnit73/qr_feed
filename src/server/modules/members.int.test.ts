import { describe, expect, it } from "vitest"
import type { ApiError } from "@/lib/api/errors"
import { listAudit } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import {
  acceptInvite,
  createInvite,
  createMemberWithPassword,
  type IdentityProvider,
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

/** Stands in for Better Auth so the service can be tested without auth env vars. */
function fakeIdentity(existingEmails: string[] = []) {
  const created: { id: string; email: string; name: string; password: string }[] = []
  const deleted: string[] = []
  const identity: IdentityProvider = {
    async createPasswordUser(input) {
      if (existingEmails.includes(input.email)) {
        const { ApiError } = await import("@/lib/api/errors")
        throw new ApiError("CONFLICT", "That email already has an account.", {
          email: ["Already has an account"],
        })
      }
      const id = `user-${created.length + 1}`
      created.push({ id, ...input })
      return { id }
    },
    async deleteUser(id) {
      deleted.push(id)
    },
  }
  return { identity, created, deleted }
}

describe("create a user with a password", () => {
  it("creates the sign-in account and an active membership with menu access", async () => {
    const { ctx, tenant, branch } = await setup()
    const { identity, created } = fakeIdentity()
    const member = await createMemberWithPassword(
      ctx,
      {
        name: "Ravi",
        email: "Ravi@Acme.test",
        password: "correct-horse-battery",
        roles: ["l1_staff"],
        branchIds: [branch._id.toHexString()],
        menus: ["tickets", "my-work"],
      },
      identity,
    )
    expect(created).toEqual([
      { id: "user-1", name: "Ravi", email: "ravi@acme.test", password: "correct-horse-battery" },
    ])
    expect(member.userId).toBe("user-1")
    expect(member.menus).toEqual(["tickets", "my-work"])

    const staff = await resolveTenantContext("user-1", tenant._id)
    expect(staff?.menus && [...staff.menus]).toEqual(["tickets", "my-work"])
    expect((await listAudit(ctx)).items[0].action).toBe("member.created")
  })

  it("stores 'all menus' as no restriction", async () => {
    const { ctx, tenant } = await setup()
    const { identity } = fakeIdentity()
    await createMemberWithPassword(
      ctx,
      { name: "V", email: "v@x.test", password: "long-enough-pw", roles: ["verifier"] },
      identity,
    )
    expect((await resolveTenantContext("user-1", tenant._id))?.menus).toBeNull()
  })

  it("validates the password and blocks existing members, existing accounts and escalation", async () => {
    const { ctx, tenant, branch } = await setup()
    const { identity, created } = fakeIdentity(["taken@x.test"])
    const base = { name: "X", password: "long-enough-pw", roles: ["verifier"] }
    expect(
      await codeOf(
        createMemberWithPassword(ctx, { ...base, email: "a@x.test", password: "short" }, identity),
      ),
    ).toBe("VALIDATION")
    expect(
      await codeOf(createMemberWithPassword(ctx, { ...base, email: owner.email }, identity)),
    ).toBe("CONFLICT")
    expect(
      await codeOf(createMemberWithPassword(ctx, { ...base, email: "taken@x.test" }, identity)),
    ).toBe("CONFLICT")

    const branchAdmin = testContext({
      tenantId: tenant._id,
      roles: ["branch_admin"],
      ...resolveAccess({ roles: ["branch_admin"], branchIds: [branch._id] }, []),
    })
    expect(
      await codeOf(
        createMemberWithPassword(
          branchAdmin,
          { ...base, email: "evil@x.test", roles: ["org_admin"] },
          identity,
        ),
      ),
    ).toBe("FORBIDDEN")
    expect(created).toEqual([])
  })

  it("removes the new account again if the membership can't be saved", async () => {
    const { ctx, tenant } = await setup()
    const { identity, created, deleted } = fakeIdentity()
    // Another admin adds the same person while the account is being created.
    const racing: IdentityProvider = {
      ...identity,
      async createPasswordUser(input) {
        const res = await identity.createPasswordUser(input)
        await db()
          .collection("members")
          .insertOne({
            tenantId: tenant._id,
            userId: "someone-else",
            email: input.email,
            name: "Race",
            roles: ["verifier"],
            branchIds: [],
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        return res
      },
    }
    expect(
      await codeOf(
        createMemberWithPassword(
          ctx,
          { name: "Y", email: "y@x.test", password: "long-enough-pw", roles: ["verifier"] },
          racing,
        ),
      ),
    ).toBe("CONFLICT")
    expect(created).toHaveLength(1)
    expect(deleted).toEqual(["user-1"])
  })
})

describe("menu access", () => {
  it("carries menus from an invite to the member and lets admins change them", async () => {
    const { ctx, tenant } = await setup()
    const { token } = await createInvite(ctx, {
      email: newbie.email,
      roles: ["verifier"],
      branchIds: [],
      menus: ["verifications"],
    })
    const m = await acceptInvite(newbie, token)
    expect(m.menus).toEqual(["verifications"])

    await updateMemberAccess(ctx, m._id, {
      roles: ["verifier"],
      branchIds: [],
      menus: ["verifications", "tickets"],
    })
    const after = await resolveTenantContext(newbie.id, tenant._id)
    expect(after?.menus && [...after.menus].sort()).toEqual(["tickets", "verifications"])

    // Leaving menus out of an update keeps what they had.
    await updateMemberAccess(ctx, m._id, { roles: ["verifier"], branchIds: [] })
    expect((await resolveTenantContext(newbie.id, tenant._id))?.menus?.size).toBe(2)
  })
})
