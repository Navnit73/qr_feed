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

  it("converges accurately across DST transitions in negative and positive offset zones", () => {
    // America/Los_Angeles springs forward Sunday 2026-03-08 02:00 -> 03:00 (PST -08 -> PDT -07).
    // Friday 2026-03-06 17:30 PST = 2026-03-07T01:30:00Z. +60m -> 30m Fri + 30m Mon 09:30 PDT = 16:30Z.
    const laFri = new Date("2026-03-07T01:30:00.000Z")
    const laDue = addBusinessMinutes(laFri, 60, {
      mode: "business_hours",
      timezone: "America/Los_Angeles",
      businessHours: DEFAULT_BUSINESS_HOURS,
    })
    expect(laDue.toISOString()).toBe("2026-03-09T16:30:00.000Z")

    // Pacific/Auckland (+13 NZDT in March -> +12 NZST in April).
    // Friday 2026-04-03 17:30 NZDT = 2026-04-03T04:30:00Z. DST ends Sunday 2026-04-05.
    // +60m -> 30m Fri + 30m Mon 09:30 NZST (+12) = 2026-04-05T21:30:00Z.
    const nzFri = new Date("2026-04-03T04:30:00.000Z")
    const nzDue = addBusinessMinutes(nzFri, 60, {
      mode: "business_hours",
      timezone: "Pacific/Auckland",
      businessHours: DEFAULT_BUSINESS_HOURS,
    })
    expect(nzDue.toISOString()).toBe("2026-04-05T21:30:00.000Z")
  })

  it("reports a sensible label when breached is flagged before resolveDueAt", () => {
    const createdAt = new Date("2026-11-26T10:00:00.000Z")
    const res = computeSlaStatus({
      createdAt,
      resolveDueAt: new Date("2026-11-26T15:00:00.000Z"),
      now: new Date("2026-11-26T11:00:00.000Z"),
      pausedAt: null,
      resolvedAt: null,
      breached: true,
    })
    expect(res.state).toBe("breached")
    expect(res.label).toContain("Breached")
    expect(res.label).not.toContain("overdue")
  })
})
