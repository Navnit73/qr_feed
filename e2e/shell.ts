import { expect, type Page } from "@playwright/test"

/*
 * The signed-in shell: a sidebar on desktop, a drawer behind "Open menu" on phones.
 * These helpers work on both Playwright projects.
 */

/** The main nav, opening the mobile drawer first when the sidebar is hidden. */
export async function mainNav(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" })
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true })
  // Wait for the Suspense shell to stream in before branching on mobile vs desktop.
  await expect(menu.or(nav)).toBeVisible()
  if (await menu.isVisible()) await menu.click()
  await expect(nav).toBeVisible()
  return nav
}

export async function navTo(page: Page, label: string) {
  await (await mainNav(page)).getByRole("link", { name: label }).click()
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible()
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/sign-in/)
}
