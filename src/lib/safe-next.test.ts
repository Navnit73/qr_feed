// @vitest-environment node
import { describe, expect, it } from "vitest"
import { safeNext } from "@/lib/safe-next"

describe("safeNext()", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/invite/abc?x=1", "/dashboard")).toBe("/invite/abc?x=1")
  })

  it.each([
    "https://evil.test",
    "//evil.test/path",
    "/\\evil.test",
    "javascript:alert(1)",
    "dashboard",
    "",
    null,
    undefined,
  ])("falls back for %s", (value) => {
    expect(safeNext(value, "/dashboard")).toBe("/dashboard")
  })
})
