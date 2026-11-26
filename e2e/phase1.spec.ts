import { expect, test, type Page } from "@playwright/test"
import { mainNav, navTo, signOut } from "./shell"

// Phase 1 user journeys against a real server and a throwaway MongoDB (see playwright.config).
// Every test signs up its own user and organisation, so tests stay independent and parallel.

const PASSWORD = "correct-horse-battery"
// Next 16 keeps recently visited pages mounted but hidden (React <Activity>), so a form you
// left can still be in the DOM. Always target the visible field.
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true })
// Our form errors, not Next's route announcer (which also has role="alert").
const formError = (page: Page) =>
  page.getByRole("alert").filter({ hasText: /invalid|error|can't/i })

const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@qrfeed.test`

async function signUp(page: Page, email: string, name = "Asha Rao", next?: string) {
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up")
  await field(page, "Full name").fill(name)
  await field(page, "Email").fill(email)
  await field(page, "Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
}

async function createOrg(page: Page, orgName: string) {
  await expect(page).toHaveURL(/\/onboarding/)
  await field(page, "Organisation name").fill(orgName)
  await field(page, "Industry").selectOption("hotel")
  await field(page, "First branch").fill("Hotel Delhi")
  await field(page, "Time zone").selectOption("Asia/Kolkata")
  await page.getByRole("button", { name: "Create organisation" }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function newAdmin(page: Page, orgName = `Acme ${Date.now()}`) {
  const email = uniqueEmail("admin")
  await signUp(page, email)
  await createOrg(page, orgName)
  return { email, orgName }
}

test("signed-out visitors are sent to sign-in and returned afterwards", async ({ page }) => {
  await page.goto("/users")
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fusers/)
})

test("a new user signs up and creates their organisation", async ({ page }) => {
  const { orgName } = await newAdmin(page)
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()
  await expect(page.getByText(orgName).filter({ visible: true }).first()).toBeVisible()
  const nav = await mainNav(page)
  await expect(nav.getByRole("link", { name: "Branches" })).toBeVisible()
})

test("sign-in rejects a wrong password and accepts the right one", async ({ page }) => {
  const { email } = await newAdmin(page)
  await signOut(page)
  await field(page, "Email").fill(email)
  await field(page, "Password").fill("not-the-password")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(formError(page)).toContainText(/invalid email or password/i)
  await field(page, "Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/dashboard/)
})

test("an admin builds a branch's location tree", async ({ page }) => {
  await newAdmin(page)
  await navTo(page, "Branches")
  await page.getByRole("button", { name: "Add branch" }).click()
  const branchDialog = page.getByRole("dialog", { name: "Add branch" })
  await branchDialog.getByLabel("Branch name").fill("Hotel Mumbai")
  await branchDialog.getByLabel("Time zone").selectOption("Asia/Kolkata")
  await branchDialog.getByRole("button", { name: "Add branch" }).click()
  await expect(branchDialog).toBeHidden()

  await page.getByRole("link", { name: /Hotel Mumbai/ }).click()
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Hotel Mumbai")

  await page.getByRole("button", { name: "Add location" }).first().click()
  let dialog = page.getByRole("dialog", { name: "Add location" })
  await dialog.getByLabel("Type").selectOption("floor")
  await dialog.getByLabel("Name").fill("Floor 2")
  await dialog.getByRole("button", { name: "Add location" }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Add location" }).first().click()
  dialog = page.getByRole("dialog", { name: "Add location" })
  await dialog.getByLabel("Inside").selectOption({ label: "Floor 2" })
  await dialog.getByLabel("Type").selectOption("location")
  await dialog.getByLabel("Name").fill("Washroom F2")
  await dialog.getByRole("button", { name: "Add location" }).click()
  await expect(dialog).toBeHidden()

  const tree = page.getByRole("list", { name: "Locations" })
  const floor = tree.getByRole("listitem").filter({ hasText: "Floor 2" }).first()
  await expect(floor).toContainText("Washroom F2")
})

test("an invited teammate joins with only the access they were given", async ({ page }) => {
  const { orgName } = await newAdmin(page)
  const staffEmail = uniqueEmail("staff")

  await navTo(page, "Users")
  await page.getByRole("button", { name: "Invite people" }).click()
  const dialog = page.getByRole("dialog", { name: "Invite people" })
  await dialog.getByLabel("Email").fill(staffEmail)
  await dialog.getByRole("checkbox", { name: /^L1 staff/ }).check()
  await dialog.getByRole("checkbox", { name: /Hotel Delhi/ }).check()
  await dialog.getByRole("button", { name: "Send invite" }).click()
  const link = await dialog.getByLabel("Invite link").inputValue()
  expect(link).toMatch(/\/invite\//)
  await page.keyboard.press("Escape")
  await expect(page.getByText(staffEmail)).toBeVisible()

  await signOut(page)
  const invitePath = new URL(link).pathname
  await page.goto(invitePath)
  await expect(page.getByRole("heading", { name: `Join ${orgName}` })).toBeVisible()
  await page.getByRole("link", { name: "Create account" }).click()
  await field(page, "Full name").fill("Ravi Kumar")
  await field(page, "Email").fill(staffEmail)
  await field(page, "Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(new RegExp(invitePath))
  await page.getByRole("button", { name: "Accept invite" }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  const nav = await mainNav(page)
  await expect(nav.getByRole("link", { name: "Branches" })).toBeVisible()
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0)
})

test("the audit log records actions and verifies its hash chain", async ({ page }) => {
  await newAdmin(page)
  await navTo(page, "Audit log")
  await expect(page.getByText("Chain verified")).toBeVisible()
  for (const action of ["tenant.created", "branch.created", "member.added"]) {
    await expect(page.getByRole("cell", { name: action })).toBeVisible()
  }
})

test("the super admin can suspend a tenant, which locks its members out", async ({
  page,
  browser,
}, testInfo) => {
  const { orgName } = await newAdmin(page)

  const superPage = await (await browser.newContext()).newPage()
  // One super admin per project (see SUPER_ADMIN_EMAILS in playwright.config), so parallel
  // projects don't race to create the same account. It may already exist from a retry.
  const superEmail = `super-${testInfo.project.name}@qrfeed.test`
  await superPage.goto("/sign-in")
  await field(superPage, "Email").fill(superEmail)
  await field(superPage, "Password").fill(PASSWORD)
  await superPage.getByRole("button", { name: "Sign in" }).click()
  // First run: no account yet, so sign-in fails and we sign up instead.
  await Promise.race([
    superPage.waitForURL(/\/(dashboard|onboarding)/),
    formError(superPage).waitFor(),
  ])
  if (new URL(superPage.url()).pathname === "/sign-in") {
    await signUp(superPage, superEmail, "Platform Owner")
    await superPage.waitForURL(/\/onboarding/)
  }
  await superPage.goto("/super")
  const row = superPage.getByRole("row").filter({ hasText: orgName })
  await row.getByRole("button", { name: "Suspend" }).click()
  await superPage
    .getByRole("alertdialog", { name: `Suspend ${orgName}?` })
    .getByRole("button", { name: "Suspend" })
    .click()
  await expect(row.getByText("suspended")).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/onboarding/)
})

test("app pages never scroll sideways", async ({ page }) => {
  await newAdmin(page)
  for (const path of ["/dashboard", "/branches", "/users", "/audit-log"]) {
    await page.goto(path)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})

// BUG-005: submitting before hydration fell back to a native GET and put the password in the
// URL (history, proxy and server logs). Simulate a slow phone: the HTML streams in, but the
// React bundles never arrive, so the form is visible yet not hydrated.
test.describe("before the page is interactive", () => {
  for (const path of ["/sign-in", "/sign-up"]) {
    test(`${path} never puts credentials in the URL`, async ({ page }) => {
      await page.route("**/_next/static/chunks/**", (route) => route.abort())
      await page.goto(path)
      if (path === "/sign-up") await page.getByLabel("Full name", { exact: true }).fill("Leaky")
      await page.getByLabel("Email", { exact: true }).fill("leak@qrfeed.test")
      await page.getByLabel("Password", { exact: true }).fill("do-not-leak-me")
      await page.getByLabel("Password", { exact: true }).press("Enter")
      await page.waitForTimeout(500)
      expect(page.url()).not.toContain("do-not-leak-me")
      expect(page.url()).not.toContain("leak%40qrfeed.test")
    })
  }
})
