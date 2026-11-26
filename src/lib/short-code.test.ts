// @vitest-environment node
import { describe, expect, it } from "vitest"
import { generateShortCode, isShortCode } from "@/lib/short-code"

describe("generateShortCode()", () => {
  it("makes 10 characters from an alphabet with no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShortCode()
      expect(code).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/)
    }
  })

  it("doesn't repeat in practice", () => {
    const codes = new Set(Array.from({ length: 5000 }, generateShortCode))
    expect(codes.size).toBe(5000)
  })
})

describe("isShortCode()", () => {
  it("accepts generated codes and rejects anything else", () => {
    expect(isShortCode(generateShortCode())).toBe(true)
    for (const bad of ["", "abc", "ABCDEFGHJK", "0123456789", "abcdefghjk/", "abcdefghjkm"]) {
      expect(isShortCode(bad), bad).toBe(false)
    }
  })
})
