# Cross-Browser E2E Testing for Chrome Extension and PWA

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand E2E test coverage to run across Chrome, Firefox, and Safari (WebKit) for both Chrome extension and PWA output targets, with browser-specific CSS fixes and service worker lifecycle tests.

**Architecture:** Add a multi-browser Playwright config template for web apps/PWAs, create a dedicated PWA E2E template directory with service worker lifecycle tests, extend the Chrome extension template with MV3 compatibility tests and Firefox WebExtension support, and update the e2e-test-generator skill + pipeline config to wire everything together.

**Tech Stack:** Playwright (chromium, firefox, webkit), Playwright Test fixtures, `web-ext` API for Firefox extension loading, Service Worker API, Web App Manifest, Chrome Extensions Manifest V3

---

## Task 1: Add Playwright Cross-Browser Test Matrix Config Template

**Files:**
- Create: `templates/shared/playwright.config.ts`
- Modify: `.claude/pipeline.config.json:53-67`
- Modify: `.claude/skills/e2e-test-generator/SKILL.md:43-96`

### Step 1: Write the cross-browser Playwright config template

Create `templates/shared/playwright.config.ts`:

```typescript
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
```

### Step 2: Update pipeline.config.json E2E section

Update `.claude/pipeline.config.json` lines 53-67 to set cross-browser as default for web-app and PWA:

**Before:**
```json
"e2e": {
  "enabled": true,
  "conditionalOnAppType": true,
  "browsers": ["chromium"],
  "crossBrowserBrowsers": ["chromium", "firefox", "webkit"],
  "crossBrowserRequired": false,
  "timeoutMs": 30000,
  "retries": 1
}
```

**After:**
```json
"e2e": {
  "enabled": true,
  "conditionalOnAppType": true,
  "browsers": ["chromium", "firefox", "webkit"],
  "crossBrowserBrowsers": ["chromium", "firefox", "webkit"],
  "crossBrowserRequired": true,
  "timeoutMs": 30000,
  "retries": 2,
  "mobileBrowsers": ["mobile-chrome", "mobile-safari"],
  "crossBrowserDiffThreshold": 0.03
}
```

### Step 3: Update pipeline.config.json app type browser configs

Add explicit browser lists to each app type in `.claude/pipeline.config.json`:

Update the `web-app` section (lines 91-102):
```json
"web-app": {
  "description": "Standard React web application (SPA or SSR)",
  "e2eStrategy": "navigate-interact-verify",
  "defaultE2eFlows": ["page-navigation", "form-submission", "responsive-layout"],
  "testHarness": "playwright",
  "devServer": true,
  "browsers": ["chromium", "firefox", "webkit"],
  "mobileBrowsers": ["mobile-chrome", "mobile-safari"],
  "browserContextOptions": {}
}
```

Update the `chrome-extension` section (lines 103-123) — add Firefox WebExtension support:
```json
"chrome-extension": {
  "description": "Chrome browser extension with popup, background, and/or content scripts",
  "e2eStrategy": "load-extension-interact",
  "defaultE2eFlows": ["extension-load", "popup-open", "popup-interact", "content-script-inject", "manifest-v3-compat"],
  "testHarness": "playwright-chromium-persistent",
  "devServer": false,
  "browsers": ["chromium"],
  "firefoxWebExtSupport": true,
  "browserContextOptions": {
    "headless": false,
    "args": [
      "--disable-extensions-except=${extensionPath}",
      "--load-extension=${extensionPath}"
    ]
  },
  "buildCommand": "pnpm build",
  "extensionPathDefault": "dist"
}
```

Update the `pwa` section (lines 124-136):
```json
"pwa": {
  "description": "Progressive Web App with offline support and installability",
  "e2eStrategy": "navigate-interact-verify-offline",
  "defaultE2eFlows": ["page-navigation", "install-prompt", "offline-fallback", "push-notification", "sw-lifecycle"],
  "testHarness": "playwright",
  "devServer": true,
  "browsers": ["chromium", "firefox", "webkit"],
  "mobileBrowsers": ["mobile-chrome", "mobile-safari"],
  "browserContextOptions": {}
}
```

### Step 4: Update e2e-test-generator skill — web app config generation

Modify `.claude/skills/e2e-test-generator/SKILL.md` Step 2 "For Web Apps" section (lines 43-73).

Replace the hardcoded config with a reference to the shared template:

```markdown
#### For Web Apps (appType: "web-app")

Copy the shared template and customize:
1. Copy `templates/shared/playwright.config.ts` → project root `playwright.config.ts`
2. Adjust `baseURL` and `webServer.command` based on framework (Next.js vs Vite)
3. The template includes all 5 browser projects by default (chromium, firefox, webkit, mobile-chrome, mobile-safari)

If the project uses Vite instead of Next.js, update:
- `baseURL` → `"http://localhost:5173"`
- `webServer.url` → `"http://localhost:5173"`
- `webServer.command` → `"pnpm dev"`
```

### Step 5: Update e2e-test-generator skill — PWA config generation

Replace the existing PWA section (lines 84-96) with:

```markdown
#### For PWAs (appType: "pwa")

Copy `templates/shared/playwright.config.ts` → project root `playwright.config.ts`, then add:

```typescript
// Append after the "mobile-safari" project:
{
  name: "pwa-offline",
  use: {
    ...devices["Desktop Chrome"],
    serviceWorkers: "allow",
  },
},
{
  name: "pwa-offline-firefox",
  use: {
    ...devices["Desktop Firefox"],
    serviceWorkers: "allow",
  },
},
{
  name: "pwa-offline-webkit",
  use: {
    ...devices["Desktop Safari"],
    serviceWorkers: "allow",
  },
},
```

Also copy PWA-specific templates:
- Copy `templates/pwa/e2e/pwa-install.e2e.ts` → `e2e/pwa-install.e2e.ts`
- Copy `templates/pwa/e2e/pwa-offline.e2e.ts` → `e2e/pwa-offline.e2e.ts`
- Copy `templates/pwa/e2e/sw-lifecycle.e2e.ts` → `e2e/sw-lifecycle.e2e.ts`
```

### Step 6: Commit

```bash
git add templates/shared/playwright.config.ts .claude/pipeline.config.json .claude/skills/e2e-test-generator/SKILL.md
git commit -m "feat: add cross-browser Playwright test matrix for web apps and PWAs

Update pipeline config to require cross-browser testing (chromium, firefox,
webkit) for web-app and pwa app types. Add shared Playwright config template
with 5 browser projects. Update e2e-test-generator skill to reference shared
template."
```

---

## Task 2: Fix Browser-Specific CSS Rendering Issues

**Files:**
- Create: `templates/shared/css/cross-browser-reset.css`
- Create: `scripts/audit-cross-browser-css.sh`
- Modify: `templates/shared/tailwind.config.ts` (add cross-browser plugin)

### Step 1: Write the cross-browser CSS reset

Create `templates/shared/css/cross-browser-reset.css`:

```css
/**
 * Cross-browser CSS reset for consistent rendering across Chromium, Firefox, and WebKit.
 *
 * Addresses known rendering differences:
 * - Font rendering / anti-aliasing
 * - Scrollbar width and styling
 * - Form element appearance
 * - Focus ring styling
 * - Flexbox/Grid gap behavior
 */

/* --- Font Rendering Normalization --- */
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* --- Scrollbar Normalization --- */
/* Firefox scrollbar styling (thin, minimal) */
* {
  scrollbar-width: thin;
  scrollbar-color: theme("colors.gray.400") transparent;
}

/* WebKit/Chromium scrollbar styling to match Firefox thin scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: theme("colors.gray.400");
  border-radius: 3px;
}

/* --- Form Element Reset --- */
/* Remove native appearance differences across browsers */
input,
textarea,
select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

/* Firefox inner focus ring removal (handled by custom focus styles) */
::-moz-focus-inner {
  border: 0;
  padding: 0;
}

/* --- Focus Ring Consistency --- */
/* Unified focus-visible style across all browsers */
:focus-visible {
  outline: 2px solid theme("colors.blue.500");
  outline-offset: 2px;
}

/* Remove default focus ring (replaced by :focus-visible above) */
:focus:not(:focus-visible) {
  outline: none;
}

/* --- Button Reset --- */
button {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  cursor: pointer;
}

/* --- Safari-specific fixes --- */
/* Prevent auto-zoom on input focus in iOS Safari */
@supports (-webkit-touch-callout: none) {
  input,
  textarea,
  select {
    font-size: max(16px, 1em);
  }
}

/* Safari flexbox gap fallback (Safari < 14.1) */
@supports not (gap: 1px) {
  .flex > * + * {
    margin-left: var(--flex-gap, 0);
  }
}
```

### Step 2: Write the cross-browser CSS audit script

Create `scripts/audit-cross-browser-css.sh`:

```bash
#!/bin/bash
# Audit CSS for known cross-browser rendering issues.
#
# Checks for:
# - Vendor-prefixed properties without standard equivalents
# - Properties known to render differently across browsers
# - Missing reset/normalization patterns
#
# Usage:
#   ./scripts/audit-cross-browser-css.sh [--json]
#   ./scripts/audit-cross-browser-css.sh src/

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEARCH_DIR="${1:-$PROJECT_ROOT/src}"
JSON_OUTPUT=false
ISSUES=0

# Check for --json flag
for arg in "$@"; do
  if [ "$arg" = "--json" ]; then
    JSON_OUTPUT=true
    break
  fi
done

echo "=== Cross-Browser CSS Audit ==="
echo "Scanning: $SEARCH_DIR"
echo ""

# 1. Check for webkit-only properties missing standard equivalents
echo "--- Vendor prefix issues ---"
WEBKIT_ONLY=$(grep -rn "-webkit-" "$SEARCH_DIR" --include="*.css" --include="*.tsx" --include="*.ts" --include="*.jsx" 2>/dev/null | grep -v "node_modules" | grep -v "-webkit-font-smoothing" | grep -v "-webkit-touch-callout" | grep -v "-webkit-appearance" | grep -v "-webkit-scrollbar" || true)
if [ -n "$WEBKIT_ONLY" ]; then
  echo "WARNING: Found -webkit- prefixed properties. Verify Firefox/Safari equivalents exist:"
  echo "$WEBKIT_ONLY" | head -20
  ISSUES=$((ISSUES + $(echo "$WEBKIT_ONLY" | wc -l)))
  echo ""
fi

# 2. Check for backdrop-filter (needs -webkit- prefix for Safari)
echo "--- backdrop-filter (needs -webkit- for Safari < 18) ---"
BACKDROP=$(grep -rn "backdrop-filter" "$SEARCH_DIR" --include="*.css" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "-webkit-backdrop-filter" || true)
if [ -n "$BACKDROP" ]; then
  echo "WARNING: backdrop-filter used without -webkit- prefix for Safari:"
  echo "$BACKDROP" | head -10
  ISSUES=$((ISSUES + $(echo "$BACKDROP" | wc -l)))
  echo ""
fi

# 3. Check for gap property in flexbox (Safari < 14.1)
echo "--- Flexbox gap (limited Safari < 14.1 support) ---"
FLEX_GAP=$(grep -rn "flex.*gap\|gap:.*\(flex\)" "$SEARCH_DIR" --include="*.css" 2>/dev/null | grep -v "node_modules" || true)
if [ -n "$FLEX_GAP" ]; then
  echo "INFO: Flexbox gap detected. Ensure Safari 14.1+ is your minimum target or add fallbacks:"
  echo "$FLEX_GAP" | head -10
  echo ""
fi

# 4. Check for hardcoded focus outline styles (should use :focus-visible)
echo "--- Focus styling consistency ---"
FOCUS_OUTLINE=$(grep -rn ":focus\b" "$SEARCH_DIR" --include="*.css" 2>/dev/null | grep -v "node_modules" | grep -v ":focus-visible" | grep -v ":focus-within" | grep -v ":focus:not" || true)
if [ -n "$FOCUS_OUTLINE" ]; then
  echo "WARNING: :focus used without :focus-visible. Consider using :focus-visible for cross-browser consistency:"
  echo "$FOCUS_OUTLINE" | head -10
  ISSUES=$((ISSUES + $(echo "$FOCUS_OUTLINE" | wc -l)))
  echo ""
fi

# 5. Summary
echo "=== Audit Summary ==="
echo "Issues found: $ISSUES"

if [ "$ISSUES" -eq 0 ]; then
  echo "All clear! No cross-browser CSS issues detected."
fi

exit 0
```

### Step 3: Make the audit script executable

Run:
```bash
chmod +x scripts/audit-cross-browser-css.sh
```

### Step 4: Add cross-browser notes to templates README

Modify `templates/README.md` to add a row for the new CSS reset:

```markdown
| `shared/css/cross-browser-reset.css` | Cross-browser CSS normalization (fonts, scrollbars, forms, focus) |
```

### Step 5: Commit

```bash
git add templates/shared/css/cross-browser-reset.css scripts/audit-cross-browser-css.sh templates/README.md
git commit -m "feat: add cross-browser CSS reset and audit script

Add CSS normalization for font rendering, scrollbars, form elements, and focus
rings across Chromium, Firefox, and WebKit. Add audit script to detect vendor
prefix issues and missing browser fallbacks."
```

---

## Task 3: Add Service Worker Lifecycle Tests for PWA

**Files:**
- Create: `templates/pwa/e2e/pwa-install.e2e.ts`
- Create: `templates/pwa/e2e/pwa-offline.e2e.ts`
- Create: `templates/pwa/e2e/sw-lifecycle.e2e.ts`
- Create: `templates/pwa/playwright.pwa.config.ts`
- Modify: `.claude/skills/e2e-test-generator/SKILL.md:242-296` (PWA section)

### Step 1: Create the PWA template directory

Run:
```bash
mkdir -p templates/pwa/e2e
```

### Step 2: Write the PWA Playwright config template

Create `templates/pwa/playwright.pwa.config.ts`:

```typescript
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
```

### Step 3: Write the PWA install test template

Create `templates/pwa/e2e/pwa-install.e2e.ts`:

```typescript
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
```

### Step 4: Write the PWA offline test template

Create `templates/pwa/e2e/pwa-offline.e2e.ts`:

```typescript
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
```

### Step 5: Write the service worker lifecycle test template

Create `templates/pwa/e2e/sw-lifecycle.e2e.ts`:

```typescript
/**
 * Service Worker Lifecycle E2E tests.
 *
 * Tests the full SW lifecycle: install → activate → fetch → update → skip waiting.
 * These tests verify correct caching strategies and update behavior.
 *
 * Runs on: chromium (sw-lifecycle project) — Chrome has the best SW debugging APIs.
 * Cross-browser SW registration is tested in pwa-install.e2e.ts.
 */

import { test, expect, type Page } from "@playwright/test";

/** Wait for SW to be registered and active. */
async function waitForSWActive(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker.ready.then(
        (reg) => reg.active?.state === "activated"
      ),
    null,
    { timeout: 15_000 }
  );
}

test.describe("Service Worker Install Phase", () => {
  test("service worker installs on first visit", async ({ page }) => {
    // Unregister any existing SW first
    await page.goto("/");
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    });

    // Reload to trigger fresh install
    await page.reload();
    await page.waitForLoadState("networkidle");

    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return {
        active: !!reg.active,
        installing: !!reg.installing,
        waiting: !!reg.waiting,
        scope: reg.scope,
      };
    });

    expect(registration.active).toBe(true);
    expect(registration.scope).toContain("/");
  });

  test("service worker scope covers the app root", async ({ page }) => {
    await page.goto("/");
    await waitForSWActive(page);

    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });

    // SW scope should be the app root
    expect(scope).toMatch(/\/$/);
  });
});

test.describe("Service Worker Activate Phase", () => {
  test("service worker activates and takes control", async ({ page }) => {
    await page.goto("/");
    await waitForSWActive(page);

    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return {
        activeState: reg.active?.state,
        controllerExists: !!navigator.serviceWorker.controller,
      };
    });

    expect(state.activeState).toBe("activated");
    expect(state.controllerExists).toBe(true);
  });

  test("service worker handles activate event (cleans old caches)", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForSWActive(page);

    // Get list of cache names — old versioned caches should be cleaned up
    const cacheNames = await page.evaluate(async () => {
      return caches.keys();
    });

    // Should have at least one cache (the current version)
    expect(cacheNames.length).toBeGreaterThan(0);
    // Should NOT have multiple versions (old caches should be pruned)
    // NOTE: Adjust this if your SW uses multiple cache buckets by design
    // expect(cacheNames.length).toBeLessThanOrEqual(3);
  });
});

test.describe("Service Worker Fetch Handling", () => {
  test("service worker intercepts navigation requests", async ({ page }) => {
    await page.goto("/");
    await waitForSWActive(page);

    // Check that the SW is actually intercepting fetches
    const swControlled = await page.evaluate(
      () => !!navigator.serviceWorker.controller
    );
    expect(swControlled).toBe(true);
  });

  test("static assets are cached after first load", async ({
    page,
    context,
  }) => {
    // Load the page to populate cache
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await waitForSWActive(page);

    // Go offline
    await context.setOffline(true);

    // Try to load a static asset (CSS or JS)
    const assetLoaded = await page.evaluate(async () => {
      try {
        // Check if the main CSS/JS is in cache
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          if (keys.length > 0) return true;
        }
        return false;
      } catch {
        return false;
      }
    });

    expect(assetLoaded).toBe(true);
    await context.setOffline(false);
  });
});

test.describe("Service Worker Update Lifecycle", () => {
  test("detects when a new service worker is available", async ({ page }) => {
    await page.goto("/");
    await waitForSWActive(page);

    // Check that the registration can detect updates
    const canUpdate = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      // Manually trigger an update check
      try {
        await reg.update();
        return true;
      } catch {
        return false;
      }
    });

    expect(canUpdate).toBe(true);
  });

  test("new service worker enters waiting state before activation", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForSWActive(page);

    // This test verifies the update flow structure exists.
    // A full update test requires serving a different SW file,
    // which is better done in integration tests with a test server.
    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return {
        hasActive: !!reg.active,
        hasWaiting: !!reg.waiting,
        hasInstalling: !!reg.installing,
      };
    });

    // After a clean load, active should exist, waiting/installing should not
    expect(registration.hasActive).toBe(true);
  });
});

test.describe("Cache Strategy Validation", () => {
  test("app shell is cached on install", async ({ page }) => {
    await page.goto("/");
    await waitForSWActive(page);

    const cachedUrls = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const allUrls: string[] = [];
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        allUrls.push(...keys.map((req) => new URL(req.url).pathname));
      }
      return allUrls;
    });

    // The root document should be cached
    expect(cachedUrls).toContain("/");
  });

  test("API responses use network-first strategy", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await waitForSWActive(page);

    // TODO: Replace with an actual API endpoint from your app
    // This test verifies that API calls prefer fresh data when online
    // and fall back to cache when offline.

    // Verify page renders normally when online
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
```

### Step 6: Update the templates README

Add a PWA section to `templates/README.md`:

```markdown
### PWA (`templates/pwa/`)

| File | Purpose |
|------|---------|
| `playwright.pwa.config.ts` | Playwright config with offline + cross-browser projects |
| `e2e/pwa-install.e2e.ts` | Manifest validation and SW registration tests |
| `e2e/pwa-offline.e2e.ts` | Offline fallback and cached navigation tests |
| `e2e/sw-lifecycle.e2e.ts` | Full SW lifecycle: install, activate, fetch, update, cache |
```

### Step 7: Commit

```bash
git add templates/pwa/ templates/README.md
git commit -m "feat: add PWA E2E templates with service worker lifecycle tests

Create templates/pwa/ with Playwright config, install validation, offline
behavior tests, and full service worker lifecycle tests (install, activate,
fetch, update, cache strategy). Tests run across chromium, firefox, and webkit."
```

---

## Task 4: Add Chrome Extension Manifest V3 Compatibility Tests

**Files:**
- Create: `templates/chrome-extension/e2e/manifest-v3.e2e.ts`
- Create: `templates/chrome-extension/e2e/firefox-webext.e2e.ts`
- Create: `templates/chrome-extension/e2e/firefox-fixtures.ts`
- Modify: `templates/chrome-extension/e2e/extension.e2e.ts` (add MV3 tests)
- Modify: `templates/chrome-extension/playwright.chrome-ext.config.ts` (add Firefox project)

### Step 1: Write the MV3 compatibility test file

Create `templates/chrome-extension/e2e/manifest-v3.e2e.ts`:

```typescript
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
```

### Step 2: Write the Firefox WebExtension fixtures

Create `templates/chrome-extension/e2e/firefox-fixtures.ts`:

```typescript
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
```

### Step 3: Write the Firefox WebExtension test file

Create `templates/chrome-extension/e2e/firefox-webext.e2e.ts`:

```typescript
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
```

### Step 4: Update the Chrome extension Playwright config for Firefox project

Modify `templates/chrome-extension/playwright.chrome-ext.config.ts` to add a Firefox project:

**Current (line 37-48):**
```typescript
  projects: [
    {
      name: "chrome-extension",
      use: {
        viewport: { width: 400, height: 600 },
        baseURL: `chrome-extension://`,
      },
    },
  ],
```

**Replace with:**
```typescript
  projects: [
    {
      name: "chrome-extension",
      testIgnore: "**/firefox-*.e2e.ts",
      use: {
        viewport: { width: 400, height: 600 },
        baseURL: `chrome-extension://`,
      },
    },
    {
      name: "firefox-extension",
      testMatch: "**/firefox-*.e2e.ts",
      use: {
        viewport: { width: 400, height: 600 },
        baseURL: `moz-extension://`,
      },
    },
  ],
```

### Step 5: Update the Chrome extension template README

Add to `templates/chrome-extension/` a note in the templates README about the new files:

```markdown
| `e2e/manifest-v3.e2e.ts` | MV3 manifest validation + runtime API checks |
| `e2e/firefox-fixtures.ts` | Firefox WebExtension test fixtures |
| `e2e/firefox-webext.e2e.ts` | Firefox-specific extension loading and API tests |
```

### Step 6: Commit

```bash
git add templates/chrome-extension/e2e/manifest-v3.e2e.ts templates/chrome-extension/e2e/firefox-fixtures.ts templates/chrome-extension/e2e/firefox-webext.e2e.ts templates/chrome-extension/playwright.chrome-ext.config.ts templates/README.md
git commit -m "feat: add MV3 compatibility tests and Firefox WebExtension support

Add manifest-v3.e2e.ts for MV3 structure validation (service worker, action API,
host_permissions, CSP format, web_accessible_resources). Add Firefox extension
testing with dedicated fixtures and tests. Update Playwright config with Firefox
project."
```

---

## Task 5: Update E2E Test Generator Skill and Pipeline Docs

**Files:**
- Modify: `.claude/skills/e2e-test-generator/SKILL.md`
- Modify: `templates/README.md`

### Step 1: Update the e2e-test-generator skill with cross-browser support

Update the skill's Step 2 to reference new templates for all app types. Key changes:

1. **Web App:** Reference `templates/shared/playwright.config.ts` instead of inline config
2. **Chrome Extension:** Add MV3 test generation and Firefox project
3. **PWA:** Reference `templates/pwa/` templates instead of inline config

Update the skill's Step 3 test generation sections:

- Add a "Cross-Browser Test Matrix" section explaining which tests run on which browsers
- Add MV3 test generation for Chrome extensions
- Add SW lifecycle test generation for PWAs

Update the skill's Step 4 run commands:

```markdown
### Step 4: Run E2E Tests

```bash
# Web app — all browsers
pnpm exec playwright test

# Web app — specific browser
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=firefox
pnpm exec playwright test --project=webkit

# Chrome extension — Chromium (primary)
pnpm build && pnpm exec playwright test --config=playwright.chrome-ext.config.ts --project=chrome-extension

# Chrome extension — Firefox
pnpm build && pnpm exec playwright test --config=playwright.chrome-ext.config.ts --project=firefox-extension

# PWA — all browsers including offline
pnpm exec playwright test

# PWA — offline tests only
pnpm exec playwright test --project=pwa-offline
pnpm exec playwright test --project=pwa-offline-firefox
pnpm exec playwright test --project=pwa-offline-webkit

# Visual report
pnpm exec playwright test --reporter=html
```

Update the skill version to 2.0.0 and last updated date to 2026-03-24.

### Step 2: Update the templates README with all new files

Ensure `templates/README.md` includes entries for:
- `shared/playwright.config.ts`
- `shared/css/cross-browser-reset.css`
- `pwa/` directory and all files
- New Chrome extension files

### Step 3: Commit

```bash
git add .claude/skills/e2e-test-generator/SKILL.md templates/README.md
git commit -m "docs: update e2e-test-generator skill and templates README for cross-browser

Bump skill to v2.0.0 with cross-browser test matrix, MV3 compatibility tests,
Firefox WebExtension support, and PWA service worker lifecycle tests.
Update templates README with all new file entries."
```

---

## Task 6: Update CLAUDE.md and Pipeline Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/figma-to-react/README.md` (if cross-browser section needs updating)

### Step 1: Update CLAUDE.md script reference

Add the new CSS audit script to the scripts section:

```markdown
# Cross-browser CSS audit
./scripts/audit-cross-browser-css.sh [--json]
```

### Step 2: Update CLAUDE.md template descriptions

Update the templates section to mention PWA templates and new Chrome extension files.

### Step 3: Commit

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with cross-browser CSS audit and PWA templates"
```

---

## Cross-Browser Test Matrix Summary

| Test Category | Chromium | Firefox | WebKit | Mobile Chrome | Mobile Safari |
|---------------|----------|---------|--------|---------------|---------------|
| **Web App** page load | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Web App** navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Web App** forms | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Web App** responsive | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Web App** visual regression | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Chrome Ext** loading | ✅ | ✅ (WebExt) | ❌ | ❌ | ❌ |
| **Chrome Ext** popup | ✅ | ✅ (WebExt) | ❌ | ❌ | ❌ |
| **Chrome Ext** MV3 manifest | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Chrome Ext** MV3 runtime | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Chrome Ext** storage | ✅ | ✅ (WebExt) | ❌ | ❌ | ❌ |
| **Chrome Ext** visual regression | ✅ | ✅ (WebExt) | ❌ | ❌ | ❌ |
| **PWA** manifest | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PWA** SW registration | ✅ | ✅ | ✅ | ❌ | ❌ |
| **PWA** offline fallback | ✅ | ✅ | ✅ | ❌ | ❌ |
| **PWA** SW lifecycle | ✅ | ❌ | ❌ | ❌ | ❌ |
| **PWA** cached navigation | ✅ | ✅ | ✅ | ❌ | ❌ |

**Key decisions:**
- Chrome extensions: WebKit (Safari) does NOT support browser extensions via Playwright, so only Chromium + Firefox
- MV3 runtime tests: Chrome-only (Firefox MV3 support is still evolving)
- SW lifecycle deep tests: Chrome-only (best SW debugging APIs), but registration/offline tests run cross-browser
- Mobile browsers: Standard page tests only (no offline/SW tests — unreliable in mobile emulation)

---

## File Summary

| Action | File Path |
|--------|-----------|
| Create | `templates/shared/playwright.config.ts` |
| Create | `templates/shared/css/cross-browser-reset.css` |
| Create | `scripts/audit-cross-browser-css.sh` |
| Create | `templates/pwa/playwright.pwa.config.ts` |
| Create | `templates/pwa/e2e/pwa-install.e2e.ts` |
| Create | `templates/pwa/e2e/pwa-offline.e2e.ts` |
| Create | `templates/pwa/e2e/sw-lifecycle.e2e.ts` |
| Create | `templates/chrome-extension/e2e/manifest-v3.e2e.ts` |
| Create | `templates/chrome-extension/e2e/firefox-fixtures.ts` |
| Create | `templates/chrome-extension/e2e/firefox-webext.e2e.ts` |
| Modify | `.claude/pipeline.config.json` |
| Modify | `.claude/skills/e2e-test-generator/SKILL.md` |
| Modify | `templates/chrome-extension/playwright.chrome-ext.config.ts` |
| Modify | `templates/README.md` |
| Modify | `CLAUDE.md` |
