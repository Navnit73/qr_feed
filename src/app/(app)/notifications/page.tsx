import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/cards/empty-state"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { timeAgo } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import { requireTenantContext } from "@/server/auth/session"
import { listNotifications, unreadNotificationCount } from "@/server/modules/notifications"
import { markAllReadAction, markOneReadAction } from "./actions"

export const metadata: Metadata = { title: "Notifications · QR Feed" }

export default async function NotificationsPage() {
  const ctx = await requireTenantContext()
  const [items, unread] = await Promise.all([
    listNotifications(ctx, 50),
    unreadNotificationCount(ctx),
  ])
  // eslint-disable-next-line react-hooks/purity -- single server render per request
  const now = Date.now()

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, escalations, verification requests and reminders."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Notifications" }]}
        actions={
          unread > 0 && (
            <form
              action={async () => {
                "use server"
                await markAllReadAction()
              }}
            >
              <Button variant="outline" size="lg" type="submit">
                Mark all read ({unread})
              </Button>
            </form>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="notification"
          title="No notifications yet"
          description="When tickets are assigned, escalated or verified, updates appear here."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((n) => (
            <li
              key={n._id.toHexString()}
              className={cn(
                "flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
                !n.readAt && "bg-primary/5",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                  <p className="font-medium">{n.title}</p>
                  <Badge variant="muted" className="font-mono text-[11px]">
                    {n.type}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span>{timeAgo(n.createdAt, now)}</span>
                {!n.readAt && (
                  <form
                    action={async () => {
                      "use server"
                      await markOneReadAction(n._id.toHexString())
                    }}
                  >
                    <button
                      type="submit"
                      className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Mark read
                    </button>
                  </form>
                )}
                {n.href && (
                  <Link href={n.href} className="font-medium text-primary hover:underline">
                    Open
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
