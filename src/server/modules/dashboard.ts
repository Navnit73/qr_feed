import "server-only"
import type { TenantContext } from "@/server/db/tenant-context"
import { ticketStats } from "@/server/modules/intake"
import { can } from "@/server/rbac/ability"
import { branches, locations, members } from "@/server/repositories"

/** Headline counts for the dashboard, each only if the viewer may see that area. */
export async function getDashboardStats(ctx: TenantContext) {
  const [branchCount, locationCount, memberCount, tickets] = await Promise.all([
    can(ctx, "branch:read") ? branches.forTenant(ctx).count({ status: "active" }) : null,
    can(ctx, "location:read") ? locations.forTenant(ctx).count({ status: "active" }) : null,
    can(ctx, "user:read") ? members.forTenant(ctx).count({ status: "active" }) : null,
    can(ctx, "ticket:read") ? ticketStats(ctx) : null,
  ])
  return { branchCount, locationCount, memberCount, tickets }
}
