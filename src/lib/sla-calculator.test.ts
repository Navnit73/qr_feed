// @vitest-environment node
import { describe, expect, it } from "vitest"
import { addBusinessMinutes, computeSlaStatus, DEFAULT_BUSINESS_HOURS } from "./sla-calculator"

describe("SLA due-date calculator (F-4.2 / T-SLA-1)", () => {
  it("adds exact clock minutes in 24x7 mode", () => {
    const start = new Date("2026-11-27T17:00:00.000Z")
    const due = addBusinessMinutes(start, 180, { mode: "24x7", timezone: "UTC" })
    expect(due.toISOString()).toBe("2026-11-27T20:00:00.000Z")
  })

  it("wraps across weekends in business_hours mode", () => {
    // 2026-11-27 is a Friday. 17:30 UTC with 09:00-18:00 Mon-Fri leaves 30 min Friday,
    // then 90 min Monday 09:00 -> Monday 2026-11-30 10:30 UTC.
    const fri = new Date("2026-11-27T17:30:00.000Z")
    const due = addBusinessMinutes(fri, 120, {
      mode: "business_hours",
      timezone: "UTC",
      businessHours: DEFAULT_BUSINESS_HOURS,
    })
    expect(due.toISOString()).toBe("2026-11-30T10:30:00.000Z")
  })

  it("skips holiday dates", () => {
    const fri = new Date("2026-11-27T17:30:00.000Z")
    const due = addBusinessMinutes(fri, 120, {
      mode: "business_hours",
      timezone: "UTC",
      businessHours: DEFAULT_BUSINESS_HOURS,
      holidays: ["2026-11-30"], // Monday is a holiday -> moves to Tuesday 2026-12-01
    })
    expect(due.toISOString()).toBe("2026-12-01T10:30:00.000Z")
  })

  it("honours branch timezone (Asia/Kolkata +05:30)", () => {
    // 2026-11-26 is Thursday. 12:00 UTC = 17:30 IST. Business hours 09:00-18:00 IST ->
    // 30 min left Thursday IST, remaining 60 min Friday 09:00-10:00 IST = 04:30 UTC.
    const thuUtc = new Date("2026-11-26T12:00:00.000Z")
    const due = addBusinessMinutes(thuUtc, 90, {
      mode: "business_hours",
      timezone: "Asia/Kolkata",
      businessHours: DEFAULT_BUSINESS_HOURS,
    })
    expect(due.toISOString()).toBe("2026-11-27T04:30:00.000Z")
  })

  it("classifies on_track, at_risk (>=80%), breached, paused and met", () => {
    const createdAt = new Date("2026-11-26T10:00:00.000Z")
    const dueAt = new Date("2026-11-26T11:40:00.000Z") // 100 min window

    expect(
      computeSlaStatus({
        createdAt,
        resolveDueAt: dueAt,
        now: new Date("2026-11-26T10:30:00.000Z"),
        pausedAt: null,
        resolvedAt: null,
        breached: false,
      }).state,
    ).toBe("on_track")

    expect(
      computeSlaStatus({
        createdAt,
        resolveDueAt: dueAt,
        now: new Date("2026-11-26T11:25:00.000Z"), // 85% elapsed
        pausedAt: null,
        resolvedAt: null,
        breached: false,
      }).state,
    ).toBe("at_risk")

    expect(
      computeSlaStatus({
        createdAt,
        resolveDueAt: dueAt,
        now: new Date("2026-11-26T11:45:00.000Z"),
        pausedAt: null,
        resolvedAt: null,
        breached: false,
      }).state,
    ).toBe("breached")

    expect(
      computeSlaStatus({
        createdAt,
        resolveDueAt: dueAt,
        now: new Date("2026-11-26T12:00:00.000Z"),
        pausedAt: new Date("2026-11-26T10:30:00.000Z"),
        resolvedAt: null,
        breached: false,
      }).state,
    ).toBe("paused")

    expect(
      computeSlaStatus({
        createdAt,
        resolveDueAt: dueAt,
        now: new Date("2026-11-26T12:00:00.000Z"),
        pausedAt: null,
        resolvedAt: new Date("2026-11-26T11:00:00.000Z"),
        breached: false,
      }).state,
    ).toBe("met")
  })
})
