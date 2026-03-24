/**
 * Playwright configuration for PWA E2E testing.
 *
 * Extends the shared config with PWA-specific projects for:
 * - Offline behavior testing per browser
 * - Service worker lifecycle testing
 * - Install prompt simulation
 *
 * Usage:
 *   pnpm exec playwright test                              # All projects
 *   pnpm exec playwright test --project=chromium            # Standard Chrome
 *   pnpm exec playwright test --project=pwa-offline         # Offline tests (Chrome)
 *   pnpm exec playwright test --project=pwa-offline-firefox # Offline tests (Firefox)
 *   pnpm exec playwright test --project=pwa-offline-webkit  # Offline tests (Safari)
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
    // --- Standard Desktop Browsers ---
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

    // --- PWA Offline Tests (per browser) ---
    {
      name: "pwa-offline",
      testMatch: "**/pwa-*.e2e.ts",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "allow",
      },
    },
    {
      name: "pwa-offline-firefox",
      testMatch: "**/pwa-*.e2e.ts",
      use: {
        ...devices["Desktop Firefox"],
        serviceWorkers: "allow",
      },
    },
    {
      name: "pwa-offline-webkit",
      testMatch: "**/pwa-*.e2e.ts",
      use: {
        ...devices["Desktop Safari"],
        serviceWorkers: "allow",
      },
    },

    // --- Service Worker Lifecycle (Chrome only — best SW debugging support) ---
    {
      name: "sw-lifecycle",
      testMatch: "**/sw-lifecycle.e2e.ts",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "allow",
      },
    },
  ],
});
