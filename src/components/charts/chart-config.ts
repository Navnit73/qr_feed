import type { ChartConfig } from "@/components/ui/chart"

export type Series = { key: string; label: string; color?: string }

/**
 * Builds a shadcn ChartConfig from a series list, colouring in brand order: rose, indigo,
 * emerald, amber, gray (the `--chart-1…5` tokens, which switch with dark mode).
 */
export function chartConfig(series: Series[]): ChartConfig {
  return Object.fromEntries(
    series.map((s, i) => [
      s.key,
      { label: s.label, color: s.color ?? `var(--chart-${(i % 5) + 1})` },
    ]),
  )
}
