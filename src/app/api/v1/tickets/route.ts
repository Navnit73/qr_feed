import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { authenticateApiKey } from "@/server/modules/platform"
import { createManualTicket, queryTickets } from "@/server/modules/tickets"
import { rateLimit } from "@/server/rate-limit"

async function requireApiContext(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const ctx = await authenticateApiKey(token)
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Valid Bearer API key required.")
  const rl = await rateLimit({ key: `apiv1:${ctx.actorId}`, limit: 120, windowMs: 60_000 })
  if (!rl.ok) throw new ApiError("RATE_LIMITED", "API rate limit exceeded. Try again in a minute.")
  return ctx
}

export const GET = withApi(async (req: Request) => {
  const ctx = await requireApiContext(req)
  const sp = new URL(req.url).searchParams
  const res = await queryTickets(ctx, {
    status: sp.get("status") ?? undefined,
    severity: sp.get("severity") ?? undefined,
    branchId: sp.get("branchId") ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    assigneeId: sp.get("assigneeId") ?? undefined,
    q: sp.get("q") ?? undefined,
    page: Number(sp.get("page")) || 1,
    pageSize: Math.min(100, Number(sp.get("pageSize")) || 25),
  })
  return ok(
    res.items.map((t) => ({
      id: t._id.toHexString(),
      number: t.number,
      branchId: t.branchId.toHexString(),
      locationId: t.locationId.toHexString(),
      locationPath: t.locationPath,
      category: t.categoryName,
      severity: t.severity,
      status: t.status,
      description: t.description,
      rating: t.rating,
      tags: t.tags ?? [],
      assignee: t.assignee ?? null,
      currentLevel: t.currentLevel ?? 1,
      sla: t.sla
        ? {
            acceptDueAt: t.sla.acceptDueAt.toISOString(),
            resolveDueAt: t.sla.resolveDueAt.toISOString(),
            breached: t.sla.breached,
          }
        : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
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
      severity: ticket.severity,
      assignee: ticket.assignee ?? null,
      createdAt: ticket.createdAt.toISOString(),
    },
    { status: 201 },
  )
})
