import { expect, test } from "@playwright/test"

// Behaviour of the reusable kit in a real browser: focus, portals, layout and SVG,
// the parts jsdom can't show. Unit specs next to each component cover the logic.
test.describe("component kit on /design", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design")
  })

  test("shows a section for every reusable component", async ({ page }) => {
    for (const name of [
      "Icons",
      "Stat cards",
      "Empty states",
      "Breadcrumbs",
      "Dialogs & alerts",
      "Charts",
      "API responses",
    ]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
    }
  })

  test("modal traps focus, closes on Escape and returns focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Add location" })
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "Add location" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Location name")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("sweet alert confirms, runs the action, then reports success", async ({ page }) => {
    await page.getByRole("button", { name: "Delete branch" }).click()
    const ask = page.getByRole("alertdialog", { name: "Delete Hotel Delhi?" })
    await expect(ask).toBeVisible()
    await ask.getByRole("button", { name: "Delete" }).click()
    const done = page.getByRole("alertdialog", { name: "Branch deleted" })
    await expect(done).toBeVisible()
    await done.getByRole("button", { name: "OK" }).click()
    await expect(done).toBeHidden()
  })

  test("sweet alert cancel leaves things as they were", async ({ page }) => {
    await page.getByRole("button", { name: "Delete branch" }).click()
    await page.getByRole("button", { name: "Keep it" }).click()
    await expect(page.getByRole("alertdialog")).toBeHidden()
  })

  test("breadcrumbs mark the current page", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Breadcrumb" }).first()
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible()
    await expect(nav.locator("[aria-current=page]")).toHaveText("Washroom F2")
  })

  test("charts draw SVG in the brand colours", async ({ page }) => {
    const figure = page.getByRole("figure", { name: "Tickets this week" })
    await expect(figure.locator("svg.recharts-surface").first()).toBeVisible()
    // The first series uses --chart-1, which is rose-600 in light mode, like the swatch.
    const stroke = await figure
      .locator(".recharts-area-curve")
      .first()
      .evaluate((el) => getComputedStyle(el).stroke)
    const rose = await page
      .getByTitle("bg-rose-600")
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(stroke).toBe(rose)
  })
})

test.describe("API envelope", () => {
  test("health route returns the success envelope", async ({ request }) => {
    const res = await request.get("/api/health")
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: { status: "ok" } })
  })
})
