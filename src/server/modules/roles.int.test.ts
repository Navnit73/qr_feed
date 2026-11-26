import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { verifyChain } from "@/server/audit/audit-log"
import { createInvite } from "@/server/modules/members"
import {
  createCustomRole,
  deleteCustomRole,
  listCustomRoles,
  updateCustomRole,
} from "@/server/modules/roles"
import { resolveAccess } from "@/server/rbac/ability"
import { branches, members } from "@/server/repositories"
import { setupTestDb, testContext } from "@/test/db"

setupTestDb()

describe("custom roles (F-1.4 / T-ROLE-1)", () => {
  it("creates, updates and deletes custom roles with audit logging", async () => {
    const ctx = testContext()
    const created = await createCustomRole(ctx, {
      name: "Night Desk",
      description: "Handles night tickets",
      scope: "branch",
      permissions: ["ticket:read", "ticket:accept", "ticket:work"],
    })
    expect(created.name).toBe("Night Desk")
    expect(await listCustomRoles(ctx)).toHaveLength(1)

    const updated = await updateCustomRole(ctx, created._id, {
      name: "Night Shift Lead",
      scope: "branch",
      permissions: ["ticket:read", "ticket:accept", "ticket:work", "ticket:assign"],
    })
    expect(updated.name).toBe("Night Shift Lead")
    expect(updated.permissions).toContain("ticket:assign")

    await deleteCustomRole(ctx, created._id)
    expect(await listCustomRoles(ctx)).toHaveLength(0)

    const chain = await verifyChain(ctx)
    expect(chain.ok).toBe(true)
    expect(chain.count).toBe(3)
  })

  it("blocks privilege escalation when creating a custom role", async () => {
    const tenantId = new ObjectId()
    const limitedCtx = testContext({
      tenantId,
      permissions: new Set(["role:manage", "ticket:read"]),
      branchScope: "all",
    })
    await expect(
      createCustomRole(limitedCtx, {
        name: "Sneaky Admin",
        scope: "tenant",
        permissions: ["ticket:read", "tenant:manage"],
      }),
    ).rejects.toThrow(ApiError)
  })

  it("prevents deleting a custom role still assigned to a member or pending invite", async () => {
    const ctx = testContext()
    const branch = await branches
      .forTenant(ctx)
      .insertOne({ name: "Main", timezone: "UTC", status: "active" })
    const role = await createCustomRole(ctx, {
      name: "Floor Watcher",
      scope: "branch",
      permissions: ["ticket:read"],
    })
    const roleKey = `custom:${role._id.toHexString()}`

    await members.forTenant(ctx).insertOne({
      userId: "u-custom",
      email: "watcher@example.com",
      name: "Watcher",
      roles: [roleKey],
      branchIds: [branch._id],
      status: "active",
    })

    await expect(deleteCustomRole(ctx, role._id)).rejects.toThrow(/assigned/i)

    // Remove from member and test pending invite guard too
    await members
      .forTenant(ctx)
      .updateOne({ userId: "u-custom" }, { $set: { roles: ["l1_staff"] } })
    // Ensure a tenant exists for assertWithinLimit inside createInvite
    const { tenantsCollection, TRIAL_LIMITS } = await import("@/server/modules/tenants")
    await tenantsCollection().insertOne({
      _id: ctx.tenantId,
      name: "Test Org",
      slug: `org-${ctx.tenantId.toHexString()}`,
      industry: "hotel",
      plan: "trial",
      status: "active",
      limits: TRIAL_LIMITS,
      createdBy: ctx.actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await createInvite(ctx, {
      email: "pending@example.com",
      roles: [roleKey],
      branchIds: [branch._id.toHexString()],
    })
    await expect(deleteCustomRole(ctx, role._id)).rejects.toThrow(/invite/i)
  })

  it("resolves permissions for a custom role via resolveAccess", async () => {
    const ctx = testContext()
    const role = await createCustomRole(ctx, {
      name: "Quality Spotter",
      scope: "tenant",
      permissions: ["ticket:read", "rca:read"],
    })
    const access = resolveAccess({ roles: [`custom:${role._id.toHexString()}`], branchIds: [] }, [
      role,
    ])
    expect(access.permissions.has("rca:read")).toBe(true)
    expect(access.permissions.has("ticket:close")).toBe(false)
    expect(access.branchScope).toBe("all")
  })
})
