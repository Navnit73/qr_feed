import { ok, withApi } from "@/lib/api/response"
import { requireTenantContext } from "@/server/auth/session"
import { can } from "@/server/rbac/ability"
import { locations, tickets } from "@/server/repositories"

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const GET = withApi(async (req: Request) => {
  const ctx = await requireTenantContext()
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80)
  if (q.length < 2) return ok({ tickets: [], locations: [] })

  const regex = new RegExp(escapeRegex(q), "i")
  const [ticketHits, locationHits] = await Promise.all([
    can(ctx, "ticket:read")
      ? tickets.forTenant(ctx).find(
          {
            $or: [
              { number: regex },
              { categoryName: regex },
              { description: regex },
              { locationPath: regex },
            ],
          },
          { sort: { createdAt: -1 }, limit: 6 },
        )
      : [],
    can(ctx, "location:read")
      ? locations
          .forTenant(ctx)
          .find(
            { status: "active", $or: [{ name: regex }, { code: regex }] },
            { sort: { name: 1 }, limit: 6 },
          )
      : [],
  ])

  return ok({
    tickets: ticketHits.map((t) => ({
      id: t._id.toHexString(),
      number: t.number,
      category: t.categoryName,
      location: t.locationPath.at(-1) ?? "",
      status: t.status,
      severity: t.severity,
    })),
    locations: locationHits.map((l) => ({
      id: l._id.toHexString(),
      branchId: l.branchId.toHexString(),
      name: l.name,
      path: l.path.join(" › "),
      type: l.type,
    })),
  })
})
