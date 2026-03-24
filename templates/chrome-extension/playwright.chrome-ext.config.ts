/**
 * Playwright configuration for Chrome Extension E2E testing.
 *
 * Chrome extensions require a persistent browser context with the extension
 * loaded via --load-extension flag. This means:
 * - Only Chromium is supported (Firefox/WebKit don't support --load-extension)
 * - Headless mode is NOT supported for extension testing
 * - The extension must be built before running tests
 *
 * Usage:
 *   1. Build the extension: pnpm build
 *   2. Run tests: pnpm exec playwright test --config=playwright.chrome-ext.config.ts
 */

import { defineConfig } from "@playwright/test";
import { resolve } from "path";

// Path to the built extension directory
const EXTENSION_PATH = resolve(__dirname, "dist");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false, // Extensions need sequential execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker for extension context
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chrome-extension",
      testIgnore: "**/firefox-*.e2e.ts",
      use: {
        // Extension testing requires launchPersistentContext
        // which is configured in the test fixtures, not here.
        // These are defaults for the context.
        viewport: { width: 400, height: 600 }, // Popup dimensions
        baseURL: `chrome-extension://`, // Placeholder — real ID resolved at runtime
      },
    },
    {
      name: "firefox-extension",
      testMatch: "**/firefox-*.e2e.ts",
      use: {
        viewport: { width: 400, height: 600 }, // Popup dimensions
        baseURL: `moz-extension://`, // Placeholder — real ID resolved at runtime
      },
    },
  ],
});
