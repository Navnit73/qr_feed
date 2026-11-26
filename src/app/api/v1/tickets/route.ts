import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { authenticateApiKey } from "@/server/modules/platform"
import { createManualTicket, queryTickets } from "@/server/modules/tickets"

async function requireApiContext(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const ctx = await authenticateApiKey(token)
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Valid Bearer API key required.")
  return ctx
}

export const GET = withApi(async (req: Request) => {
  const ctx = await requireApiContext(req)
  const sp = new URL(req.url).searchParams
  const res = await queryTickets(ctx, {
    status: sp.get("status") ?? undefined,
    severity: sp.get("severity") ?? undefined,
    page: Number(sp.get("page")) || 1,
    pageSize: Math.min(100, Number(sp.get("pageSize")) || 25),
  })
  return ok(
    res.items.map((t) => ({
      id: t._id.toHexString(),
      number: t.number,
      category: t.categoryName,
      locationPath: t.locationPath,
      severity: t.severity,
      status: t.status,
      assignee: t.assignee ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    { meta: res.meta },
  )
})

export const POST = withApi(async (req: Request) => {
  const ctx = await requireApiContext(req)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) throw new ApiError("VALIDATION", "JSON body required.")
  const ticket = await createManualTicket(ctx, body as never)
  return ok(
    {
      id: ticket._id.toHexString(),
      number: ticket.number,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
    },
    { status: 201 },
  )
})
