"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartFigure } from "@/components/charts/chart-figure"
import { chartConfig, type Series } from "@/components/charts/chart-config"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

/** Compare categories: tickets by location, CAPA by owner, branch vs branch. */
export function BarCompare({
  title,
  data,
  xKey,
  series,
  stacked = false,
  layout = "vertical-bars",
  className,
}: {
  title: string
  data: Record<string, string | number>[]
  xKey: string
  series: Series[]
  stacked?: boolean
  /** `horizontal-bars` suits long category names such as location paths. */
  layout?: "vertical-bars" | "horizontal-bars"
  className?: string
}) {
  const config = chartConfig(series)
  const horizontal = layout === "horizontal-bars"
  return (
    <ChartFigure title={title} data={data} xKey={xKey} series={series} className={className}>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ left: horizontal ? 8 : -16, right: 8, top: 8 }}
        >
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            </>
          )}
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={`var(--color-${s.key})`}
              stackId={stacked ? "a" : undefined}
              // Round only the outer end of the bar (the top of the stack when stacked).
              radius={!stacked || i === series.length - 1 ? 6 : 0}
            />
          ))}
          {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        </BarChart>
      </ChartContainer>
    </ChartFigure>
  )
}
