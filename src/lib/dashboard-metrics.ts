/*
 * Pure dashboard maths, shared by the server loader and its tests. No database here.
 */
import { SEVERITIES, type Severity } from "@/lib/feedback-presets"

const DAY_MS = 86_400_000

/** One bucket per calendar day in `timeZone`, oldest first, the last one being today. */
export function dailyCounts(dates: Date[], now: Date, days: number, timeZone: string) {
  // en-CA formats as YYYY-MM-DD, which sorts and compares as a plain string.
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const label = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" })

  const buckets = new Map<string, { date: string; label: string; reports: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS)
    const k = key.format(d)
    buckets.set(k, { date: k, label: label.format(d), reports: 0 })
  }
  for (const d of dates) {
    const bucket = buckets.get(key.format(d))
    if (bucket) bucket.reports++
  }
  return [...buckets.values()]
}

/** Whole-percent change, or undefined when the previous period was empty. */
export function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined
  return Math.round(((current - previous) / previous) * 100)
}

export function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number")
  if (!nums.length) return null
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10
}

/** Busiest spots by report count. Repeat reports merged into one ticket still count. */
export function topLocations(
  tickets: { locationPath: string[]; reportCount: number }[],
  limit: number,
) {
  const totals = new Map<string, { name: string; parent: string; count: number }>()
  for (const t of tickets) {
    const k = t.locationPath.join("\u0000")
    const row = totals.get(k) ?? {
      name: t.locationPath.at(-1) ?? "Unknown",
      parent: t.locationPath.slice(0, -1).join(" › "),
      count: 0,
    }
    row.count += t.reportCount
    totals.set(k, row)
  }
  return [...totals.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

/** Every severity, most severe first, so the chart legend never reshuffles. */
export function severityBreakdown(severities: Severity[]) {
  return [...SEVERITIES].reverse().map((severity) => ({
    severity,
    count: severities.filter((s) => s === severity).length,
  }))
}

export function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  return "Good evening"
}
