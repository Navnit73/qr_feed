import { Icon } from "@/components/icons"
import type { SetupStep } from "@/lib/location-stats"
import { cn } from "@/lib/utils"

/** "From empty branch to first scan" checklist, shown until the branch is live. */
export function SetupGuide({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  return (
    <section
      aria-labelledby="setup-guide-title"
      className="relative mb-6 overflow-hidden rounded-2xl border bg-card"
    >
      {/* Own layer: bg-glow would knock bg-card out of a shared cn() (BUG-001). */}
      <div aria-hidden className="bg-glow pointer-events-none absolute inset-0" />
      <div className="relative grid items-center gap-6 p-4 sm:p-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Setup · {done} of {steps.length} done
          </p>
          <h2
            id="setup-guide-title"
            className="mt-1 text-xl font-bold tracking-tight text-balance sm:text-2xl"
          >
            {done === 0 ? "Let's get this branch collecting feedback" : "Almost live"}
          </h2>
          {next && (
            <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">
              Next: <span className="font-medium text-foreground">{next.title}</span>.{" "}
              {next.description}
            </p>
          )}
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
          </div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li
                key={s.key}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3",
                  s.done ? "border-success/30 bg-success/5" : "bg-background/60",
                  s === next && "border-primary/40 ring-1 ring-primary/20",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                    s.done
                      ? "bg-success text-success-foreground"
                      : s === next
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.done ? <Icon name="check" className="size-3.5" label="Done" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-pretty text-muted-foreground">
                    {s.description}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <ScanIllustration className="mx-auto hidden w-52 md:block lg:w-60" />
      </div>
    </section>
  )
}

/** A guest scanning a wall QR and leaving a rating. Token colours, so it follows dark mode. */
function ScanIllustration({ className }: { className?: string }) {
  // Modules of a stylised QR (not a real code): row, col on a 7×7 grid beside the finders.
  const modules = [
    [0, 3],
    [1, 4],
    [2, 3],
    [3, 0],
    [3, 2],
    [3, 4],
    [3, 6],
    [4, 3],
    [4, 5],
    [5, 4],
    [5, 6],
    [6, 3],
    [6, 5],
    [2, 4],
    [4, 4],
  ]
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="21" height="21" rx="4" className="fill-foreground" />
      <rect x={x + 3.5} y={y + 3.5} width="14" height="14" rx="2.5" className="fill-card" />
      <rect x={x + 7} y={y + 7} width="7" height="7" rx="1.5" className="fill-foreground" />
    </g>
  )
  return (
    <svg viewBox="0 0 240 190" aria-hidden className={className}>
      {/* soft backdrop */}
      <circle cx="120" cy="98" r="84" className="fill-secondary" />
      {/* wall poster */}
      <rect
        x="40"
        y="26"
        width="92"
        height="118"
        rx="10"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <rect x="40" y="26" width="92" height="20" rx="10" className="fill-primary" />
      <rect x="40" y="36" width="92" height="10" className="fill-primary" />
      <rect x="52" y="33" width="40" height="5" rx="2.5" className="fill-primary-foreground/70" />
      <g transform="translate(55 56)">
        {finder(0, 0)}
        {finder(41, 0)}
        {finder(0, 41)}
        {modules.map(([r, c]) => (
          <rect
            key={`${r}-${c}`}
            x={c * 8.8}
            y={r * 8.8}
            width="6.5"
            height="6.5"
            rx="1.5"
            className="fill-foreground"
          />
        ))}
      </g>
      <rect x="58" y="126" width="56" height="5" rx="2.5" className="fill-muted" />
      {/* scan beam */}
      <path d="M150 92 L120 62 L120 118 Z" className="fill-primary/15" />
      {/* phone */}
      <g transform="rotate(8 176 108)">
        <rect x="146" y="58" width="58" height="104" rx="12" className="fill-primary" />
        <rect x="151" y="66" width="48" height="86" rx="7" className="fill-card" />
        <rect
          x="167"
          y="61"
          width="16"
          height="3"
          rx="1.5"
          className="fill-primary-foreground/50"
        />
        {/* stars on screen */}
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            transform={`translate(${155 + i * 8.6} 84) scale(0.32)`}
            d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"
            className={i < 4 ? "fill-amber-400" : "fill-muted"}
          />
        ))}
        <rect x="157" y="100" width="36" height="4" rx="2" className="fill-muted" />
        <rect x="157" y="108" width="28" height="4" rx="2" className="fill-muted" />
        <rect x="157" y="132" width="36" height="12" rx="6" className="fill-primary" />
      </g>
      {/* success ping */}
      <circle cx="208" cy="56" r="13" className="fill-emerald-500" />
      <path
        d="M202 56l4 4 8-8"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-white"
      />
    </svg>
  )
}
