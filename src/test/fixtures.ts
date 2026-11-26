import { resolveTenantContext } from "@/server/auth/context"
import { createLocation } from "@/server/modules/locations"
import { createOrganization, type OrganizationInput } from "@/server/modules/onboarding"

/** An organisation with one branch, an org-admin context and a floor › room to hang QRs on. */
export async function orgWithRoom(
  overrides: Partial<OrganizationInput> & { ownerId?: string } = {},
) {
  const ownerId = overrides.ownerId ?? `owner-${Math.random().toString(36).slice(2, 8)}`
  const { tenant, branch } = await createOrganization(
    { id: ownerId, email: `${ownerId}@x.test`, name: "Owner" },
    {
      orgName: overrides.orgName ?? "Sunrise Hotels",
      industry: overrides.industry ?? "hotel",
      branchName: overrides.branchName ?? "Delhi",
      timezone: overrides.timezone ?? "Asia/Kolkata",
    },
  )
  const ctx = (await resolveTenantContext(ownerId, tenant._id))!
  const floor = await createLocation(ctx, { branchId: branch._id, type: "floor", name: "Floor 2" })
  const room = await createLocation(ctx, {
    branchId: branch._id,
    parentId: floor._id,
    type: "location",
    name: "Washroom F2",
  })
  return { ctx, tenant, branch, floor, room }
}

export async function errorCode(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return (e as { code?: string }).code
  }
  throw new Error("expected a rejection")
}
