---
name: e2e-test-generator
description: Generates Playwright E2E tests from build-spec.json with app-type-aware templates for web apps, Chrome extensions, and PWAs. Reads e2e flows from the build spec and produces runnable test files. Keywords: E2E tests, Playwright, end-to-end testing, chrome extension testing, PWA testing, integration tests, browser testing
---

# E2E Test Generator — App-Type-Aware Playwright Tests

## Purpose

Generate comprehensive Playwright E2E tests based on the build specification. Reads `build-spec.json` to understand the app type, pages, components, and user flows, then produces E2E test files tailored to the specific application type (web app, Chrome extension, or PWA).

## When to Use

- Phase 6 of the `/build-from-figma` pipeline (after Visual QA, before Quality Gate)
- When adding E2E coverage to an existing Figma-derived app
- When the user asks for E2E tests for any React application
- After component build is complete and unit tests pass

## Inputs

- **Required:** `.claude/plans/build-spec.json` (from `figma-intake` skill)
- **Required:** Working built application (components implemented, unit tests passing)
- **Optional:** `.claude/pipeline.config.json` (for E2E settings and app type config)
- **Optional:** `src/styles/design-tokens.lock.json` (for visual assertion values)

## Process

### Step 1: Read Configuration

```
1. Load build-spec.json → extract appType, pages, components, e2e.flows
2. Load pipeline.config.json → extract e2e settings, appType config
3. Determine test strategy:
   - web-app → standard Playwright with dev server
   - chrome-extension → persistent context with --load-extension
   - pwa → standard Playwright + offline/install tests
```

### Step 2: Generate Test Infrastructure

#### For Web Apps (appType: "web-app")

Copy the shared Playwright config template and customize:

1. Copy `templates/shared/playwright.config.ts` → project root `playwright.config.ts`
2. Adjust `baseURL` and `webServer.command` based on framework:
   - **Next.js:** `baseURL: "http://localhost:3000"`, `command: "pnpm dev"`
   - **Vite:** `baseURL: "http://localhost:5173"`, `command: "pnpm dev"`
3. The template includes 5 browser projects by default:
   - Desktop: `chromium`, `firefox`, `webkit`
   - Mobile: `mobile-chrome` (Pixel 5), `mobile-safari` (iPhone 13)

#### For Chrome Extensions (appType: "chrome-extension")

Copy the template from `templates/chrome-extension/`:
- `playwright.chrome-ext.config.ts`
- `e2e/fixtures.ts`

Then generate app-specific tests (see Step 3).

For MV3 compatibility and Firefox support, also copy:
- `templates/chrome-extension/e2e/manifest-v3.e2e.ts` → `e2e/manifest-v3.e2e.ts`
- `templates/chrome-extension/e2e/firefox-fixtures.ts` → `e2e/firefox-fixtures.ts`
- `templates/chrome-extension/e2e/firefox-webext.e2e.ts` → `e2e/firefox-webext.e2e.ts`

The `playwright.chrome-ext.config.ts` includes two projects:
- `chrome-extension` — Chromium tests (ignores Firefox test files)
- `firefox-extension` — Firefox WebExtension tests

#### For PWAs (appType: "pwa")

Copy `templates/pwa/playwright.pwa.config.ts` → project root `playwright.config.ts`.

This config extends the shared config with PWA-specific projects:
- Standard browsers: `chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari`
- PWA offline projects: `pwa-offline`, `pwa-offline-firefox`, `pwa-offline-webkit`
- SW lifecycle project: `sw-lifecycle` (Chrome only)

Also copy the PWA E2E test templates:
- `templates/pwa/e2e/pwa-install.e2e.ts` → `e2e/pwa-install.e2e.ts`
- `templates/pwa/e2e/pwa-offline.e2e.ts` → `e2e/pwa-offline.e2e.ts`
- `templates/pwa/e2e/sw-lifecycle.e2e.ts` → `e2e/sw-lifecycle.e2e.ts`

### Step 3: Generate Test Files

#### Web App Test Generation

For each page in `build-spec.json.pages`:

**File: `e2e/{page-name}.e2e.ts`**
```typescript
import { test, expect } from "@playwright/test";

test.describe("{PageName} Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("{route}");
  });

  // --- Navigation Tests ---
  test("page loads successfully", async ({ page }) => {
    await expect(page).toHaveTitle(/.+/);
    // No console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  // --- Section Visibility Tests (from build-spec sections) ---
  // For each section in the page:
  test("renders {section} section", async ({ page }) => {
    await expect(page.locator("section").nth(N)).toBeVisible();
    // Or use more specific selectors based on component structure
  });

  // --- Interactive Element Tests ---
  test("navigation links work", async ({ page }) => {
    // For each nav link in the design
    await page.click('a[href="{target-route}"]');
    await expect(page).toHaveURL(/{target-route}/);
  });

  // --- Form Tests (if page has forms) ---
  test("form submission works", async ({ page }) => {
    await page.fill('input[name="{field}"]', "test value");
    await page.click('button[type="submit"]');
    // Verify success state
  });

  // --- Responsive Tests ---
  test("responsive layout at mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Verify mobile-specific elements (hamburger menu, stacked layout)
    await expect(page.locator("[data-testid='mobile-menu-button']")).toBeVisible();
  });

  // --- Visual Regression ---
  test("matches expected appearance", async ({ page }) => {
    await expect(page).toHaveScreenshot("{page-name}-desktop.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
```

#### Chrome Extension Test Generation

For Chrome extensions, generate from `build-spec.json.e2e.extensionManifest`:

**File: `e2e/extension-load.e2e.ts`**
```typescript
import { test, expect } from "./fixtures";

test.describe("Extension Loading", () => {
  test("extension loads and has valid ID", async ({ extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test("service worker is active", async ({ extensionServiceWorker }) => {
    expect(extensionServiceWorker.url()).toContain("chrome-extension://");
  });
});
```

**File: `e2e/popup.e2e.ts`** (if hasPopup)
```typescript
import { test, expect } from "./fixtures";

test.describe("Extension Popup", () => {
  test("popup renders correctly", async ({ extensionPopup }) => {
    // Generated from build-spec components that are popup pages
    await expect(extensionPopup.locator("h1")).toBeVisible();
  });

  // For each interactive element in the popup's build-spec components:
  test("{element} interaction works", async ({ extensionPopup }) => {
    const user = extensionPopup;
    // Click, fill, verify based on component spec
  });

  test("popup visual regression", async ({ extensionPopup }) => {
    await expect(extensionPopup).toHaveScreenshot("popup-default.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
```

**File: `e2e/content-script.e2e.ts`** (if hasContentScript)
```typescript
import { test, expect } from "./fixtures";

test.describe("Content Script", () => {
  test("injects on matching pages", async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    // Use contentScriptMatches from build-spec
    await page.goto("{matching-url}");
    await page.waitForTimeout(2000);
    // Verify content script effect
    await page.close();
  });
});
```

**File: `e2e/storage.e2e.ts`** (if permissions include "storage")
```typescript
import { test, expect } from "./fixtures";

test.describe("Chrome Storage", () => {
  test("persists data across popup opens", async ({ extensionServiceWorker, extensionContext, extensionId }) => {
    // Open popup, set data, close, reopen, verify
    const popup1 = await extensionContext.newPage();
    await popup1.goto(`chrome-extension://${extensionId}/popup.html`);
    // Interact to trigger storage write
    await popup1.close();

    const popup2 = await extensionContext.newPage();
    await popup2.goto(`chrome-extension://${extensionId}/popup.html`);
    // Verify persisted data
    await popup2.close();
  });
});
```

#### PWA Test Generation

**File: `e2e/pwa-install.e2e.ts`**
```typescript
import { test, expect } from "@playwright/test";

test.describe("PWA Installation", () => {
  test("has valid web app manifest", async ({ page }) => {
    await page.goto("/");
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const response = await fetch(link.getAttribute("href")!);
      return response.json();
    });
    expect(manifest).toBeTruthy();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons?.length).toBeGreaterThan(0);
  });

  test("service worker registers", async ({ page }) => {
    await page.goto("/");
    const swRegistered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return !!registration;
    });
    expect(swRegistered).toBe(true);
  });
});
```

**File: `e2e/pwa-offline.e2e.ts`**
```typescript
import { test, expect } from "@playwright/test";

test.describe("Offline Behavior", () => {
  test("shows offline fallback when network unavailable", async ({ page, context }) => {
    // Load page first (to cache)
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Go offline
    await context.setOffline(true);

    // Navigate to cached page
    await page.reload();

    // Should show cached content or offline fallback
    await expect(page.locator("body")).not.toBeEmpty();

    // Restore network
    await context.setOffline(false);
  });
});
```

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

# Service worker lifecycle tests
pnpm exec playwright test --project=sw-lifecycle

# Visual report
pnpm exec playwright test --reporter=html
```

### Step 5: Report Results

Write E2E results to `.claude/visual-qa/e2e-report.md`:

```markdown
# E2E Test Report

## Summary
- App type: {appType}
- Total tests: {N}
- Passed: {N}
- Failed: {N}
- Browsers tested: {list}

## Results by File
| Test File | Tests | Pass | Fail | Duration |
|-----------|-------|------|------|----------|
| extension-load.e2e.ts | 2 | 2 | 0 | 1.2s |

## Failed Tests
- {test name}: {failure reason}

## Visual Regression
- Screenshots saved to: e2e/screenshots/
- Baseline comparison: {pass/fail}
```

### Cross-Browser Test Matrix

| Test Category | Chromium | Firefox | WebKit | Mobile Chrome | Mobile Safari |
|---------------|----------|---------|--------|---------------|---------------|
| **Web App** page load, nav, forms | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Web App** visual regression | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Chrome Ext** loading + popup | ✅ | ✅ (WebExt) | ❌ | ❌ | ❌ |
| **Chrome Ext** MV3 manifest + runtime | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Chrome Ext** storage + messaging | ✅ | ✅ (WebExt) | ❌ | ❌ | ❌ |
| **PWA** manifest + SW registration | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PWA** offline fallback | ✅ | ✅ | ✅ | ❌ | ❌ |
| **PWA** SW lifecycle (deep) | ✅ | ❌ | ❌ | ❌ | ❌ |

## Test Generation Rules

### What to Generate
- Page load and basic rendering for every page in build-spec
- Navigation between all pages
- Form submissions (if forms exist)
- Interactive component behavior (dropdowns, toggles, modals)
- Visual regression screenshots at key breakpoints
- App-type-specific tests (extension loading, PWA install, etc.)

### What NOT to Generate
- Tests that duplicate unit test coverage
- Tests for third-party library behavior
- Flaky timing-dependent tests (use proper waits instead)
- Tests that require external API calls (mock at network level)

### Test Quality Rules
- Use Playwright's auto-waiting (no arbitrary sleeps)
- Prefer role-based locators: `page.getByRole("button", { name: "Submit" })`
- Use `page.getByText()` for content verification
- Test user-visible behavior, not implementation details
- Each test should be independent (no shared state between tests)

## Output

| File | Purpose |
|------|---------|
| `playwright.config.ts` or `playwright.chrome-ext.config.ts` | Test configuration |
| `e2e/fixtures.ts` | Test fixtures (Chrome extension) |
| `e2e/*.e2e.ts` | E2E test files |
| `.claude/visual-qa/e2e-report.md` | Test results report |

## Integration

- **Reads from:** `build-spec.json` (pages, components, e2e flows, appType), `pipeline.config.json` (thresholds)
- **Depends on:** All unit tests passing, components built, app builds successfully
- **Used by:** `/build-from-figma` Phase 6 (between Visual QA and Quality Gate)
- **References:** `templates/chrome-extension/` for extension testing boilerplate

---

**Skill Version:** 2.0.0
**Last Updated:** 2026-03-24
