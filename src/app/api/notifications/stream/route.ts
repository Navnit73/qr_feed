import { requireTenantContext } from "@/server/auth/session"
import { unreadNotificationCount } from "@/server/modules/notifications"

/** Server-Sent Events endpoint for live in-app notification badge updates (phase.md §4.2). */
export async function GET(req: Request) {
  const ctx = await requireTenantContext()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        send("count", { unread: await unreadNotificationCount(ctx) })
      } catch {
        controller.close()
        return
      }
      const timer = setInterval(async () => {
        if (req.signal.aborted) {
          clearInterval(timer)
          controller.close()
          return
        }
        try {
          send("count", { unread: await unreadNotificationCount(ctx) })
        } catch {
          clearInterval(timer)
          controller.close()
        }
      }, 15_000)

      req.signal.addEventListener("abort", () => {
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
