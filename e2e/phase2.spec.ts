import { expect, test, type Browser, type Page } from "@playwright/test"

// Phase 2 exit criterion: scan a QR on a phone → the ticket appears in the admin list.
// Admins work on the current device; guests always use a fresh phone-sized context.

const PASSWORD = "correct-horse-battery"
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true })

async function adminWithRoom(page: Page) {
  const email = `p2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@qrfeed.test`
  await page.goto("/sign-up")
  await field(page, "Full name").fill("Asha Rao")
  await field(page, "Email").fill(email)
  await field(page, "Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL(/onboarding/)
  const orgName = `Sunrise ${Date.now()}`
  await field(page, "Organisation name").fill(orgName)
  await field(page, "Industry").selectOption("hotel")
  await field(page, "First branch").fill("Hotel Delhi")
  await field(page, "Time zone").selectOption("Asia/Kolkata")
  await page.getByRole("button", { name: "Create organisation" }).click()
  await page.waitForURL(/dashboard/)

  await page.goto("/branches")
  await page.getByRole("link", { name: /Hotel Delhi/ }).click()
  await page.getByRole("button", { name: "Add location" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Add location" })
  await dialog.getByLabel("Type").selectOption("location")
  await dialog.getByLabel("Name").fill("Lobby washroom")
  await dialog.getByRole("button", { name: "Add location" }).click()
  await expect(dialog).toBeHidden()
  return { orgName }
}

/** Creates the room's QR and returns its public link, as an admin would copy it. */
async function createQr(page: Page) {
  await page.getByRole("button", { name: "Create QR for Lobby washroom" }).click()
  await page.getByRole("button", { name: "QR code for Lobby washroom" }).click()
  const dialog = page.getByRole("dialog", { name: /QR code/ })
  await expect(dialog.getByRole("img", { name: /QR code for/ })).toBeVisible()
  const link = await dialog.getByLabel("Public link").inputValue()
  await page.keyboard.press("Escape")
  return new URL(link).pathname
}

async function guest(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  return ctx.newPage()
}

async function report(page: Page, category: string, text: string) {
  await page.getByRole("radiogroup", { name: "What's it about?" }).getByText(category).click()
  await page
    .getByRole("radiogroup", { name: "How was it?" })
    .getByLabel("2 stars")
    .check({ force: true })
  await field(page, "What happened?").fill(text)
  await page.getByRole("checkbox", { name: /shared with the team/i }).check()
  await page.getByRole("button", { name: "Send feedback" }).click()
}

test("a guest scans a QR, reports an issue, and the admin sees the ticket", async ({
  page,
  browser,
}) => {
  const { orgName } = await adminWithRoom(page)
  const path = await createQr(page)

  const phone = await guest(browser)
  await phone.goto(path)
  await expect(phone.getByRole("heading", { level: 1, name: "Lobby washroom" })).toBeVisible()
  await expect(phone.getByText(orgName)).toBeVisible()
  await report(phone, "Housekeeping", "No towels and the bin is overflowing")

  await expect(phone.getByRole("heading", { name: /thanks/i })).toBeVisible()
  const number = (await phone.getByTestId("ticket-number").textContent())!.trim()
  expect(number).toMatch(/^TKT-\d{4}-000001$/)
  await expect(phone.getByText("Received").first()).toBeVisible()

  // The tracking link keeps working on its own.
  await phone.reload()
  await expect(phone.getByTestId("ticket-number")).toHaveText(number)

  await page.goto("/tickets")
  const row = page.getByRole("row").filter({ hasText: number })
  await expect(row).toContainText("Lobby washroom")
  await expect(row).toContainText("Housekeeping")
})

test("a second report of the same issue joins the open ticket", async ({ page, browser }) => {
  await adminWithRoom(page)
  const path = await createQr(page)

  const first = await guest(browser)
  await first.goto(path)
  await report(first, "Housekeeping", "Bin overflowing")
  const number = (await first.getByTestId("ticket-number").textContent())!.trim()

  const second = await guest(browser)
  await second.goto(path)
  await report(second, "Housekeeping", "Still overflowing")
  await expect(second.getByText(/already reported/i)).toBeVisible()
  await expect(second.getByTestId("ticket-number")).toHaveText(number)
})

test("the form explains what's missing instead of sending a blank report", async ({
  page,
  browser,
}) => {
  await adminWithRoom(page)
  const path = await createQr(page)
  const phone = await guest(browser)
  await phone.goto(path)
  await phone.getByRole("button", { name: "Send feedback" }).click()
  await expect(phone.getByText("Choose what the issue is about")).toBeVisible()
})

test("a revoked QR code tells the guest it no longer works", async ({ page, browser }) => {
  await adminWithRoom(page)
  const path = await createQr(page)
  await page.getByRole("button", { name: "QR code for Lobby washroom" }).click()
  await page
    .getByRole("dialog", { name: /QR code/ })
    .getByRole("button", { name: "Revoke" })
    .click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click()
  await expect(page.getByRole("button", { name: "Create QR for Lobby washroom" })).toBeVisible()

  const phone = await guest(browser)
  await phone.goto(path)
  await expect(phone.getByRole("heading", { name: /no longer active/i })).toBeVisible()
})

test("admins can print a labelled QR sheet for a branch", async ({ page }) => {
  await adminWithRoom(page)
  await page.getByRole("button", { name: "Generate QR codes" }).click()
  await expect(page.getByRole("button", { name: "QR code for Lobby washroom" })).toBeVisible()
  await page.getByRole("link", { name: "Print QR sheet" }).click()
  await expect(page.getByRole("heading", { name: /QR codes/ })).toBeVisible()
  const label = page.getByRole("listitem").filter({ hasText: "Lobby washroom" })
  await expect(label.getByRole("img", { name: /QR code for/ })).toBeVisible()
})
