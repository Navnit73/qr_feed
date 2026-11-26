"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartFigure } from "@/components/charts/chart-figure"
import { chartConfig, type Series } from "@/components/charts/chart-config"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

/** Values over time: ticket volume, ratings, SLA compliance trend. */
export function AreaTrend({
  title,
  data,
  xKey,
  series,
  stacked = false,
  className,
}: {
  title: string
  data: Record<string, string | number>[]
  xKey: string
  series: Series[]
  stacked?: boolean
  className?: string
}) {
  const config = chartConfig(series)
  return (
    <ChartFigure title={title} data={data} xKey={xKey} series={series} className={className}>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.35} />
                <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          {series.map((s) => (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              fill={`url(#fill-${s.key})`}
              stackId={stacked ? "a" : undefined}
            />
          ))}
          {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        </AreaChart>
      </ChartContainer>
    </ChartFigure>
  )
}
