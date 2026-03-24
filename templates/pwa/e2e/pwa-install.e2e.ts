/**
 * PWA Installation E2E tests.
 *
 * Tests manifest validation, service worker registration, and install
 * prompt behavior across browsers.
 *
 * Runs on: chromium, firefox, webkit (via pwa-offline-* projects)
 */

import { test, expect } from "@playwright/test";

test.describe("PWA Manifest Validation", () => {
  test("has a valid web app manifest link", async ({ page }) => {
    await page.goto("/");
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    const href = await manifestLink.getAttribute("href");
    expect(href).toBeTruthy();
  });

  test("manifest contains required fields", async ({ page }) => {
    await page.goto("/");
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const href = link.getAttribute("href");
      if (!href) return null;
      const response = await fetch(href);
      return response.json();
    });

    expect(manifest).not.toBeNull();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toMatch(/^(standalone|fullscreen|minimal-ui)$/);
    expect(manifest.icons?.length).toBeGreaterThan(0);
  });

  test("manifest has icons at required sizes", async ({ page }) => {
    await page.goto("/");
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const response = await fetch(link.getAttribute("href")!);
      return response.json();
    });

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    // PWA requires at least 192x192 and 512x512
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  test("manifest theme_color matches meta tag", async ({ page }) => {
    await page.goto("/");
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const response = await fetch(link.getAttribute("href")!);
      return response.json();
    });

    if (manifest?.theme_color) {
      const metaThemeColor = await page
        .locator('meta[name="theme-color"]')
        .getAttribute("content");
      expect(metaThemeColor?.toLowerCase()).toBe(
        manifest.theme_color.toLowerCase()
      );
    }
  });
});

test.describe("Service Worker Registration", () => {
  test("service worker registers successfully", async ({ page }) => {
    await page.goto("/");
    const swRegistered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration();
      return !!registration;
    });
    expect(swRegistered).toBe(true);
  });

  test("service worker reaches active state", async ({ page }) => {
    await page.goto("/");
    const swState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state;
    });
    expect(swState).toBe("activated");
  });

  test("service worker controls the page", async ({ page }) => {
    await page.goto("/");
    // Wait for SW to take control
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, {
      timeout: 10_000,
    });
    const hasController = await page.evaluate(
      () => !!navigator.serviceWorker.controller
    );
    expect(hasController).toBe(true);
  });
});
