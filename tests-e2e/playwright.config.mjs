// Playwright config for BLS Prime E2E QA.
// Run:  npx playwright test --config tests-e2e/playwright.config.mjs
// Env:
//   BLS_E2E_BASE_URL   (default https://www.blsprime.com)
//   BLS_E2E_EMAIL / BLS_E2E_PASSWORD  (existing test account, required for workspace specs)
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BLS_E2E_BASE_URL || "https://www.blsprime.com",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
