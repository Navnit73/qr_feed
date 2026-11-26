"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { quickTransitionAction } from "@/app/(app)/tickets/actions"

/** One-tap Accept / Start / Resume buttons for staff on /my-work (phase.md §8). */
export function MyWorkQuickButtons({ ticketId, status }: { ticketId: string; status: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function act(type: "accept" | "start" | "resume") {
    setError(null)
    startTransition(async () => {
      const res = await quickTransitionAction(ticketId, { type })
      if (res && !res.ok) setError(res.error.message)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "new" || status === "assigned") && (
        <Button size="lg" loading={pending} onClick={() => act("accept")}>
          Accept
        </Button>
      )}
      {(status === "accepted" || status === "reopened") && (
        <Button size="lg" loading={pending} onClick={() => act("start")}>
          Start work
        </Button>
      )}
      {status === "on_hold" && (
        <Button size="lg" loading={pending} onClick={() => act("resume")}>
          Resume
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
