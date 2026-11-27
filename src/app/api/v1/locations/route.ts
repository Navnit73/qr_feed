import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { parseInput } from "@/lib/api/validation"
import { authenticateApiKey } from "@/server/modules/platform"
import { rateLimit } from "@/server/rate-limit"
import { assertCan } from "@/server/rbac/ability"
import { locations } from "@/server/repositories"
import { objectId } from "@/server/validation"

export const GET = withApi(async (req: Request) => {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const ctx = await authenticateApiKey(token)
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Valid Bearer API key required.")
  assertCan(ctx, "location:read")

  const rl = await rateLimit({ key: `apiv1:${ctx.actorId}`, limit: 120, windowMs: 60_000 })
  if (!rl.ok) throw new ApiError("RATE_LIMITED", "API rate limit exceeded. Try again in a minute.")

  const sp = new URL(req.url).searchParams
  const branchIdRaw = sp.get("branchId")
  const filter: Record<string, unknown> = { status: "active" }
  if (branchIdRaw) {
    filter.branchId = parseInput(objectId, branchIdRaw)
  }

  const page = Number(sp.get("page")) || 1
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 50))
  const res = await locations.forTenant(ctx).paginate(filter, {
    page,
    pageSize,
    sort: { path: 1 },
    projection: { branchId: 1, type: 1, name: 1, path: 1, code: 1 },
  })

  return ok(
    res.items.map((l) => ({
      id: l._id.toHexString(),
      branchId: l.branchId.toHexString(),
      type: l.type,
      name: l.name,
      path: l.path,
      code: l.code ?? null,
    })),
    { meta: res.meta },
  )
})
