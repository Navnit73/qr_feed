import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { authenticateApiKey } from "@/server/modules/platform"
import { assertCan } from "@/server/rbac/ability"
import { locations } from "@/server/repositories"

export const GET = withApi(async (req: Request) => {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const ctx = await authenticateApiKey(token)
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Valid Bearer API key required.")
  assertCan(ctx, "location:read")
  const list = await locations
    .forTenant(ctx)
    .find({ status: "active" }, { sort: { path: 1 }, limit: 500 })
  return ok(
    list.map((l) => ({
      id: l._id.toHexString(),
      branchId: l.branchId.toHexString(),
      type: l.type,
      name: l.name,
      path: l.path,
      code: l.code ?? null,
    })),
  )
})
