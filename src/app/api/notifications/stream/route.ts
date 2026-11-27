import { fail } from "@/lib/api/response"
import { getTenantContext } from "@/server/auth/session"
import { unreadNotificationCount } from "@/server/modules/notifications"

const POLL_MS = 15_000
const MAX_STREAM_MS = 5 * 60 * 1000

/** Server-Sent Events endpoint for live in-app notification badge updates (phase.md §4.2). */
export async function GET(req: Request) {
  const ctx = await getTenantContext()
  if (!ctx) return fail("UNAUTHORIZED", "Sign in to receive notifications.")

  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setInterval> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  let inFlight = false
  let lastCount = -1

  const cleanup = () => {
    closed = true
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (maxTimer) {
      clearTimeout(maxTimer)
      maxTimer = null
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => {
        if (closed) return
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }

      const sendRaw = (chunk: string) => {
        if (closed || req.signal.aborted) return
        controller.enqueue(encoder.encode(chunk))
      }

      const pushCount = async (force = false) => {
        if (closed || req.signal.aborted || inFlight) return
        inFlight = true
        try {
          const unread = await unreadNotificationCount(ctx)
          if (force || unread !== lastCount) {
            lastCount = unread
            sendRaw(`event: count\ndata: ${JSON.stringify({ unread })}\n\n`)
          } else {
            // Comment keepalive prevents reverse proxies from closing idle SSE sockets.
            sendRaw(": keepalive\n\n")
          }
        } catch {
          close()
        } finally {
          inFlight = false
        }
      }

      req.signal.addEventListener("abort", close, { once: true })

      sendRaw("retry: 3000\n\n")
      await pushCount(true)
      if (closed || req.signal.aborted) {
        close()
        return
      }

      timer = setInterval(() => {
        if (closed || req.signal.aborted) {
          close()
          return
        }
        void pushCount(false)
      }, POLL_MS)

      // Recycle streams cleanly after 5 minutes so serverless/proxy workers stay healthy;
      // EventSource automatically reconnects after `retry: 3000`.
      maxTimer = setTimeout(close, MAX_STREAM_MS)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
