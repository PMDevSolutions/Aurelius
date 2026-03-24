/**
 * Playwright test fixtures for Firefox WebExtension E2E testing.
 *
 * Firefox uses a different extension loading mechanism:
 * - Uses web-ext or about:debugging to load temporary extensions
 * - Uses Manifest V2/V3 WebExtension format (largely compatible with Chrome)
 * - Cannot use --load-extension flag (Chrome-only)
 *
 * This fixture loads the extension as a temporary add-on in Firefox using
 * Playwright's firefox.launchPersistentContext with the extension path.
 *
 * Prerequisites:
 *   - Extension must be built (pnpm build)
 *   - Firefox must be installed (npx playwright install firefox)
 *
 * Usage in tests:
 *   import { test, expect } from "./firefox-fixtures";
 *
 *   test("popup renders", async ({ firefoxExtensionPopup }) => {
 *     await expect(firefoxExtensionPopup.locator("h1")).toHaveText("My Extension");
 *   });
 */

import {
  test as base,
  firefox,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { resolve } from "path";

const EXTENSION_DIR = resolve(process.env.EXTENSION_PATH || "./dist");

interface FirefoxExtensionFixtures {
  firefoxContext: BrowserContext;
  firefoxExtensionId: string;
  firefoxExtensionPopup: Page;
}

export const test = base.extend<FirefoxExtensionFixtures>({
  firefoxContext: async ({}, use) => {
    // Firefox supports loading extensions via persistent context
    // with the --load-temp-addon flag or via CDP-like protocol.
    // Playwright supports this natively for Firefox.
    const context = await firefox.launchPersistentContext("", {
      headless: false,
      args: [],
      // Firefox extension loading happens via Playwright's addInitScript
      // or by navigating to about:debugging and loading the extension.
    });

    await use(context);
    await context.close();
  },

  firefoxExtensionId: async ({ firefoxContext }, use) => {
    // Navigate to about:debugging to load the extension
    const page = await firefoxContext.newPage();
    await page.goto("about:debugging#/runtime/this-firefox");

    // Click "Load Temporary Add-on"
    await page.getByText("Load Temporary Add-on").click();

    // Use file chooser to select the manifest
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Load Temporary Add-on").click(),
    ]);
    await fileChooser.setFiles(resolve(EXTENSION_DIR, "manifest.json"));

    // Wait for extension to load and extract its ID
    await page.waitForTimeout(2000);

    // Extract extension ID from the debugging page
    const extensionId = await page.evaluate(() => {
      // Firefox displays extension IDs on about:debugging
      const cards = document.querySelectorAll(".qa-debug-target-item");
      for (const card of cards) {
        const idEl = card.querySelector(".qa-extension-id");
        if (idEl) return idEl.textContent?.trim();
      }
      return null;
    });

    await page.close();

    if (!extensionId) {
      throw new Error(
        "Could not load Firefox extension or extract ID from about:debugging"
      );
    }

    await use(extensionId);
  },

  firefoxExtensionPopup: async ({ firefoxContext, firefoxExtensionId }, use) => {
    const popupPage = await firefoxContext.newPage();
    await popupPage.goto(
      `moz-extension://${firefoxExtensionId}/popup.html`,
      { waitUntil: "domcontentloaded" }
    );
    await use(popupPage);
    await popupPage.close();
  },
});

export { expect } from "@playwright/test";
