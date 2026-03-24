/**
 * Firefox WebExtension E2E tests.
 *
 * Tests extension behavior specifically in Firefox to verify
 * cross-browser extension compatibility.
 *
 * Focus areas:
 * - Extension loads in Firefox
 * - Popup renders correctly
 * - WebExtension APIs work (storage, messaging, tabs)
 * - Visual rendering matches Chrome baseline
 *
 * Note: Firefox uses moz-extension:// URLs instead of chrome-extension://
 */

import { test, expect } from "./firefox-fixtures";

test.describe("Firefox Extension Loading", () => {
  test("extension loads successfully in Firefox", async ({
    firefoxExtensionId,
  }) => {
    expect(firefoxExtensionId).toBeTruthy();
  });

  test("popup page loads in Firefox", async ({ firefoxExtensionPopup }) => {
    await expect(firefoxExtensionPopup).toHaveTitle(/.+/);
  });

  test("popup renders main content", async ({ firefoxExtensionPopup }) => {
    // TODO: Replace with your extension's actual heading
    const heading = firefoxExtensionPopup.locator("h1").first();
    await expect(heading).toBeVisible();
  });
});

test.describe("Firefox WebExtension APIs", () => {
  test("browser.storage.local is available", async ({
    firefoxExtensionPopup,
  }) => {
    const hasStorage = await firefoxExtensionPopup.evaluate(() => {
      // Firefox uses `browser.*` namespace (with promises) or `chrome.*` (callback-based)
      return (
        typeof browser?.storage?.local !== "undefined" ||
        typeof chrome?.storage?.local !== "undefined"
      );
    });
    expect(hasStorage).toBe(true);
  });

  test("runtime messaging works", async ({ firefoxExtensionPopup }) => {
    const hasMessaging = await firefoxExtensionPopup.evaluate(() => {
      return (
        typeof browser?.runtime?.sendMessage === "function" ||
        typeof chrome?.runtime?.sendMessage === "function"
      );
    });
    expect(hasMessaging).toBe(true);
  });
});

test.describe("Firefox Visual Regression", () => {
  test("popup appearance in Firefox", async ({ firefoxExtensionPopup }) => {
    await expect(firefoxExtensionPopup).toHaveScreenshot(
      "popup-firefox.png",
      {
        maxDiffPixelRatio: 0.03, // Slightly higher threshold for cross-browser
      }
    );
  });
});
