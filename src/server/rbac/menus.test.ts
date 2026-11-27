// @vitest-environment node
import { ObjectId } from "mongodb"
import { describe, expect, it } from "vitest"
import type { TenantContext } from "@/server/db/tenant-context"
import { resolveAccess } from "@/server/rbac/ability"
import {
  canSeePath,
  CONFIGURABLE_MENUS,
  menuForPath,
  normalizeMenus,
  visibleMenus,
} from "@/server/rbac/menus"

function ctxFor(roles: string[], menus?: string[] | null): TenantContext {
  const access = resolveAccess({ roles, branchIds: [] }, [])
  return {
    tenantId: new ObjectId(),
    actorId: "u1",
    roles,
    permissions: access.permissions,
    branchScope: access.branchScope,
    menus: menus ? new Set(menus) : null,
  }
}

const keys = (ctx: TenantContext) => visibleMenus(ctx).map((m) => m.key)

describe("menu access", () => {
  it("shows every menu the roles allow when there is no restriction", () => {
    const all = keys(ctxFor(["org_admin"]))
    expect(all).toEqual(["dashboard", ...CONFIGURABLE_MENUS.map((m) => m.key)])
  })

  it("still hides menus the roles don't allow, whatever the menu list says", () => {
    const staff = keys(ctxFor(["l1_staff"], ["tickets", "users", "settings"]))
    expect(staff).toEqual(["dashboard", "tickets"])
  })

  it("narrows the sidebar to the chosen menus, always keeping Dashboard", () => {
    expect(keys(ctxFor(["org_admin"], ["tickets", "reports"]))).toEqual([
      "dashboard",
      "tickets",
      "reports",
    ])
    expect(keys(ctxFor(["org_admin"], []))).toEqual(["dashboard"])
  })

  it("maps nested paths to their menu", () => {
    expect(menuForPath("/tickets/abc")?.key).toBe("tickets")
    expect(menuForPath("/my-work")?.key).toBe("my-work")
    expect(menuForPath("/settings/billing")?.key).toBe("settings")
    expect(menuForPath("/print/qr/1")).toBeUndefined()
    expect(menuForPath("/ticketsx")).toBeUndefined()
  })

  it("blocks pages of hidden menus but leaves personal and unlisted pages open", () => {
    const ctx = ctxFor(["org_admin"], ["tickets"])
    expect(canSeePath(ctx, "/tickets/abc")).toBe(true)
    expect(canSeePath(ctx, "/dashboard")).toBe(true)
    expect(canSeePath(ctx, "/reports")).toBe(false)
    expect(canSeePath(ctx, "/settings/billing")).toBe(false)
    expect(canSeePath(ctx, "/settings/notifications")).toBe(true)
    expect(canSeePath(ctx, "/notifications")).toBe(true)
    expect(canSeePath(ctxFor(["org_admin"]), "/reports")).toBe(true)
  })

  it("stores 'every menu' as no restriction, so new menus appear for them later", () => {
    expect(normalizeMenus(undefined)).toBeUndefined()
    expect(normalizeMenus(null)).toBeNull()
    expect(normalizeMenus(CONFIGURABLE_MENUS.map((m) => m.key))).toBeNull()
    expect(normalizeMenus(["reports", "tickets", "tickets"])).toEqual(["tickets", "reports"])
  })
})
