"use client"

import { useRouter } from "next/navigation"
import { useSyncExternalStore, useTransition } from "react"
import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"

const noop = () => () => {}

/**
 * "Updated 03:47 pm" plus a Refresh button that re-runs the server data. The time is the
 * moment the server rendered the data, shown in the viewer's own clock (blank until hydrated).
 */
export function RefreshButton({ updatedAt }: { updatedAt: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const time = useSyncExternalStore(
    noop,
    () =>
      new Date(updatedAt)
        .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        .toLowerCase(),
    () => "",
  )

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
        {time && `Updated ${time}`}
      </span>
      <Button
        variant="secondary"
        size="lg"
        loading={pending}
        onClick={() => start(() => router.refresh())}
      >
        {!pending && <Icon name="refresh" data-icon="inline-start" />} Refresh
      </Button>
    </div>
  )
}
