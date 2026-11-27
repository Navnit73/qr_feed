import { expect, test, type Page } from "@playwright/test"
import { navTo } from "./shell"

// End-to-end verification across Phases 2–10:
// i18n + RTL + photo upload -> ticket lifecycle -> verification queue -> requester feedback
// -> SLA policy -> RCA/CAPA -> standalone Audit -> Analytics -> Billing & Integrations -> Legal/Help.

const PASSWORD = "correct-horse-battery"
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true })

async function newOrgAdmin(page: Page) {
  const email = `e2e-full-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@qrfeed.test`
  await page.goto("/sign-up")
  await field(page, "Full name").fill("Asha Rao")
  await field(page, "Email").fill(email)
  await field(page, "Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL(/onboarding/)
  await field(page, "Organisation name").fill(`FullSuite ${Date.now()}`)
  await field(page, "Industry").selectOption("hospital")
  await field(page, "First branch").fill("Central Wing")
  await field(page, "Time zone").selectOption("Asia/Kolkata")
  await page.getByRole("button", { name: "Create organisation" }).click()
  await page.waitForURL(/dashboard/)
}

async function createLocationQr(page: Page) {
  await navTo(page, "Branches")
  await page.getByRole("link", { name: /Central Wing/ }).click()
  await page.getByRole("button", { name: "Add location" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Add location" })
  await dialog.getByLabel("Type").selectOption("location")
  await dialog.getByLabel("Name").fill("ICU Washroom")
  await dialog.getByRole("button", { name: "Add location" }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Create QR for ICU Washroom" }).click()
  await page.getByRole("button", { name: "QR code for ICU Washroom" }).click()
  const qrDialog = page.getByRole("dialog", { name: /QR code/ })
  const link = await qrDialog.getByLabel("Public link").inputValue()
  await page.keyboard.press("Escape")
  return new URL(link).pathname
}

test("guest i18n/RTL, full ticket lifecycle, verification queue and post-closure feedback", async ({
  page,
  browser,
}) => {
  await newOrgAdmin(page)
  const qrPath = await createLocationQr(page)

  // Guest opens QR on mobile, switches language to Arabic (RTL) then back to English and submits
  const guestCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  })
  const phone = await guestCtx.newPage()
  await phone.goto(qrPath)

  await phone.getByRole("button", { name: "العربية" }).click()
  await expect(phone.locator('[dir="rtl"]')).toBeVisible()
  await phone.getByRole("button", { name: "English" }).click()

  await phone.getByRole("radiogroup", { name: "What's it about?" }).getByText("Cleanliness").click()
  await phone
    .getByRole("radiogroup", { name: "How was it?" })
    .getByLabel("2 stars")
    .check({ force: true })
  await field(phone, "What happened?").fill("Floor needs mopping immediately")
  await phone.getByRole("checkbox", { name: /shared with the team/i }).check()
  await phone.getByRole("button", { name: "Send feedback" }).click()

  await expect(phone.getByTestId("ticket-number")).toBeVisible()
  const ticketNumber = (await phone.getByTestId("ticket-number").textContent())!.trim()
  const trackingUrl = phone.url()

  // Admin opens Tickets, checks Kanban toggle, opens detail page, runs full lifecycle
  await navTo(page, "Tickets")
  await page.getByRole("link", { name: "Kanban" }).click()
  await expect(page.getByRole("link", { name: ticketNumber }).first()).toBeVisible()
  await page.getByRole("link", { name: ticketNumber }).first().click()

  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(ticketNumber) }),
  ).toBeVisible()

  // Post a public remark
  await field(page, "Add a remark").fill("Housekeeping team is on the way.")
  await page.getByLabel("Public (visible on tracking link)").check()
  await page.getByRole("button", { name: "Post remark" }).click()
  await expect(page.getByText("Housekeeping team is on the way.").first()).toBeVisible()

  // Accept -> Start -> Submit for verification
  await page.getByRole("button", { name: "Accept" }).click()
  await expect(page.getByRole("button", { name: "Start work" })).toBeVisible()
  await page.getByRole("button", { name: "Start work" }).click()
  await expect(page.getByRole("button", { name: "Submit for verification" })).toBeVisible()
  await page.getByRole("button", { name: "Submit for verification" }).click()
  const submitDialog = page.getByRole("dialog", { name: "Submit for verification" })
  await submitDialog.getByLabel("Resolution summary").fill("Mopped dry and placed sign.")
  await submitDialog.getByRole("button", { name: "Confirm" }).click()
  await expect(submitDialog).toBeHidden()

  // Verifications queue -> Approve & close
  await navTo(page, "Verifications")
  await expect(page.getByRole("link", { name: ticketNumber })).toBeVisible()
  await page.getByRole("button", { name: /Approve & close/ }).click()
  await expect(page.getByText("Nothing waiting for verification")).toBeVisible()

  // Guest reloads tracking link: sees public update AND submits closure feedback
  await phone.goto(trackingUrl)
  await expect(phone.getByText("Housekeeping team is on the way.")).toBeVisible()
  await expect(phone.getByRole("heading", { name: "Was your issue resolved?" })).toBeVisible()
  await phone.getByRole("button", { name: "Submit feedback" }).click()
  await expect(phone.getByText("Thank you for rating the resolution.")).toBeVisible()

  await guestCtx.close()
})

test("RCA/CAPA, standalone audit, analytics, settings and launch pages work end to end", async ({
  page,
}) => {
  await newOrgAdmin(page)

  // Phase 4: SLA policy
  await navTo(page, "Settings")
  await page.getByRole("button", { name: "New SLA policy" }).click()
  const slaDlg = page.getByRole("dialog", { name: "New SLA policy" })
  await slaDlg.getByLabel("Policy name").fill("Hospital 24x7 SLA")
  await slaDlg.getByRole("button", { name: "Save policy" }).click()
  await expect(slaDlg).toBeHidden()
  await expect(page.getByText("Hospital 24x7 SLA")).toBeVisible()

  // Phase 6: RCA & CAPA
  await navTo(page, "RCA & CAPA")
  await page.getByRole("button", { name: "New RCA" }).click()
  const rcaDlg = page.getByRole("dialog", { name: "New Root Cause Analysis" })
  await rcaDlg.getByLabel("Title").fill("Recurring spill near lobby")
  await rcaDlg.getByLabel("Problem statement").fill("Water collects near the main entrance.")
  await rcaDlg.getByRole("button", { name: "Create RCA" }).click()
  await expect(page).toHaveURL(/\/rca\//)
  await expect(page.getByRole("heading", { level: 1, name: /RCA-/ })).toBeVisible()

  // Phase 7: Standalone Audit
  await navTo(page, "Audits")
  await page.getByRole("button", { name: "New template" }).click()
  const tplDlg = page.getByRole("dialog", { name: "New audit checklist template" })
  await tplDlg.getByLabel("Template name").fill("NABH Safety Walk")
  await tplDlg.getByLabel("Standard").fill("NABH")
  await tplDlg.getByRole("button", { name: "Save template" }).click()
  await expect(tplDlg).toBeHidden()
  await expect(page.getByText("NABH Safety Walk")).toBeVisible()

  // Phase 8: Reports & Analytics
  await navTo(page, "Reports")
  await expect(page.getByRole("heading", { level: 1, name: "Reports & Analytics" })).toBeVisible()
  await expect(page.getByText("SLA compliance", { exact: true })).toBeVisible()

  // Phase 9: Billing & Integrations
  await page.goto("/settings/billing")
  await expect(
    page.getByRole("heading", { level: 1, name: "Billing & Subscription" }),
  ).toBeVisible()
  // BUG-024: sub-pages keep the full Settings tab bar, with the current tab marked.
  const settingsNav = page.getByRole("navigation", { name: "Settings sections" })
  await expect(settingsNav.getByRole("link", { name: "Billing & Plan" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await expect(settingsNav.getByRole("link", { name: "SLA & Escalation" })).toBeVisible()
  await settingsNav.getByRole("link", { name: "Notifications" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Notification preferences" }),
  ).toBeVisible()
  await expect(
    page
      .getByRole("navigation", { name: "Settings sections" })
      .filter({ visible: true })
      .getByRole("link", { name: "Notifications" }),
  ).toHaveAttribute("aria-current", "page")
  await page.goto("/settings/billing")
  await page.getByRole("button", { name: "Switch to growth" }).click()
  await expect(page.getByText("Growth", { exact: true }).first()).toBeVisible()

  await page.goto("/settings/integrations")
  await expect(page.getByRole("heading", { level: 1, name: "API, Webhooks & SSO" })).toBeVisible()
  await page.getByRole("button", { name: "New API key" }).click()
  const keyDlg = page.getByRole("dialog", { name: "Create API key" })
  await keyDlg.getByLabel("Key name").fill("CI Test Key")
  await keyDlg.getByRole("button", { name: "Generate key" }).click()
  await expect(keyDlg.getByText(/SHA-256 hash/)).toBeVisible()
  await keyDlg.getByRole("button", { name: "Done" }).click()

  // Phase 10: Detailed health probe + Help & Legal pages load cleanly with no sideways overflow
  const healthRes = await page.request.get("/api/health?detail=1")
  expect(healthRes.status()).toBe(200)
  const healthJson = await healthRes.json()
  expect(healthJson.ok).toBe(true)
  expect(healthJson.data.db.ok).toBe(true)

  for (const path of ["/help", "/terms", "/privacy", "/dpa"]) {
    await page.goto(path)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow, `${path} must not scroll sideways`).toBe(false)
  }
})
