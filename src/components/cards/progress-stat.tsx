import { Icon, type IconName } from "@/components/icons"
import { cn } from "@/lib/utils"
import { TONE_BAR, TONE_TILE, TONE_TRACK, type Tone } from "./tone"

const numberFormat = new Intl.NumberFormat("en-US")

/**
 * A compact "share of total" tile: round icon, count, label, percentage and a thin progress bar.
 * `percent` is 0 to 100.
 */
export function ProgressStat({
  label,
  value,
  percent,
  icon,
  tone = "indigo",
  className,
}: {
  label: string
  value: number
  percent: number
  icon: IconName
  tone?: Tone
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONE_TILE[tone])}
        >
          <Icon name={icon} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-semibold tabular-nums">
            {numberFormat.format(value)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <span className="self-end text-xs text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <div
        className={cn("h-1 overflow-hidden rounded-full", TONE_TRACK[tone])}
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
