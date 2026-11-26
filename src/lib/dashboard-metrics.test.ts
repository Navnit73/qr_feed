// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  average,
  dailyCounts,
  greeting,
  percentChange,
  severityBreakdown,
  topLocations,
} from "@/lib/dashboard-metrics"

describe("dailyCounts", () => {
  const now = new Date("2026-11-26T10:00:00Z")

  it("returns one bucket per day, oldest first, ending today", () => {
    const rows = dailyCounts([], now, 3, "UTC")
    expect(rows.map((r) => r.date)).toEqual(["2026-11-24", "2026-11-25", "2026-11-26"])
    expect(rows.every((r) => r.reports === 0)).toBe(true)
    expect(rows[2].label).toBe("26 Nov")
  })

  it("counts each date into its day and ignores dates outside the window", () => {
    const rows = dailyCounts(
      [
        new Date("2026-11-26T01:00:00Z"),
        new Date("2026-11-26T09:00:00Z"),
        new Date("2026-11-24T23:00:00Z"),
        new Date("2026-11-01T00:00:00Z"),
      ],
      now,
      3,
      "UTC",
    )
    expect(rows.map((r) => r.reports)).toEqual([1, 0, 2])
  })

  it("buckets by the given time zone, not UTC", () => {
    // 20:00 UTC on the 25th is 01:30 on the 26th in India.
    const rows = dailyCounts([new Date("2026-11-25T20:00:00Z")], now, 2, "Asia/Kolkata")
    expect(rows.map((r) => r.reports)).toEqual([0, 1])
  })
})

describe("percentChange", () => {
  it("is the rounded change against the previous period", () => {
    expect(percentChange(12, 10)).toBe(20)
    expect(percentChange(5, 10)).toBe(-50)
    expect(percentChange(10, 3)).toBe(233)
  })

  it("is undefined when there is nothing to compare with", () => {
    expect(percentChange(4, 0)).toBeUndefined()
  })
})

describe("average", () => {
  it("rounds to one decimal and ignores nulls", () => {
    expect(average([5, 4, null, 4])).toBe(4.3)
  })
  it("is null for no values", () => {
    expect(average([null])).toBeNull()
  })
})

describe("topLocations", () => {
  it("sums reports per location path and keeps the busiest first", () => {
    const top = topLocations(
      [
        { locationPath: ["Main", "Ward A"], reportCount: 1 },
        { locationPath: ["Main", "Ward B"], reportCount: 3 },
        { locationPath: ["Main", "Ward A"], reportCount: 1 },
        { locationPath: ["OPD", "Pharmacy"], reportCount: 1 },
      ],
      2,
    )
    expect(top).toEqual([
      { name: "Ward B", parent: "Main", count: 3 },
      { name: "Ward A", parent: "Main", count: 2 },
    ])
  })
})

describe("severityBreakdown", () => {
  it("counts every severity, highest first, including zeros", () => {
    expect(severityBreakdown(["low", "high", "high", "critical"])).toEqual([
      { severity: "critical", count: 1 },
      { severity: "high", count: 2 },
      { severity: "medium", count: 0 },
      { severity: "low", count: 1 },
    ])
  })
})

describe("greeting", () => {
  it("follows the time of day", () => {
    expect(greeting(6)).toBe("Good morning")
    expect(greeting(13)).toBe("Good afternoon")
    expect(greeting(19)).toBe("Good evening")
    expect(greeting(2)).toBe("Good evening")
  })
})
