import type { ReactNode } from "react"
import { Icon, type IconName } from "@/components/icons"
import { cn } from "@/lib/utils"

const numberFormat = new Intl.NumberFormat("en-US")

/**
 * A KPI tile: label, big number and an optional change versus the last period.
 * `featured` wraps it in the lime edge with an amber glow (one per row at most).
 */
export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  lowerIsBetter = false,
  featured = false,
  footer,
  className,
}: {
  label: string
  value: number | string
  icon?: IconName
  /** Percentage change, e.g. 18 for +18%. */
  delta?: number
  deltaLabel?: string
  /** For metrics like overdue tickets or MTTR, where a fall is good news. */
  lowerIsBetter?: boolean
  featured?: boolean
  footer?: ReactNode
  className?: string
}) {
  const good = delta !== undefined && (lowerIsBetter ? delta <= 0 : delta >= 0)
  // A real minus sign lines up with the plus in tabular figures.
  const deltaText = delta === undefined ? null : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}%`

  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl p-5",
        featured ? "rounded-[calc(1rem-1px)]" : "border bg-card text-card-foreground",
        !featured && className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground">
            <Icon name={icon} />
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
        {typeof value === "number" ? numberFormat.format(value) : value}
      </p>
      {(deltaText || footer) && (
        <div className="mt-auto pt-4 text-sm">
          {deltaText && (
            <p>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  good ? "text-success" : "text-destructive",
                )}
              >
                {deltaText}
              </span>{" "}
              {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
            </p>
          )}
          {footer}
        </div>
      )}
    </div>
  )

  if (!featured) return body
  // The glow sits on its own layer: tailwind-merge reads `bg-glow-amber` as a background
  // colour and would drop `bg-card` if both shared one cn() call (BUG-001).
  return (
    <div className={cn("edge-lime rounded-2xl p-px", className)}>
      <div className="h-full rounded-[calc(1rem-1px)] bg-card text-card-foreground">
        <div className="bg-glow-amber h-full rounded-[calc(1rem-1px)]">{body}</div>
      </div>
    </div>
  )
}
