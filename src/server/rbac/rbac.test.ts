// @vitest-environment node
import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { assertCan, can, canGrantRoles, resolveAccess } from "@/server/rbac/ability"
import { ALL_PERMISSIONS, SYSTEM_ROLES, isPermission } from "@/server/rbac/permissions"
import { testContext } from "@/test/db"

const b1 = new ObjectId()
const b2 = new ObjectId()

describe("system roles", () => {
  it("only reference real permissions", () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const p of role.permissions) expect(isPermission(p), p).toBe(true)
    }
  })

  it("give the org admin every permission across the tenant", () => {
    const access = resolveAccess({ roles: ["org_admin"], branchIds: [] }, [])
    expect([...access.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect(access.branchScope).toBe("all")
  })

  it("keep L1 staff to working tickets in their branches", () => {
    const access = resolveAccess({ roles: ["l1_staff"], branchIds: [b1] }, [])
    expect(access.permissions.has("ticket:accept")).toBe(true)
    expect(access.permissions.has("user:invite")).toBe(false)
    expect(access.permissions.has("ticket:verify")).toBe(false)
    expect(access.branchScope).toEqual([b1])
  })
})

describe("resolveAccess()", () => {
  it("unions permissions across roles", () => {
    const access = resolveAccess({ roles: ["l1_staff", "verifier"], branchIds: [b1] }, [])
    expect(access.permissions.has("ticket:accept")).toBe(true)
    expect(access.permissions.has("ticket:verify")).toBe(true)
  })

  it("includes custom roles and ignores unknown ones", () => {
    const custom = { _id: new ObjectId(), permissions: ["report:export"], scope: "branch" as const }
    const access = resolveAccess(
      { roles: [`custom:${custom._id.toHexString()}`, "made_up"], branchIds: [b1] },
      [custom],
    )
    expect([...access.permissions]).toEqual(["report:export"])
  })

  it("widens to every branch when any role is tenant-wide", () => {
    expect(resolveAccess({ roles: ["l1_staff", "auditor"], branchIds: [b1] }, []).branchScope).toBe(
      "all",
    )
  })
})

describe("can() and assertCan()", () => {
  const staff = testContext({
    roles: ["l1_staff"],
    permissions: new Set(["ticket:read", "ticket:accept"]),
    branchScope: [b1],
  })

  it("checks the permission", () => {
    expect(can(staff, "ticket:accept")).toBe(true)
    expect(can(staff, "user:invite")).toBe(false)
  })

  it("checks the branch when one is given", () => {
    expect(can(staff, "ticket:accept", { branchId: b1 })).toBe(true)
    expect(can(staff, "ticket:accept", { branchId: b2 })).toBe(false)
  })

  it("throws FORBIDDEN when not allowed", () => {
    expect(() => assertCan(staff, "user:invite")).toThrow(ApiError)
    try {
      assertCan(staff, "ticket:accept", { branchId: b2 })
    } catch (e) {
      expect((e as ApiError).code).toBe("FORBIDDEN")
    }
  })
})

describe("canGrantRoles()", () => {
  it("stops anyone granting more than they hold", () => {
    const branchAdmin = resolveAccess({ roles: ["branch_admin"], branchIds: [b1] }, [])
    const ctx = testContext({ ...branchAdmin, roles: ["branch_admin"] })
    expect(canGrantRoles(ctx, ["l1_staff"], [])).toBe(true)
    expect(canGrantRoles(ctx, ["org_admin"], [])).toBe(false)
  })
})
