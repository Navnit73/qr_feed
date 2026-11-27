// @vitest-environment node
import { describe, expect, it } from "vitest"
import { iconNames } from "@/components/icons"
import { categoryIcon } from "./category-icon"

describe("categoryIcon", () => {
  it("gives the common category keys their own icon", () => {
    expect(categoryIcon("cleanliness")).toBe("cleaning")
    expect(categoryIcon("waiting_time")).toBe("clock")
    expect(categoryIcon("billing")).toBe("billing")
  })

  it("falls back to a generic feedback icon for unknown keys", () => {
    expect(categoryIcon("something_new")).toBe("feedback")
  })

  it("only returns registered icon names", () => {
    for (const key of ["cleanliness", "patient_care", "safety", "food", "wifi", "other", "x"]) {
      expect(iconNames).toContain(categoryIcon(key))
    }
  })
})
