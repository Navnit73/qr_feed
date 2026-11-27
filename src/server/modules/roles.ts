import "server-only"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { assertCan } from "@/server/rbac/ability"
import { isPermission, type Permission } from "@/server/rbac/permissions"
import { invites, members, roles } from "@/server/repositories"
import { isDuplicateKey, name, objectId } from "@/server/validation"

const roleSchema = z.object({
  name: name("role name", 2),
  description: z.string().trim().max(200).optional(),
  scope: z.enum(["tenant", "branch"]).default("branch"),
  permissions: z
    .array(z.string())
    .min(1, "Pick at least one permission")
    .refine((list) => list.every(isPermission), "Unknown permission selected"),
})

const TENANT_ONLY_PERMISSIONS = new Set<Permission>([
  "tenant:manage",
  "billing:manage",
  "branch:manage",
  "role:manage",
  "settings:manage",
  "settings:sla",
])

function assertCanGrantPermissions(
  ctx: TenantContext,
  scope: "tenant" | "branch",
  perms: readonly string[],
) {
  if (scope === "tenant" && ctx.branchScope !== "all") {
    throw new ApiError("FORBIDDEN", "Only organisation-wide admins can create tenant-scoped roles.")
  }
  if (scope === "branch") {
    const disallowed = perms.filter((p) => TENANT_ONLY_PERMISSIONS.has(p as Permission))
    if (disallowed.length > 0) {
      throw new ApiError(
        "VALIDATION",
        `Tenant-wide permissions (${disallowed.join(", ")}) require a tenant-scoped role.`,
        {
          permissions: ["Use tenant scope for organisation-level settings and billing permissions"],
        },
      )
    }
  }
  for (const p of perms) {
    if (!ctx.permissions.has(p as Permission)) {
      throw new ApiError("FORBIDDEN", "You can't put permissions in a role that you don't hold.")
    }
  }
}

export async function listCustomRoles(ctx: TenantContext) {
  assertCan(ctx, "user:read")
  return roles.forTenant(ctx).find({}, { sort: { name: 1 } })
}

export async function createCustomRole(ctx: TenantContext, raw: z.input<typeof roleSchema>) {
  assertCan(ctx, "role:manage")
  const input = parseInput(roleSchema, raw)
  assertCanGrantPermissions(ctx, input.scope, input.permissions)
  const uniquePerms = [...new Set(input.permissions)]

  try {
    return await withTransaction(async (session) => {
      const doc = await roles.forTenant(ctx).insertOne(
        {
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          scope: input.scope,
          permissions: uniquePerms,
        },
        { session },
      )
      await appendAudit(
        ctx,
        {
          action: "role.created",
          entity: "role",
          entityId: doc._id,
          after: { name: doc.name, scope: doc.scope, permissions: doc.permissions },
        },
        { session },
      )
      return doc
    })
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError("CONFLICT", "A role with that name already exists.", {
        name: ["Already exists"],
      })
    }
    throw err
  }
}

export async function updateCustomRole(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof roleSchema>,
) {
  assertCan(ctx, "role:manage")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(roleSchema, raw)
  assertCanGrantPermissions(ctx, input.scope, input.permissions)
  const uniquePerms = [...new Set(input.permissions)]

  const existing = await roles.forTenant(ctx).findById(id)
  if (!existing) throw new ApiError("NOT_FOUND", "Role not found.")
  // You cannot edit a role that currently grants more than you hold either.
  assertCanGrantPermissions(ctx, existing.scope, existing.permissions)

  try {
    return await withTransaction(async (session) => {
      const updated = await roles.forTenant(ctx).updateOne(
        { _id: id },
        {
          $set: {
            name: input.name,
            description: input.description ?? "",
            scope: input.scope,
            permissions: uniquePerms,
          },
        },
        { session },
      )
      await appendAudit(
        ctx,
        {
          action: "role.updated",
          entity: "role",
          entityId: id,
          before: { name: existing.name, scope: existing.scope, permissions: existing.permissions },
          after: { name: input.name, scope: input.scope, permissions: uniquePerms },
        },
        { session },
      )
      return updated!
    })
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError("CONFLICT", "A role with that name already exists.", {
        name: ["Already exists"],
      })
    }
    throw err
  }
}

export async function deleteCustomRole(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "role:manage")
  const id = parseInput(objectId, idRaw)
  const key = `custom:${id.toHexString()}`

  await withTransaction(async (session) => {
    const existing = await roles.forTenant(ctx).findById(id, { session })
    if (!existing) throw new ApiError("NOT_FOUND", "Role not found.")
    assertCanGrantPermissions(ctx, existing.scope, existing.permissions)

    const [inMembers, inInvites] = await Promise.all([
      members.forTenant(ctx).count({ roles: key }, { session }),
      invites
        .forTenant(ctx)
        .count({ roles: key, status: "pending", expiresAt: { $gt: new Date() } }, { session }),
    ])
    if (inMembers > 0) {
      throw new ApiError(
        "CONFLICT",
        "This role is still assigned to members. Change their roles first.",
      )
    }
    if (inInvites > 0) {
      throw new ApiError(
        "CONFLICT",
        "A pending invite still uses this role. Revoke the invite first.",
      )
    }

    await roles.forTenant(ctx).deleteOne({ _id: id }, { session })
    await appendAudit(
      ctx,
      {
        action: "role.deleted",
        entity: "role",
        entityId: id,
        before: { name: existing.name, scope: existing.scope },
      },
      { session },
    )
  })
}
