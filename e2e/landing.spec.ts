import { expect, test } from "@playwright/test"

// The public homepage explains the product and shows honest build progress.
test.describe("homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("says what the product does and how to start", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("resolved ticket")
    const cta = page.getByRole("link", { name: "Create free account" }).first()
    await expect(cta).toHaveAttribute("href", "/sign-up")
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
      "href",
      "/sign-in",
    )
  })

  test("walks through the loop from scan to verified fix", async ({ page }) => {
    const how = page.getByRole("region", { name: "How it works" })
    for (const step of ["Scan", "Ticket", "Escalate", "Fix", "Verify"]) {
      await expect(how.getByRole("heading", { name: new RegExp(`^${step}`) })).toBeVisible()
    }
  })

  test("shows the roadmap with each phase's status", async ({ page }) => {
    const roadmap = page.getByRole("region", { name: "Roadmap" })
    await expect(roadmap.getByRole("listitem")).toHaveCount(11)
    await expect(
      roadmap.getByRole("listitem").filter({ hasText: "QR & public feedback" }),
    ).toContainText(/in progress|done/i)
  })

  test("previews the public feedback form a guest sees", async ({ page }) => {
    await expect(page.getByRole("figure", { name: /feedback form preview/i })).toBeVisible()
  })

  test("never scrolls sideways", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("design system still lives at /design", async ({ page }) => {
    await page.goto("/design")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lime for action")
  })
})
