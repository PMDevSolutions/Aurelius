/**
 * Shared Playwright configuration for cross-browser E2E testing.
 *
 * Supports web apps and PWAs across Chromium, Firefox, and WebKit.
 * Chrome extensions use a separate config (playwright.chrome-ext.config.ts).
 *
 * Usage:
 *   pnpm exec playwright test                           # All browsers
 *   pnpm exec playwright test --project=chromium        # Chrome only
 *   pnpm exec playwright test --project=firefox         # Firefox only
 *   pnpm exec playwright test --project=webkit          # Safari only
 *   pnpm exec playwright test --project=mobile-chrome   # Mobile Chrome
 *   pnpm exec playwright test --project=mobile-safari   # Mobile Safari
 */

import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !CI,
    timeout: 30_000,
  },

  projects: [
    // --- Desktop Browsers ---
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    // --- Mobile Browsers ---
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
