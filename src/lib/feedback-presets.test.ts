// @vitest-environment node
import { describe, expect, it } from "vitest"
import { FEEDBACK_PRESETS, SEVERITIES } from "@/lib/feedback-presets"

const INDUSTRIES = ["hospital", "clinic", "hotel", "mall", "manufacturing", "other"] as const

describe("FEEDBACK_PRESETS", () => {
  it.each(INDUSTRIES)("gives %s a usable category list ending in Other", (industry) => {
    const list = FEEDBACK_PRESETS[industry]
    expect(list.length).toBeGreaterThanOrEqual(4)
    expect(list.length).toBeLessThanOrEqual(9)
    expect(list.at(-1)?.key).toBe("other")
    expect(new Set(list.map((c) => c.key)).size).toBe(list.length)
    for (const c of list) expect(SEVERITIES).toContain(c.defaultSeverity)
  })

  it("treats safety categories as high severity by default", () => {
    const safety = Object.values(FEEDBACK_PRESETS)
      .flat()
      .filter((c) => /safety|hazard/i.test(c.label))
    expect(safety.length).toBeGreaterThan(0)
    for (const c of safety) expect(c.defaultSeverity).toBe("high")
  })
})
