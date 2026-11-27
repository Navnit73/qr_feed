import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import type { TicketEvent } from "@/lib/ticket-state-machine"
import { authenticateApiKey } from "@/server/modules/platform"
import { addTicketComment, applyTicketTransition, getTicketDetail } from "@/server/modules/tickets"
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

export const GET = withApi(
  async (req: Request, { params }: RouteContext<"/api/v1/tickets/[ticketId]">) => {
    const ctx = await requireApiContext(req)
    const { ticketId } = await params
    const detail = await getTicketDetail(ctx, ticketId)
    const t = detail.ticket
    return ok({
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
            pausedAt: t.sla.pausedAt?.toISOString() ?? null,
          }
        : null,
      comments: detail.comments.map((c) => ({
        id: c._id.toHexString(),
        authorName: c.authorName,
        visibility: c.visibility,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })
  },
)

export const PATCH = withApi(
  async (req: Request, { params }: RouteContext<"/api/v1/tickets/[ticketId]">) => {
    const ctx = await requireApiContext(req)
    const { ticketId } = await params
    const body = (await req.json().catch(() => null)) as
      | ({
          action?: string
          comment?: { body: string; visibility?: "internal" | "public" }
        } & Record<string, unknown>)
      | null
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("VALIDATION", "JSON body required.")
    }

    if (body.comment) {
      const comment = await addTicketComment(ctx, ticketId, {
        body: body.comment.body,
        visibility: body.comment.visibility ?? "internal",
        attachments: [],
      })
      return ok({ commentId: comment._id.toHexString() })
    }

    if (!body.action) {
      throw new ApiError("VALIDATION", "Provide either an `action` or a `comment` payload.")
    }

    const updated = await applyTicketTransition(ctx, ticketId, {
      ...body,
      type: body.action,
    } as unknown as TicketEvent)
    return ok({
      id: updated._id.toHexString(),
      number: updated.number,
      status: updated.status,
      assignee: updated.assignee ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    })
  },
)
