# Chrome Extension Pipeline Guide

Build Chrome extensions with Manifest V3 through the Aurelius pipeline. Set `appType: "chrome-extension"` in `build-spec.json` to activate extension-specific behavior across all pipeline phases.

## App Type Configuration

During the intake phase, set the app type in `build-spec.json`:

```json
{
  "appType": "chrome-extension",
  "outputTarget": "react",
  "components": [...]
}
```

The pipeline reads `appType` from `pipeline.config.json`, which defines Chrome extension-specific settings including E2E fixtures, manifest generation, and quality gate adjustments.

## Manifest V3

Every Chrome extension needs a `manifest.json`. The converter generates one based on the build-spec's component structure:

```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0",
  "action": { "default_popup": "popup.html" },
  "permissions": ["storage", "activeTab"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }]
}
```

Manifest V3 replaces background pages with service workers and introduces stricter Content Security Policy rules. The pipeline enforces V3 conventions throughout.

## Extension Architecture

Chrome extensions have three main execution contexts:

- **Popup** -- the UI shown when clicking the extension icon. Built as a React app rendered into `popup.html`. This is where most of the pipeline's component generation targets.
- **Background Service Worker** -- long-running logic for message handling, API calls, and event listeners. Defined in `background.js` and declared under `background.service_worker` in the manifest.
- **Content Scripts** -- injected into web pages for DOM manipulation. Declared under `content_scripts` in the manifest with URL match patterns.

## E2E Testing with Playwright

Chrome extensions require a persistent browser context because the `--load-extension` flag only works with Chromium in headed mode. The template fixtures at `templates/chrome-extension/` provide this setup pre-configured.

```typescript
import { chromium } from "playwright";

const context = await chromium.launchPersistentContext("", {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

// Get the extension's background service worker
const [background] = context.serviceWorkers();

// Navigate to popup
const popupPage = await context.newPage();
await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
```

The `templates/chrome-extension/e2e/fixtures.ts` file exports ready-made Playwright fixtures (`extensionContext`, `extensionId`, `extensionPopup`, `extensionServiceWorker`) so tests can skip the boilerplate entirely:

```typescript
import { test, expect } from "./fixtures";

test("popup renders", async ({ extensionPopup }) => {
  await expect(extensionPopup.locator("h1")).toHaveText("My Extension");
});
```

## Testing Popup UI

Navigate to `chrome-extension://<id>/popup.html` and test the popup like any web page. The extension ID is resolved dynamically from the service worker URL at runtime -- the fixtures handle this automatically.

## Testing Content Scripts

Navigate to a target page and verify the content script's DOM modifications:

```typescript
test("content script injects banner", async ({ extensionContext }) => {
  const page = await extensionContext.newPage();
  await page.goto("https://example.com");
  // Content script should inject an element
  await expect(page.locator("#my-extension-banner")).toBeVisible();
});
```

Use `page.evaluate()` to check injected elements or to interact with the content script's API surface.

## Service Worker Testing

Test background script logic through the extension's messaging and storage APIs:

- **Message passing** -- `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- **Storage API** -- `chrome.storage.local.get` / `chrome.storage.local.set`
- **Tab management** -- `chrome.tabs.query` / `chrome.tabs.create`

The `extensionServiceWorker` fixture provides direct access to the background worker for evaluating service worker state.

## Firefox Support

The `templates/chrome-extension/` directory includes a Firefox fixture (`e2e/firefox-fixtures.ts`) for cross-browser extension testing. Firefox uses a different loading mechanism: temporary add-ons are loaded via `about:debugging` instead of command-line flags. The fixture handles this automatically, navigating to `about:debugging`, loading the extension, and extracting the `moz-extension://` ID.

Firefox tests use the `firefox-extension` project in `playwright.chrome-ext.config.ts` and match `**/firefox-*.e2e.ts` test files.

## Pipeline Differences

When `appType` is `"chrome-extension"`, several pipeline phases adjust their behavior:

- **Phase 3 (TDD)** -- generates extension-specific tests covering popup rendering, `chrome.runtime` message passing, and `chrome.storage` API usage.
- **Phase 6 (E2E)** -- uses Playwright persistent context fixtures from `templates/chrome-extension/` instead of standard browser launch.
- **Phase 7 (Cross-Browser)** -- tests in both Chrome and Firefox using separate fixture files. WebKit is excluded (no extension support).
- **Phase 8 (Quality Gate)** -- Lighthouse is skipped because extensions are not web pages. Manifest validation is added in its place, checking required fields and V3 compliance.

## Troubleshooting

**Extension not loading in Playwright** -- ensure `extensionPath` points to the build output directory containing `manifest.json`. Extensions require `headless: false`; headless Chromium does not support extension loading.

**Service worker not registering** -- check the `background.service_worker` field in `manifest.json`. Service workers replace background pages from Manifest V2. If migrating, remove the old `background.scripts` array.

**Content script not injecting** -- check `content_scripts.matches` in the manifest. Ensure the test navigates to a URL that matches the declared pattern (e.g., `<all_urls>` or a specific domain).

**Popup shows blank page** -- verify that `popup.html` exists in the build output directory and that React is bundled correctly. Check the browser console for CSP violations, which are common with Manifest V3's stricter policy.
