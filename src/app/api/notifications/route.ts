import { ok, withApi } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import {
  listNotifications,
  markAllRead,
  markNotificationRead,
  unreadNotificationCount,
} from "@/server/modules/notifications"

export const GET = withApi(async () => {
  const ctx = await requireApiTenantContext()
  const [items, unread] = await Promise.all([
    listNotifications(ctx, 20),
    unreadNotificationCount(ctx),
  ])
  return ok({
    unread,
    items: items.map((n) => ({
      id: n._id.toHexString(),
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
  })
})

export const PATCH = withApi(async (req: Request) => {
  const ctx = await requireApiTenantContext()
  const body = (await req.json().catch(() => ({}))) as { id?: string; markAllRead?: boolean }
  if (body.markAllRead) {
    await markAllRead(ctx)
  } else if (body.id) {
    await markNotificationRead(ctx, body.id)
  }
  return ok({ unread: await unreadNotificationCount(ctx) })
})
