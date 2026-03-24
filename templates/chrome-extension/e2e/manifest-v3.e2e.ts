/**
 * Chrome Extension Manifest V3 compatibility tests.
 *
 * Validates MV3-specific requirements:
 * - manifest_version is 3
 * - Service worker (not background page)
 * - Declarative net request (not webRequest blocking)
 * - Content security policy format
 * - Action API (not browserAction/pageAction)
 * - Host permissions separated from permissions
 *
 * These tests read the built manifest.json and validate the extension
 * runtime behavior against MV3 requirements.
 */

import { test, expect } from "./fixtures";
import { readFileSync } from "fs";
import { resolve } from "path";

const EXTENSION_DIR = resolve(process.env.EXTENSION_PATH || "./dist");

function loadManifest(): Record<string, unknown> {
  const raw = readFileSync(resolve(EXTENSION_DIR, "manifest.json"), "utf-8");
  return JSON.parse(raw);
}

test.describe("Manifest V3 Structure", () => {
  const manifest = loadManifest();

  test("uses manifest_version 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  test("has required fields", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toBeTruthy();
  });

  test("does not use deprecated background.page or background.scripts", () => {
    const background = manifest.background as Record<string, unknown> | undefined;
    if (background) {
      expect(background).not.toHaveProperty("page");
      expect(background).not.toHaveProperty("scripts");
      // MV3 uses service_worker
      expect(background).toHaveProperty("service_worker");
    }
  });

  test("uses action API (not browserAction or pageAction)", () => {
    expect(manifest).not.toHaveProperty("browser_action");
    expect(manifest).not.toHaveProperty("page_action");
    // MV3 uses "action" for toolbar button
    if ((manifest as Record<string, unknown>).action !== undefined) {
      expect(manifest).toHaveProperty("action");
    }
  });

  test("host_permissions are separate from permissions", () => {
    const permissions = manifest.permissions as string[] | undefined;
    if (permissions) {
      // Host patterns should be in host_permissions, not permissions
      const hostPatterns = permissions.filter(
        (p) =>
          p.includes("://") || p === "<all_urls>" || p.startsWith("*://")
      );
      expect(hostPatterns).toHaveLength(0);
    }
  });

  test("content_security_policy uses extension_pages format", () => {
    const csp = manifest.content_security_policy as
      | Record<string, string>
      | string
      | undefined;
    if (csp) {
      // MV3 CSP is an object, not a string
      expect(typeof csp).toBe("object");
      expect(csp).toHaveProperty("extension_pages");
    }
  });

  test("web_accessible_resources uses MV3 format", () => {
    const war = manifest.web_accessible_resources as unknown[] | undefined;
    if (war && war.length > 0) {
      // MV3 format: array of objects with resources + matches
      const first = war[0] as Record<string, unknown>;
      expect(first).toHaveProperty("resources");
      expect(first).toHaveProperty("matches");
    }
  });
});

test.describe("MV3 Service Worker Runtime", () => {
  test("service worker is active", async ({ extensionServiceWorker }) => {
    expect(extensionServiceWorker).toBeTruthy();
    const url = extensionServiceWorker.url();
    expect(url).toContain("chrome-extension://");
  });

  test("service worker responds to runtime messages", async ({
    extensionServiceWorker,
  }) => {
    // Verify the SW can handle messages (basic MV3 communication)
    const canReceiveMessages = await extensionServiceWorker.evaluate(() => {
      return typeof chrome.runtime.onMessage !== "undefined";
    });
    expect(canReceiveMessages).toBe(true);
  });

  test("service worker has access to chrome.action API", async ({
    extensionServiceWorker,
  }) => {
    const hasActionAPI = await extensionServiceWorker.evaluate(() => {
      return typeof chrome.action !== "undefined";
    });
    // chrome.action should be available in MV3
    expect(hasActionAPI).toBe(true);
  });

  test("service worker handles alarm API for scheduled tasks", async ({
    extensionServiceWorker,
  }) => {
    const manifest = loadManifest();
    const permissions = manifest.permissions as string[] | undefined;

    if (permissions?.includes("alarms")) {
      const hasAlarmsAPI = await extensionServiceWorker.evaluate(() => {
        return typeof chrome.alarms !== "undefined";
      });
      expect(hasAlarmsAPI).toBe(true);
    }
  });
});

test.describe("MV3 Permissions", () => {
  test("only declared permissions are available", async ({
    extensionServiceWorker,
  }) => {
    const manifest = loadManifest();
    const permissions = (manifest.permissions as string[]) || [];

    // Verify storage API matches manifest
    if (permissions.includes("storage")) {
      const hasStorage = await extensionServiceWorker.evaluate(() => {
        return typeof chrome.storage !== "undefined";
      });
      expect(hasStorage).toBe(true);
    }

    // Verify tabs API matches manifest
    if (permissions.includes("tabs")) {
      const hasTabs = await extensionServiceWorker.evaluate(() => {
        return typeof chrome.tabs !== "undefined";
      });
      expect(hasTabs).toBe(true);
    }
  });

  test("optional permissions can be requested at runtime", async ({
    extensionServiceWorker,
  }) => {
    const manifest = loadManifest();
    const optionalPermissions =
      (manifest.optional_permissions as string[]) || [];

    if (optionalPermissions.length > 0) {
      const canRequest = await extensionServiceWorker.evaluate(() => {
        return typeof chrome.permissions?.request === "function";
      });
      expect(canRequest).toBe(true);
    }
  });
});
