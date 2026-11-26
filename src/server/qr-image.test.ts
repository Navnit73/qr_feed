// @vitest-environment node
import { describe, expect, it } from "vitest"
import { qrPng, qrSvg } from "@/server/qr-image"

describe("QR images", () => {
  const url = "https://app.example.com/f/abcdefghjk"

  it("renders a scalable SVG with a quiet zone", async () => {
    const svg = await qrSvg(url)
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/)
    expect(svg).toContain("viewBox")
  })

  it("renders a PNG", async () => {
    const png = await qrPng(url)
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
})
