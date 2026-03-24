/**
 * PWA Offline Behavior E2E tests.
 *
 * Tests that the app works correctly when the network is unavailable,
 * including cached page serving, offline fallback, and network restoration.
 *
 * Runs on: chromium, firefox, webkit (via pwa-offline-* projects)
 */

import { test, expect, type Page } from "@playwright/test";

/** Wait for the service worker to be active and controlling the page. */
async function waitForServiceWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker.controller &&
      navigator.serviceWorker.controller.state === "activated",
    null,
    { timeout: 15_000 }
  );
}

test.describe("Offline Fallback", () => {
  test.beforeEach(async ({ page }) => {
    // Load page and wait for SW to cache assets
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerReady(page);
  });

  test("serves cached homepage when offline", async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);

    // Reload — should serve from SW cache
    await page.reload();

    // Page should still have content (not browser error page)
    await expect(page.locator("body")).not.toBeEmpty();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    // Restore network
    await context.setOffline(false);
  });

  test("shows offline indicator when network unavailable", async ({
    page,
    context,
  }) => {
    await context.setOffline(true);
    await page.reload();

    // TODO: Replace with your app's offline indicator selector
    // Example: a banner, toast, or status badge
    // await expect(page.getByText(/offline/i)).toBeVisible();

    // At minimum, the page should render without crashing
    await expect(page.locator("body")).toBeVisible();

    await context.setOffline(false);
  });

  test("recovers gracefully when network restored", async ({
    page,
    context,
  }) => {
    // Go offline
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("body")).toBeVisible();

    // Restore network
    await context.setOffline(false);
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Page should fully render with live data
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("cached assets load without network requests", async ({
    page,
    context,
  }) => {
    // Go offline
    await context.setOffline(true);

    // Track failed network requests
    const failedRequests: string[] = [];
    page.on("requestfailed", (req) => failedRequests.push(req.url()));

    await page.reload();

    // Critical assets (HTML, CSS, JS) should be served from cache
    // Only external/API requests should fail
    const criticalFailures = failedRequests.filter(
      (url) =>
        url.includes(".css") || url.includes(".js") || url.endsWith("/")
    );
    expect(criticalFailures).toHaveLength(0);

    await context.setOffline(false);
  });
});

test.describe("Navigation While Offline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerReady(page);
  });

  test("cached routes are navigable offline", async ({ page, context }) => {
    // Pre-visit a route to cache it
    // TODO: Replace with an actual route from your app
    // await page.goto("/about");
    // await page.waitForLoadState("networkidle");

    // Go offline
    await context.setOffline(true);

    // Navigate to cached route
    // await page.goto("/about");
    // await expect(page.locator("body")).not.toBeEmpty();

    await context.setOffline(false);
  });
});
