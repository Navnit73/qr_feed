// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ROADMAP } from "@/lib/roadmap"

describe("ROADMAP", () => {
  it("lists phases P0 to P10 in order", () => {
    expect(ROADMAP.map((p) => p.id)).toEqual(Array.from({ length: 11 }, (_, i) => `P${i}`))
  })

  it("never marks a phase done before an earlier one", () => {
    const firstUnfinished = ROADMAP.findIndex((p) => p.status !== "done")
    const doneLater = ROADMAP.slice(firstUnfinished).some((p) => p.status === "done")
    expect(doneLater).toBe(false)
  })

  it("gives every phase a title and a one-line summary", () => {
    for (const p of ROADMAP) {
      expect(p.title.length).toBeGreaterThan(3)
      expect(p.summary.length).toBeGreaterThan(10)
    }
  })
})
