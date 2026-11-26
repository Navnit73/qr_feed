import { Badge } from "@/components/ui/badge"
import { computeSlaStatus } from "@/lib/sla-calculator"

/**
 * Green / amber / red / muted SLA countdown chip (phase.md §8, F-4.6).
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
  if (!resolveDueAt) return null
  const info = computeSlaStatus({
    createdAt: new Date(createdAt),
    resolveDueAt: new Date(resolveDueAt),
    now: new Date(now),
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
