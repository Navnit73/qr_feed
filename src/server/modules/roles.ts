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

function assertCanGrantPermissions(
  ctx: TenantContext,
  scope: "tenant" | "branch",
  perms: readonly string[],
) {
  if (scope === "tenant" && ctx.branchScope !== "all") {
    throw new ApiError("FORBIDDEN", "Only organisation-wide admins can create tenant-scoped roles.")
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
  const existing = await roles.forTenant(ctx).findById(id)
  if (!existing) throw new ApiError("NOT_FOUND", "Role not found.")
  assertCanGrantPermissions(ctx, existing.scope, existing.permissions)

  const key = `custom:${id.toHexString()}`
  const [inMembers, inInvites] = await Promise.all([
    members.forTenant(ctx).count({ roles: key }),
    invites.forTenant(ctx).count({ roles: key, status: "pending", expiresAt: { $gt: new Date() } }),
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

  await withTransaction(async (session) => {
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
