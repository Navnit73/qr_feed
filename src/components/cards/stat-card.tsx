import type { ReactNode } from "react"
import { Icon, type IconName } from "@/components/icons"
import { cn } from "@/lib/utils"
import { TONE_TILE, type Tone } from "./tone"

const numberFormat = new Intl.NumberFormat("en-US")

/**
 * A KPI tile: label, big number and an optional change versus the last period.
 * `icon` shows in a soft tinted tile (pick its colour with `tone`).
 * `featured` wraps it in the indigo edge with an amber glow (one per row at most).
 */
export function StatCard({
  label,
  value,
  icon,
  tone = "indigo",
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
  tone?: Tone
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
        "flex h-full flex-col rounded-xl p-4 sm:p-5",
        featured
          ? "rounded-[calc(1rem-1px)]"
          : "bg-card text-card-foreground ring-1 ring-foreground/10",
        !featured && className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums sm:text-[1.75rem]">
            {typeof value === "number" ? numberFormat.format(value) : value}
          </p>
        </div>
        {icon && (
          <span
            className={cn("grid size-10 shrink-0 place-items-center rounded-lg", TONE_TILE[tone])}
          >
            <Icon name={icon} className="size-5" />
          </span>
        )}
      </div>
      {(deltaText || footer) && (
        <div className="mt-auto pt-3 text-xs">
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
    <div className={cn("edge-primary rounded-2xl p-px", className)}>
      <div className="h-full rounded-[calc(1rem-1px)] bg-card text-card-foreground">
        <div className="bg-glow-amber h-full rounded-[calc(1rem-1px)]">{body}</div>
      </div>
    </div>
  )
}
