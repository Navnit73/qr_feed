import { expect, test, type Page } from "@playwright/test"
import { mainNav, navTo, signOut } from "./shell"

// The signed-in shell (sidebar, drawer, account menu) and the dashboard's first-run state.

const PASSWORD = "correct-horse-battery"
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true })

async function newAdmin(page: Page) {
  const email = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@qrfeed.test`
  await page.goto("/sign-up")
  await field(page, "Full name").fill("Asha Rao")
  await field(page, "Email").fill(email)
  await field(page, "Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL(/onboarding/)
  await field(page, "Organisation name").fill(`Lakeside ${Date.now()}`)
  await field(page, "Industry").selectOption("hospital")
  await field(page, "First branch").fill("Pune")
  await field(page, "Time zone").selectOption("Asia/Kolkata")
  await page.getByRole("button", { name: "Create organisation" }).click()
  await page.waitForURL(/dashboard/)
}

test("the dashboard shows KPIs, panels and the setup checklist", async ({ page }) => {
  await newAdmin(page)
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()
  await expect(page.getByText(/Asha\. Here’s what’s happening at Lakeside/)).toBeVisible()

  for (const label of ["Open tickets", "New this week", "Average rating", "Active QR codes"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole("figure", { name: "New tickets per day" })).toBeVisible()
  await expect(page.getByText("No open tickets. All clear.")).toBeVisible()

  const setup = page.getByRole("region", { name: "Finish setting up" })
  await expect(setup).toContainText("1 of 5 done")
  await setup.getByRole("link", { name: "Invite" }).click()
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible()
})

test("the main nav marks the current page and works on every screen size", async ({ page }) => {
  await newAdmin(page)
  const nav = await mainNav(page)
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page")
  await nav.getByRole("link", { name: "Tickets" }).click()
  await expect(page.getByRole("heading", { name: "Tickets", level: 1 })).toBeVisible()
  // The drawer closes itself after navigating.
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden()

  await navTo(page, "Branches")
  await signOut(page)
})
