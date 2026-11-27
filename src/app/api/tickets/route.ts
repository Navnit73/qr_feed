import { ObjectId } from "mongodb"
import { ok, withApi } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { queryTicketsCursor, serializeTicketRow } from "@/server/modules/tickets"

/**
 * Session-authenticated backend endpoint powering infinite scroll pagination on `/tickets`.
 * Supports keyset `cursor` pagination (zero drift under concurrent writes) as well as `page`.
 */
export const GET = withApi(async (req: Request) => {
  const ctx = await requireApiTenantContext()
  const sp = new URL(req.url).searchParams
  const str = (key: string) => {
    const v = sp.get(key)
    return v && v !== "all" ? v : undefined
  }
  const oidStr = (key: string) => {
    const v = str(key)
    return v && ObjectId.isValid(v) ? v : undefined
  }

  const cursor = str("cursor")
  const rawPage = Number(sp.get("page"))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const rawSize = Number(sp.get("pageSize"))
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(100, Math.floor(rawSize)) : 25
  const includeTotal = sp.get("includeTotal") === "1" || !cursor

  const result = await queryTicketsCursor(ctx, {
    cursor,
    page,
    pageSize,
    includeTotal,
    status: str("status"),
    severity: str("severity"),
    branchId: oidStr("branchId"),
    categoryId: oidStr("categoryId"),
    assigneeId: str("assigneeId"),
    q: str("q"),
  })

  return ok({
    items: result.items.map(serializeTicketRow),
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    ...(result.total !== undefined ? { total: result.total } : {}),
    page: result.page,
    pageSize: result.pageSize,
    now: Date.now(),
  })
})
