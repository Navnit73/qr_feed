import { expect, test, type Locator } from "@playwright/test"

test.describe("design system page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design")
  })

  test("renders the hero and every section", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lime for action")
    for (const name of ["Semantic colours", "Buttons", "Badges", "Alerts", "Cards & forms"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible()
    }
  })

  test("primary button uses lime-600 and secondary uses amber-400", async ({ page }) => {
    const bg = (locator: Locator) =>
      locator.first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const button = (name: string) => page.getByRole("button", { name, exact: true })
    // Compare against the raw palette swatches rendered on the same page.
    expect(await bg(button("Primary"))).toBe(await bg(page.getByTitle("bg-lime-600")))
    expect(await bg(button("Secondary"))).toBe(await bg(page.getByTitle("bg-amber-400")))
  })

  test("colours outside the palette compile to nothing", async ({ page }) => {
    const bg = await page.evaluate(() => {
      const el = document.createElement("div")
      el.className = "bg-blue-500"
      document.body.append(el)
      return getComputedStyle(el).backgroundColor
    })
    expect(bg).toBe("rgba(0, 0, 0, 0)")
  })

  test("page never scrolls sideways", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("theme toggle switches to a black background", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle dark mode" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)")
  })

  test("keyboard focus is always visible", async ({ page }) => {
    // Plain elements get the global 2px outline; shadcn controls swap it for a lime ring (box-shadow).
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab")
      const focus = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement as Element)
        return { outline: s.outlineStyle, width: parseFloat(s.outlineWidth), ring: s.boxShadow }
      })
      const hasOutline = focus.outline !== "none" && focus.width >= 2
      const hasRing = focus.ring !== "none"
      expect(hasOutline || hasRing, JSON.stringify(focus)).toBe(true)
    }
  })
})

test("home page loads without console errors", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()))
  // Uncaught exceptions arrive as pageerror, not as console messages.
  page.on("pageerror", (err) => errors.push(err.message))
  const res = await page.goto("/")
  expect(res?.status()).toBe(200)
  expect(errors).toEqual([])
})
