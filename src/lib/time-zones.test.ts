// @vitest-environment node
import { describe, expect, it } from "vitest"
import { modernTimeZone, timeZoneOptions } from "@/lib/time-zones"

// BUG-002: ICU lists legacy zone names (Asia/Calcutta), so "Asia/Kolkata" was missing from the
// time-zone picker and Indian tenants couldn't find their zone.
describe("timeZoneOptions()", () => {
  const zones = timeZoneOptions()

  it("uses current IANA names, not legacy aliases", () => {
    for (const modern of ["Asia/Kolkata", "Asia/Kathmandu", "Asia/Ho_Chi_Minh", "Europe/Kyiv"]) {
      expect(zones).toContain(modern)
    }
    for (const legacy of ["Asia/Calcutta", "Asia/Katmandu", "Asia/Saigon", "Europe/Kiev"]) {
      expect(zones).not.toContain(legacy)
    }
  })

  it("includes UTC, has no duplicates and is sorted", () => {
    expect(zones).toContain("UTC")
    expect(new Set(zones).size).toBe(zones.length)
    expect([...zones].sort()).toEqual(zones)
  })

  it("only lists zones the runtime accepts", () => {
    for (const z of zones)
      expect(() => new Intl.DateTimeFormat("en", { timeZone: z })).not.toThrow()
  })

  it("maps a browser's legacy zone to the listed modern one", () => {
    expect(modernTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata")
    expect(modernTimeZone("Europe/London")).toBe("Europe/London")
  })
})
