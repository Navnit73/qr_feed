// @vitest-environment node
import { describe, expect, it } from "vitest"
import { timeAgo } from "@/lib/relative-time"

describe("timeAgo", () => {
  const now = new Date("2026-11-26T12:00:00Z").getTime()
  it("uses minutes, then hours, then days", () => {
    expect(timeAgo(new Date(now - 5 * 60_000), now)).toBe("5 min. ago")
    expect(timeAgo(new Date(now - 3 * 3_600_000), now)).toBe("3 hr. ago")
    expect(timeAgo(new Date(now - 4 * 86_400_000), now)).toBe("4 days ago")
  })
  it("says now for the current minute", () => {
    expect(timeAgo(new Date(now), now)).toBe("just now")
  })
})
