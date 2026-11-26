import "server-only"
import { randomBytes } from "node:crypto"
import { ObjectId } from "mongodb"
import { z } from "zod"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import {
  INDUSTRIES,
  tenantsCollection,
  TRIAL_LIMITS,
  type TenantRecord,
} from "@/server/modules/tenants"
import { seedCategories } from "@/server/modules/categories"
import { ALL_PERMISSIONS } from "@/server/rbac/permissions"
import { branches, members } from "@/server/repositories"
import { name, timeZone } from "@/server/validation"

export const organizationSchema = z.object({
  orgName: name("organisation name"),
  industry: z.enum(INDUSTRIES, { error: "Choose an industry" }),
  branchName: name("branch name"),
  timezone: timeZone,
})
export type OrganizationInput = z.input<typeof organizationSchema>

export type SessionUser = { id: string; email: string; name: string }

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  )
}

async function uniqueSlug(base: string) {
  let slug = base
  // Collisions are rare; a random suffix avoids an ever-growing "-2, -3 …" scan.
  while (await tenantsCollection().findOne({ slug }, { projection: { _id: 1 } })) {
    slug = `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`
  }
  return slug
}

function isDuplicateSlugError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  )
}

/**
 * Sign-up step 2: the new user creates their organisation. The tenant, its first branch,
 * the owner's org-admin membership and the audit entries commit together or not at all.
 */
export async function createOrganization(user: SessionUser, raw: OrganizationInput) {
  const input = parseInput(organizationSchema, raw)
  const baseSlug = slugify(input.orgName)
  let slug = await uniqueSlug(baseSlug)

  // BUG-006: two concurrent onboardings with the same name can pick the same free slug before
  // either inserts. Retry with a fresh random suffix if the unique index on slug rejects it.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await withTransaction(async (session) => {
        const now = new Date()
        const tenant: TenantRecord = {
          _id: new ObjectId(),
          name: input.orgName,
          slug,
          industry: input.industry,
          plan: "trial",
          status: "active",
          limits: TRIAL_LIMITS,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        }
        await tenantsCollection().insertOne(tenant, { session })

        const ctx: TenantContext = {
          tenantId: tenant._id,
          actorId: user.id,
          roles: ["org_admin"],
          permissions: new Set(ALL_PERMISSIONS),
          branchScope: "all",
        }
        const branch = await branches
          .forTenant(ctx)
          .insertOne(
            { name: input.branchName, timezone: input.timezone, status: "active" },
            { session },
          )
        await seedCategories(ctx, input.industry, session)
        const member = await members.forTenant(ctx).insertOne(
          {
            userId: user.id,
            email: user.email.toLowerCase(),
            name: user.name,
            roles: ["org_admin"],
            branchIds: [],
            status: "active",
          },
          { session },
        )

        await appendAudit(
          ctx,
          {
            action: "tenant.created",
            entity: "tenant",
            entityId: tenant._id,
            after: { name: tenant.name, slug, industry: tenant.industry },
          },
          { session },
        )
        await appendAudit(
          ctx,
          {
            action: "branch.created",
            entity: "branch",
            entityId: branch._id,
            after: { name: branch.name },
          },
          { session },
        )
        await appendAudit(
          ctx,
          {
            action: "member.added",
            entity: "member",
            entityId: member._id,
            after: { email: member.email, roles: member.roles },
          },
          { session },
        )
        return { tenant, branch, member }
      })
    } catch (err) {
      if (isDuplicateSlugError(err) && attempt < 5) {
        slug = `${baseSlug}-${randomBytes(3).toString("hex").slice(0, 4)}`
        continue
      }
      throw err
    }
  }
  throw new Error("Could not allocate a unique organisation slug.")
}
