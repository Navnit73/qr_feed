import type { ReactNode } from "react"
import type { Series } from "@/components/charts/chart-config"
import { cn } from "@/lib/utils"

type Row = Record<string, string | number>

/**
 * Wraps every chart in a labelled <figure> with a screen-reader table of the same numbers.
 * Charts are pictures; the table is how assistive tech (and our tests) read the data.
 */
export function ChartFigure({
  title,
  data,
  xKey,
  series,
  className,
  children,
}: {
  title: string
  data: Row[]
  xKey: string
  series: Series[]
  className?: string
  children: ReactNode
}) {
  return (
    <figure aria-label={title} className={cn("min-w-0", className)}>
      {children}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{xKey}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              <th scope="row">{row[xKey]}</th>
              {series.map((s) => (
                <td key={s.key}>{row[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
