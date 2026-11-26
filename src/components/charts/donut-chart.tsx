"use client"

import { Cell, Pie, PieChart } from "recharts"
import { ChartFigure } from "@/components/charts/chart-figure"
import { chartConfig } from "@/components/charts/chart-config"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

const numberFormat = new Intl.NumberFormat("en-US")

type Slice = { key: string; label: string; value: number; color?: string }

/** Parts of a whole: SLA met vs breached, tickets by severity. Keep it to five slices or fewer. */
export function DonutChart({
  title,
  data,
  centerValue,
  centerLabel,
  className,
}: {
  title: string
  data: Slice[]
  /** Defaults to the sum of the slices. */
  centerValue?: string | number
  centerLabel?: string
  className?: string
}) {
  const config = chartConfig(data)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const center = centerValue ?? numberFormat.format(total)
  const rows = data.map((d) => ({ slice: d.label, value: d.value }))

  return (
    <ChartFigure
      title={title}
      data={rows}
      xKey="slice"
      series={[{ key: "value", label: "Value" }]}
      className={className}
    >
      <div className="relative">
        <ChartContainer config={config} className="mx-auto aspect-square h-56">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius="62%"
              outerRadius="90%"
              strokeWidth={2}
              stroke="var(--card)"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={`var(--color-${d.key})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-3xl font-bold tracking-tight tabular-nums">{center}</span>
          {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: config[d.key].color }}
            />
            {d.label}
            <span className="text-muted-foreground tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </ChartFigure>
  )
}
