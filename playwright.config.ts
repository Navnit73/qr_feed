import { defineConfig, devices } from "@playwright/test"

// A dedicated port so tests never hit another project's dev server on 3000.
const PORT = Number(process.env.E2E_PORT || 3210)
const baseURL = `http://localhost:${PORT}`
const MONGO_PORT = 27999

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // A throwaway in-memory MongoDB replica set, so e2e never touches real data.
      command: "pnpm exec tsx scripts/e2e-db.mts",
      port: MONGO_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Tests run against a production build. That matches what ships, and it can run beside
      // your own `pnpm dev`: Next allows only one dev server per project folder.
      command: `pnpm build && pnpm start -p ${PORT}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        MONGODB_URI: `mongodb://127.0.0.1:${MONGO_PORT}/?replicaSet=rs0`,
        MONGODB_DB: "qr_feed_e2e",
        BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-use-0123456789",
        BETTER_AUTH_URL: baseURL,
        SUPER_ADMIN_EMAILS: "super-desktop@qrfeed.test,super-mobile@qrfeed.test",
        AUTH_RATE_LIMIT: "off",
        INTAKE_RATE_LIMIT: "off",
      },
    },
  ],
})
