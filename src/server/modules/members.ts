import "server-only"
import { createHash, randomBytes } from "node:crypto"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { assertWithinLimit, getTenant } from "@/server/modules/tenants"
import type { SessionUser } from "@/server/modules/onboarding"
import { assertCan, canGrantRoles, isKnownRole, type CustomRole } from "@/server/rbac/ability"
import { branches, invites, members, roles as rolesRepo } from "@/server/repositories"
import { isDuplicateKey, objectId } from "@/server/validation"

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const accessSchema = z.object({
  roles: z.array(z.string()).min(1, "Pick at least one role"),
  branchIds: z.array(objectId).default([]),
})
const inviteSchema = accessSchema.extend({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
})

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

async function customRoles(ctx: TenantContext): Promise<CustomRole[]> {
  return rolesRepo.forTenant(ctx).find({})
}

/** Shared by invite and role edits: roles exist, aren't an escalation, branches are reachable. */
async function validateAccess(
  ctx: TenantContext,
  access: { roles: string[]; branchIds: ObjectId[] },
) {
  const custom = await customRoles(ctx)
  const unknown = access.roles.filter((r) => !isKnownRole(r, custom))
  if (unknown.length) {
    throw new ApiError("VALIDATION", "Unknown role.", {
      roles: [`Unknown role: ${unknown.join(", ")}`],
    })
  }
  if (!canGrantRoles(ctx, access.roles, custom)) {
    throw new ApiError("FORBIDDEN", "You can't give someone more access than you have.")
  }
  for (const id of access.branchIds) {
    if (!inBranchScope(ctx.branchScope, id)) {
      throw new ApiError("FORBIDDEN", "You can't add people to a branch you can't access.")
    }
  }
  const found = await branches
    .forTenant(ctx)
    .count({ _id: { $in: access.branchIds }, status: "active" })
  if (found !== access.branchIds.length) {
    throw new ApiError("VALIDATION", "Unknown branch.", { branchIds: ["Pick existing branches"] })
  }
  return custom
}

// ── Invites ──────────────────────────────────────────────────────────────────────────

export async function createInvite(ctx: TenantContext, raw: z.input<typeof inviteSchema>) {
  assertCan(ctx, "user:invite")
  const input = parseInput(inviteSchema, raw)
  await validateAccess(ctx, input)

  if (await members.forTenant(ctx).findOne({ email: input.email })) {
    throw new ApiError("CONFLICT", "That person is already a member.", {
      email: ["Already a member"],
    })
  }
  if (
    await invites
      .forTenant(ctx)
      .findOne({ email: input.email, status: "pending", expiresAt: { $gt: new Date() } })
  ) {
    throw new ApiError("CONFLICT", "There's already a pending invite for that email.", {
      email: ["Already invited"],
    })
  }

  // Pending invites count towards the seat limit, so a burst of invites can't overshoot it.
  const seats =
    (await members.forTenant(ctx).count({ status: "active" })) +
    (await invites.forTenant(ctx).count({ status: "pending", expiresAt: { $gt: new Date() } }))
  await assertWithinLimit(ctx, "users", seats)

  const token = randomBytes(32).toString("base64url")
  const invite = await withTransaction(async (session) => {
    const doc = await invites.forTenant(ctx).insertOne(
      {
        email: input.email,
        roles: input.roles,
        branchIds: input.branchIds,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: ctx.actorId,
        status: "pending",
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "invite.created",
        entity: "invite",
        entityId: doc._id,
        after: { email: doc.email, roles: doc.roles, branchIds: doc.branchIds },
      },
      { session },
    )
    return doc
  })
  return { invite, token }
}

export async function listInvites(ctx: TenantContext) {
  assertCan(ctx, "user:read")
  return invites
    .forTenant(ctx)
    .find({ status: "pending", expiresAt: { $gt: new Date() } }, { sort: { createdAt: -1 } })
}

export async function revokeInvite(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "user:invite")
  const id = parseInput(objectId, idRaw)
  await withTransaction(async (session) => {
    const updated = await invites
      .forTenant(ctx)
      .updateOne({ _id: id, status: "pending" }, { $set: { status: "revoked" } }, { session })
    if (!updated) throw new ApiError("NOT_FOUND", "Invite not found.")
    await appendAudit(
      ctx,
      {
        action: "invite.revoked",
        entity: "invite",
        entityId: id,
        before: { email: updated.email },
      },
      { session },
    )
  })
}

/** The token resolves the tenant, like a QR code does, so this lookup is deliberately global. */
export async function findPendingInvite(token: string) {
  const invite = await invites
    .unscoped()
    .findOne({ tokenHash: hashToken(token), status: "pending", expiresAt: { $gt: new Date() } })
  if (!invite) throw new ApiError("NOT_FOUND", "This invite link is invalid or has expired.")
  const tenant = await getTenant(invite.tenantId)
  if (!tenant || tenant.status !== "active") {
    throw new ApiError("NOT_FOUND", "This invite link is invalid or has expired.")
  }
  return { invite, tenant }
}

export async function acceptInvite(user: SessionUser, token: string) {
  const { invite } = await findPendingInvite(token)
  if (invite.email !== user.email.toLowerCase()) {
    throw new ApiError("FORBIDDEN", `This invite is for ${invite.email}. Sign in with that email.`)
  }
  const ctx: TenantContext = {
    tenantId: invite.tenantId,
    actorId: user.id,
    roles: invite.roles,
    permissions: new Set(),
    branchScope: "all",
  }
  try {
    return await withTransaction(async (session) => {
      const claimed = await invites
        .forTenant(ctx)
        .updateOne(
          { _id: invite._id, status: "pending" },
          { $set: { status: "accepted" } },
          { session },
        )
      if (!claimed) throw new ApiError("NOT_FOUND", "This invite has already been used.")
      const member = await members.forTenant(ctx).insertOne(
        {
          userId: user.id,
          email: invite.email,
          name: user.name,
          roles: invite.roles,
          branchIds: invite.branchIds,
          status: "active",
        },
        { session },
      )
      await appendAudit(
        ctx,
        {
          action: "member.added",
          entity: "member",
          entityId: member._id,
          after: { email: member.email, roles: member.roles, via: "invite" },
        },
        { session },
      )
      return member
    })
  } catch (err) {
    if (isDuplicateKey(err))
      throw new ApiError("CONFLICT", "You're already a member of this organisation.")
    throw err
  }
}

// ── Members ──────────────────────────────────────────────────────────────────────────

export async function listMembers(ctx: TenantContext) {
  assertCan(ctx, "user:read")
  return members.forTenant(ctx).find({}, { sort: { email: 1 } })
}

async function assertNotLastAdmin(
  ctx: TenantContext,
  member: { _id: ObjectId; roles: string[] },
  session: import("mongodb").ClientSession,
) {
  if (!member.roles.includes("org_admin")) return
  const admins = await members
    .forTenant(ctx)
    .count({ roles: "org_admin", status: "active", _id: { $ne: member._id } }, { session })
  if (admins === 0) {
    throw new ApiError("CONFLICT", "Every organisation needs at least one active org admin.")
  }
}

async function loadMember(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "user:manage")
  const id = parseInput(objectId, idRaw)
  const member = await members.forTenant(ctx).findById(id)
  if (!member) throw new ApiError("NOT_FOUND", "Member not found.")
  // Editing someone is as powerful as granting their roles, so the same rule applies.
  if (!canGrantRoles(ctx, member.roles, await customRoles(ctx))) {
    throw new ApiError("FORBIDDEN", "You can't change someone with more access than you.")
  }
  return member
}

export async function updateMemberAccess(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof accessSchema>,
) {
  const member = await loadMember(ctx, idRaw)
  const input = parseInput(accessSchema, raw)
  await validateAccess(ctx, input)
  return withTransaction(async (session) => {
    if (!input.roles.includes("org_admin")) await assertNotLastAdmin(ctx, member, session)
    const updated = await members
      .forTenant(ctx)
      .updateOne(
        { _id: member._id },
        { $set: { roles: input.roles, branchIds: input.branchIds } },
        { session },
      )
    await appendAudit(
      ctx,
      {
        action: "member.updated",
        entity: "member",
        entityId: member._id,
        before: { roles: member.roles, branchIds: member.branchIds },
        after: { roles: input.roles, branchIds: input.branchIds },
      },
      { session },
    )
    return updated!
  })
}

export async function setMemberStatus(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  status: "active" | "inactive",
) {
  const member = await loadMember(ctx, idRaw)
  if (member.status === status) return member
  if (status === "inactive" && member.userId === ctx.actorId) {
    throw new ApiError("CONFLICT", "You can't deactivate yourself.")
  }
  return withTransaction(async (session) => {
    if (status === "inactive") await assertNotLastAdmin(ctx, member, session)
    const updated = await members
      .forTenant(ctx)
      .updateOne({ _id: member._id }, { $set: { status } }, { session })
    await appendAudit(
      ctx,
      {
        action: status === "inactive" ? "member.deactivated" : "member.reactivated",
        entity: "member",
        entityId: member._id,
        before: { status: member.status },
        after: { status },
      },
      { session },
    )
    return updated!
  })
}
