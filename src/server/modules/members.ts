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
import { assertWithinLimit, getTenant, tenantsCollection } from "@/server/modules/tenants"
import type { SessionUser } from "@/server/modules/onboarding"
import { assertCan, canGrantRoles, isKnownRole, type CustomRole } from "@/server/rbac/ability"
import { renderEmail, type EmailContent } from "@/server/email-template"
import { sendMail } from "@/server/mail"
import { notifyUser } from "@/server/modules/notifications"
import { roleLabel } from "@/server/rbac/labels"
import { CONFIGURABLE_MENUS, MENU_KEYS, normalizeMenus } from "@/server/rbac/menus"
import { appUrl } from "@/server/public-url"
import { branches, invites, members, roles as rolesRepo } from "@/server/repositories"
import { isDuplicateKey, objectId } from "@/server/validation"

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const accessSchema = z.object({
  roles: z.array(z.string()).min(1, "Pick at least one role"),
  branchIds: z.array(objectId).default([]),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Omitted = unchanged (edits) or every menu (new people); see `normalizeMenus`. */
  menus: z.array(z.enum(MENU_KEYS, { error: "Unknown menu" })).nullish(),
})
const inviteSchema = accessSchema.extend({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
})
// Better Auth's own limits (auth.ts): 10–128 characters.
const passwordUserSchema = inviteSchema.extend({
  name: z.string().trim().min(1, "Enter their name").max(100),
  password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
})

/**
 * Creates and removes sign-in accounts. Better Auth in the app (`@/server/auth/accounts`), a
 * fake in tests, so this module stays testable without auth secrets.
 */
export type IdentityProvider = {
  /** Throws `ApiError("CONFLICT")` with an `email` field error when the email is taken. */
  createPasswordUser(input: { name: string; email: string; password: string }): Promise<{
    id: string
  }>
  deleteUser(id: string): Promise<void>
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

async function customRoles(ctx: TenantContext): Promise<CustomRole[]> {
  return rolesRepo.forTenant(ctx).find({})
}

function dedupeObjectIds(ids: ObjectId[]): ObjectId[] {
  const seen = new Set<string>()
  const out: ObjectId[] = []
  for (const id of ids) {
    const hex = id.toHexString()
    if (!seen.has(hex)) {
      seen.add(hex)
      out.push(id)
    }
  }
  return out
}

function assertTargetBranchesInScope(ctx: TenantContext, targetBranchIds: ObjectId[]) {
  if (ctx.branchScope === "all") return
  if (
    targetBranchIds.length === 0 ||
    !targetBranchIds.every((id) => inBranchScope(ctx.branchScope, id))
  ) {
    throw new ApiError("FORBIDDEN", "You can't manage people outside your assigned branches.")
  }
}

/** Shared by invite and role edits: roles exist, aren't an escalation, branches are reachable. */
async function validateAccess(
  ctx: TenantContext,
  access: { roles: string[]; branchIds: ObjectId[] },
) {
  const roles = [...new Set(access.roles)]
  const branchIds = dedupeObjectIds(access.branchIds)
  const custom = await customRoles(ctx)
  const unknown = roles.filter((r) => !isKnownRole(r, custom))
  if (unknown.length) {
    throw new ApiError("VALIDATION", "Unknown role.", {
      roles: [`Unknown role: ${unknown.join(", ")}`],
    })
  }
  if (!canGrantRoles(ctx, roles, custom)) {
    throw new ApiError("FORBIDDEN", "You can't give someone more access than you have.")
  }
  if (ctx.branchScope !== "all" && branchIds.length === 0) {
    throw new ApiError("VALIDATION", "Pick at least one branch.", {
      branchIds: ["Pick at least one of your branches"],
    })
  }
  for (const id of branchIds) {
    if (!inBranchScope(ctx.branchScope, id)) {
      throw new ApiError("FORBIDDEN", "You can't add people to a branch you can't access.")
    }
  }
  if (branchIds.length > 0) {
    const found = await branches.forTenant(ctx).count({ _id: { $in: branchIds }, status: "active" })
    if (found !== branchIds.length) {
      throw new ApiError("VALIDATION", "Unknown branch.", { branchIds: ["Pick existing branches"] })
    }
  }
  return { custom, roles, branchIds }
}

// ── Account emails ───────────────────────────────────────────────────────────────────
// Sent whatever the person's alert settings are: they are about their own access.

async function accountEmailContext(ctx: TenantContext) {
  const [tenant, actor, custom] = await Promise.all([
    getTenant(ctx.tenantId),
    members.forTenant(ctx).findOne({ userId: ctx.actorId }, { projection: { name: 1 } }),
    rolesRepo.forTenant(ctx).find({}, { projection: { name: 1 } }),
  ])
  const customNames = new Map(custom.map((r) => [r._id.toHexString(), r.name]))
  return {
    org: tenant?.name ?? "your organisation",
    actor: actor?.name ?? "An administrator",
    roles: (keys: string[]) => keys.map((k) => roleLabel(k, customNames)).join(", ") || "None",
  }
}

async function branchNames(ctx: TenantContext, ids: ObjectId[]) {
  if (!ids.length) return "All branches their roles allow"
  const docs = await branches
    .forTenant({ ...ctx, branchScope: "all" })
    .find({ _id: { $in: ids } }, { projection: { name: 1 } })
  return docs.map((b) => b.name).join(", ")
}

function menuSummary(menus: string[] | null | undefined) {
  if (!menus) return "All menus their roles allow"
  const labels = new Map<string, string>(CONFIGURABLE_MENUS.map((m) => [m.key, m.label]))
  return ["Dashboard", ...menus.map((k) => labels.get(k) ?? k)].join(", ")
}

function sendAccountEmail(to: string, subject: string, content: EmailContent) {
  return sendMail({ to, subject, ...renderEmail(content) }).catch(() => undefined)
}

/** The invite email; the raw token only exists in this link. */
export async function inviteEmail(
  ctx: TenantContext,
  invite: { email: string; roles: string[] },
  link: string,
) {
  const e = await accountEmailContext(ctx)
  return sendAccountEmail(invite.email, `You're invited to ${e.org}`, {
    brand: e.org,
    preheader: `${e.actor} invited you to ${e.org} on QR Feed.`,
    heading: `Join ${e.org} on QR Feed`,
    intro: [
      `${e.actor} invited you to work on ${e.org}'s feedback and tickets in QR Feed.`,
      "Accept the invite to create your account or sign in. The link works once and expires in 7 days.",
    ],
    details: [["Role", e.roles(invite.roles)]],
    cta: { label: "Accept invite", url: link },
    footnote: "Not expecting this? You can ignore it; nothing happens unless you accept.",
  })
}

// ── Invites ──────────────────────────────────────────────────────────────────────────

export async function createInvite(ctx: TenantContext, raw: z.input<typeof inviteSchema>) {
  assertCan(ctx, "user:invite")
  const input = parseInput(inviteSchema, raw)
  const { roles, branchIds } = await validateAccess(ctx, input)

  const token = randomBytes(32).toString("base64url")
  const invite = await withTransaction(async (session) => {
    const now = new Date()
    if (await members.forTenant(ctx).findOne({ email: input.email }, { session })) {
      throw new ApiError("CONFLICT", "That person is already a member.", {
        email: ["Already a member"],
      })
    }
    if (
      await invites
        .forTenant(ctx)
        .findOne({ email: input.email, status: "pending", expiresAt: { $gt: now } }, { session })
    ) {
      throw new ApiError("CONFLICT", "There's already a pending invite for that email.", {
        email: ["Already invited"],
      })
    }

    // Pending invites count towards the seat limit, so a burst of invites can't overshoot it.
    const seats =
      (await members.forTenant(ctx).count({ status: "active" }, { session })) +
      (await invites
        .forTenant(ctx)
        .count({ status: "pending", expiresAt: { $gt: now } }, { session }))
    await assertWithinLimit(ctx, "users", seats, session)

    const doc = await invites.forTenant(ctx).insertOne(
      {
        email: input.email,
        roles,
        branchIds,
        menus: normalizeMenus(input.menus) ?? null,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
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
        after: {
          email: doc.email,
          roles: doc.roles,
          branchIds: doc.branchIds,
          menus: doc.menus ?? null,
        },
      },
      { session },
    )
    return doc
  })
  return { invite, token }
}

export async function listInvites(ctx: TenantContext) {
  assertCan(ctx, "user:read")
  const filter: Record<string, unknown> = { status: "pending", expiresAt: { $gt: new Date() } }
  if (ctx.branchScope !== "all") {
    filter.branchIds = { $in: ctx.branchScope }
  }
  return invites.forTenant(ctx).find(filter, { sort: { createdAt: -1 } })
}

export async function revokeInvite(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "user:invite")
  const id = parseInput(objectId, idRaw)
  const custom = await customRoles(ctx)
  await withTransaction(async (session) => {
    const existing = await invites
      .forTenant(ctx)
      .findOne({ _id: id, status: "pending" }, { session })
    if (!existing) throw new ApiError("NOT_FOUND", "Invite not found.")
    if (!canGrantRoles(ctx, existing.roles, custom)) {
      throw new ApiError("FORBIDDEN", "You can't revoke an invite with more access than you have.")
    }
    assertTargetBranchesInScope(ctx, existing.branchIds)

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
          menus: invite.menus ?? null,
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

// ── Direct creation (admin sets the password) ───────────────────────────────────────

/** Seats = active members + live invites, like `createInvite`, so neither path can overshoot. */
async function usedSeats(ctx: TenantContext, session?: import("mongodb").ClientSession) {
  const now = new Date()
  return (
    (await members.forTenant(ctx).count({ status: "active" }, { session })) +
    (await invites
      .forTenant(ctx)
      .count({ status: "pending", expiresAt: { $gt: now } }, { session }))
  )
}

async function assertEmailFree(
  ctx: TenantContext,
  email: string,
  session?: import("mongodb").ClientSession,
) {
  if (await members.forTenant(ctx).findOne({ email }, { session })) {
    throw new ApiError("CONFLICT", "That person is already a member.", {
      email: ["Already a member"],
    })
  }
  if (
    await invites
      .forTenant(ctx)
      .findOne({ email, status: "pending", expiresAt: { $gt: new Date() } }, { session })
  ) {
    throw new ApiError("CONFLICT", "There's a pending invite for that email. Revoke it first.", {
      email: ["Already invited"],
    })
  }
}

/**
 * Adds someone with a password the admin sets, instead of an invite link. Same rules as an
 * invite (no escalation, branch scope, seat limit), and the sign-in account is removed again
 * if the membership can't be saved, so no orphan logins are left behind.
 */
export async function createMemberWithPassword(
  ctx: TenantContext,
  raw: z.input<typeof passwordUserSchema>,
  identity: IdentityProvider,
) {
  assertCan(ctx, "user:invite")
  const input = parseInput(passwordUserSchema, raw)
  const { roles, branchIds } = await validateAccess(ctx, input)
  // Cheap checks first, so a doomed request never creates an account.
  await assertEmailFree(ctx, input.email)
  await assertWithinLimit(ctx, "users", await usedSeats(ctx))

  const user = await identity.createPasswordUser({
    name: input.name,
    email: input.email,
    password: input.password,
  })
  let created
  try {
    created = await withTransaction(async (session) => {
      await assertEmailFree(ctx, input.email, session)
      await assertWithinLimit(ctx, "users", await usedSeats(ctx, session), session)
      const member = await members.forTenant(ctx).insertOne(
        {
          userId: user.id,
          email: input.email,
          name: input.name,
          ...(input.phone ? { phone: input.phone } : {}),
          roles,
          branchIds,
          menus: normalizeMenus(input.menus) ?? null,
          status: "active",
        },
        { session },
      )
      await appendAudit(
        ctx,
        {
          action: "member.created",
          entity: "member",
          entityId: member._id,
          // Never the password, not even hashed.
          after: {
            email: member.email,
            roles: member.roles,
            branchIds: member.branchIds,
            menus: member.menus,
            via: "password",
          },
        },
        { session },
      )
      return member
    })
  } catch (err) {
    await identity.deleteUser(user.id).catch(() => {})
    if (isDuplicateKey(err)) {
      throw new ApiError("CONFLICT", "That person is already a member.", {
        email: ["Already a member"],
      })
    }
    throw err
  }

  // Never include the password: the admin shares it out of band.
  const e = await accountEmailContext(ctx)
  await sendAccountEmail(created.email, `You've been added to ${e.org}`, {
    brand: e.org,
    preheader: `${e.actor} created a QR Feed account for you.`,
    heading: `Welcome to ${e.org}`,
    intro: [
      `${e.actor} created a QR Feed account for you in ${e.org}.`,
      "Sign in with this email address and the password they share with you. You can set your own any time with \u201cForgot password\u201d on the sign-in page.",
    ],
    details: [
      ["Email", created.email],
      ["Role", e.roles(created.roles)],
      ["Branches", await branchNames(ctx, created.branchIds)],
      ["Menus", menuSummary(created.menus)],
    ],
    cta: { label: "Sign in", url: appUrl("/sign-in") },
  })
  return created
}

// ── Members ──────────────────────────────────────────────────────────────────────────

export async function listMembers(ctx: TenantContext) {
  assertCan(ctx, "user:read")
  const filter = ctx.branchScope === "all" ? {} : { branchIds: { $in: ctx.branchScope } }
  return members.forTenant(ctx).find(filter, { sort: { email: 1 } })
}

async function assertNotLastAdmin(
  ctx: TenantContext,
  member: { _id: ObjectId; roles: string[] },
  session: import("mongodb").ClientSession,
) {
  if (!member.roles.includes("org_admin")) return
  // Serialise concurrent org_admin removals via a write lock on the tenant doc so snapshot
  // isolation can never let two admins demote/deactivate each other simultaneously.
  await tenantsCollection().updateOne(
    { _id: ctx.tenantId },
    { $set: { updatedAt: new Date() } },
    { session },
  )
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
  // Editing someone is as powerful as granting their roles and branches, so both rules apply.
  if (!canGrantRoles(ctx, member.roles, await customRoles(ctx))) {
    throw new ApiError("FORBIDDEN", "You can't change someone with more access than you.")
  }
  assertTargetBranchesInScope(ctx, member.branchIds)
  return member
}

export async function updateMemberAccess(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof accessSchema>,
) {
  const member = await loadMember(ctx, idRaw)
  const input = parseInput(accessSchema, raw)
  const { roles, branchIds } = await validateAccess(ctx, input)
  const updated = await withTransaction(async (session) => {
    if (!roles.includes("org_admin")) await assertNotLastAdmin(ctx, member, session)
    const $set: Record<string, unknown> = { roles, branchIds }
    if (input.phone !== undefined) $set.phone = input.phone
    const menus = normalizeMenus(input.menus)
    if (menus !== undefined) $set.menus = menus
    const updated = await members
      .forTenant(ctx)
      .updateOne({ _id: member._id }, { $set }, { session })
    await appendAudit(
      ctx,
      {
        action: "member.updated",
        entity: "member",
        entityId: member._id,
        before: { roles: member.roles, branchIds: member.branchIds, menus: member.menus ?? null },
        after: { roles, branchIds, menus: menus === undefined ? (member.menus ?? null) : menus },
      },
      { session },
    )
    return updated!
  })

  const sameSet = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x) => b.includes(x))
  const beforeMenus = member.menus ?? null
  const afterMenus = updated.menus ?? null
  const changed = {
    roles: !sameSet(member.roles, updated.roles),
    branches: !sameSet(
      member.branchIds.map((b) => b.toHexString()),
      updated.branchIds.map((b) => b.toHexString()),
    ),
    menus:
      (beforeMenus === null) !== (afterMenus === null) ||
      (beforeMenus !== null && afterMenus !== null && !sameSet(beforeMenus, afterMenus)),
  }
  if ((changed.roles || changed.branches || changed.menus) && member.userId !== ctx.actorId) {
    const e = await accountEmailContext(ctx)
    const details: [string, string][] = [
      [
        "Role",
        changed.roles
          ? `${e.roles(member.roles)} → ${e.roles(updated.roles)}`
          : e.roles(updated.roles),
      ],
      ["Branches", await branchNames(ctx, updated.branchIds)],
      ["Menus", menuSummary(afterMenus)],
    ]
    await notifyUser(ctx, {
      userId: member.userId,
      type: "account.access_changed",
      title: `Your access in ${e.org} changed`,
      body: `${e.actor} updated what you can see and do in ${e.org}. It applies the next time you open a page.`,
      href: "/dashboard",
      details,
      cta: "Open QR Feed",
      essential: true,
      channels: ["in_app", "email"],
    })
  }
  return updated
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
  const result = await withTransaction(async (session) => {
    if (status === "inactive") {
      await assertNotLastAdmin(ctx, member, session)
    } else {
      const now = new Date()
      const seats =
        (await members.forTenant(ctx).count({ status: "active" }, { session })) +
        (await invites
          .forTenant(ctx)
          .count({ status: "pending", expiresAt: { $gt: now } }, { session }))
      await assertWithinLimit(ctx, "users", seats, session)
    }
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

  // Sent directly: once deactivated they no longer get member notifications.
  const e = await accountEmailContext(ctx)
  await sendAccountEmail(
    member.email,
    status === "inactive"
      ? `Your access to ${e.org} was removed`
      : `Your access to ${e.org} is back`,
    status === "inactive"
      ? {
          brand: e.org,
          heading: `Your access to ${e.org} was removed`,
          intro: [
            `${e.actor} deactivated your account in ${e.org}. You're signed out of it straight away.`,
            "Your past work stays in the record. If you think this is a mistake, contact your administrator.",
          ],
        }
      : {
          brand: e.org,
          heading: `Welcome back to ${e.org}`,
          intro: `${e.actor} reactivated your account in ${e.org}, with the roles you had before.`,
          details: [["Role", e.roles(member.roles)]],
          cta: { label: "Sign in", url: appUrl("/sign-in") },
        },
  )
  return result
}
