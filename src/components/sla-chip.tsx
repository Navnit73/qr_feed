"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { computeSlaStatus } from "@/lib/sla-calculator"

/**
 * Green / amber / red / muted live SLA countdown chip (phase.md §8, F-4.6).
 * Initializes from the server-provided `now` so SSR and hydration match identically,
 * then ticks every 30s while open and unpaused.
 */
export function SlaChip({
  createdAt,
  resolveDueAt,
  pausedAt,
  resolvedAt,
  breached,
  now,
}: {
  createdAt: Date | string
  resolveDueAt: Date | string | null | undefined
  pausedAt?: Date | string | null
  resolvedAt?: Date | string | null
  breached?: boolean
  now: number
}) {
  const [tick, setTick] = useState<{ base: number; value: number } | null>(null)
  const nowMs = tick && tick.base === now ? tick.value : now

  const shouldTick = Boolean(resolveDueAt) && !pausedAt && !resolvedAt
  useEffect(() => {
    if (!shouldTick) return
    const timer = setInterval(() => setTick({ base: now, value: Date.now() }), 30_000)
    return () => clearInterval(timer)
  }, [shouldTick, now])

  if (!resolveDueAt) return null

  const info = computeSlaStatus({
    createdAt: new Date(createdAt),
    resolveDueAt: new Date(resolveDueAt),
    now: new Date(nowMs),
    pausedAt: pausedAt ? new Date(pausedAt) : null,
    resolvedAt: resolvedAt ? new Date(resolvedAt) : null,
    breached,
  })

  const variant =
    info.state === "breached"
      ? "destructive"
      : info.state === "at_risk"
        ? "warning"
        : info.state === "paused"
          ? "muted"
          : "success"

  return (
    <Badge variant={variant} className="tabular-nums">
      {info.label}
    </Badge>
  )
}
