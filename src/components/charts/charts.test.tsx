import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AreaTrend } from "@/components/charts/area-trend"
import { BarCompare } from "@/components/charts/bar-compare"
import { chartConfig } from "@/components/charts/chart-config"
import { DonutChart } from "@/components/charts/donut-chart"

const weekly = [
  { day: "Mon", opened: 12, closed: 9 },
  { day: "Tue", opened: 18, closed: 15 },
  { day: "Wed", opened: 9, closed: 11 },
]
const series = [
  { key: "opened", label: "Opened" },
  { key: "closed", label: "Closed" },
]

describe("chartConfig()", () => {
  it("assigns the brand chart tokens in order", () => {
    expect(chartConfig(series)).toEqual({
      opened: { label: "Opened", color: "var(--chart-1)" },
      closed: { label: "Closed", color: "var(--chart-2)" },
    })
  })

  it("wraps around after five series", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, label: `S${i}` }))
    expect(chartConfig(six).s5.color).toBe("var(--chart-1)")
  })

  it("keeps an explicit colour", () => {
    expect(
      chartConfig([{ key: "late", label: "Late", color: "var(--destructive)" }]).late.color,
    ).toBe("var(--destructive)")
  })
})

// jsdom has no layout, so Recharts draws nothing. Every chart also renders its data as a
// screen-reader table, which is what we assert on (and what blind users get).
describe.each([
  ["AreaTrend", AreaTrend],
  ["BarCompare", BarCompare],
] as const)("%s", (_, Chart) => {
  it("is a labelled figure with an accessible data table", () => {
    render(<Chart title="Tickets this week" data={weekly} xKey="day" series={series} />)
    const figure = screen.getByRole("figure", { name: "Tickets this week" })
    const table = within(figure).getByRole("table")
    expect(within(table).getByRole("columnheader", { name: "Opened" })).toBeInTheDocument()
    expect(within(table).getAllByRole("row")).toHaveLength(weekly.length + 1)
    expect(within(table).getByRole("rowheader", { name: "Tue" })).toBeInTheDocument()
  })
})

describe("DonutChart", () => {
  const data = [
    { key: "met", label: "Met", value: 90 },
    { key: "breached", label: "Breached", value: 10 },
  ]

  it("shows the total in the centre by default", () => {
    render(<DonutChart title="SLA compliance" data={data} centerLabel="tickets" />)
    const figure = screen.getByRole("figure", { name: "SLA compliance" })
    expect(within(figure).getByText("100")).toBeInTheDocument()
    expect(within(figure).getByText("tickets")).toBeInTheDocument()
  })

  it("lists each slice in the data table", () => {
    render(<DonutChart title="SLA compliance" data={data} />)
    const table = screen.getByRole("table")
    expect(within(table).getByRole("rowheader", { name: "Breached" })).toBeInTheDocument()
    expect(within(table).getByRole("cell", { name: "10" })).toBeInTheDocument()
  })
})
