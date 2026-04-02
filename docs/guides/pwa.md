# PWA Pipeline Guide

Build Progressive Web Apps through the Aurelius pipeline. Set `appType: "pwa"` in `build-spec.json` to activate PWA-specific behavior including manifest generation, service worker scaffolding, and offline testing.

## App Type Configuration

During the intake phase, set the app type in `build-spec.json`:

```json
{
  "appType": "pwa",
  "outputTarget": "react",
  "components": [...]
}
```

The pipeline reads `appType` from `pipeline.config.json`, which defines PWA-specific settings including caching strategies, Lighthouse PWA thresholds, and installability checks.

## What Makes a PWA

A Progressive Web App must satisfy three requirements:

- **HTTPS** (or localhost) -- the page must be served over a secure origin.
- **Web app manifest** -- a JSON file describing the app's name, icons, theme, and display mode.
- **Service worker** -- a script that intercepts network requests and enables offline support.

The pipeline generates and validates all three. HTTPS is assumed for production deployments; `localhost` is accepted during development and E2E testing.

## Web App Manifest

The pipeline generates a `manifest.json` with all required fields:

```json
{
  "name": "My App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3B82F6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`theme_color` and `background_color` are pulled from `design-tokens.lock.json` so they stay consistent with the design source. Icons are generated from the original design assets at the required 192x192 and 512x512 sizes.

## Service Worker Lifecycle

The service worker operates through three key events:

- **install** -- cache critical assets (HTML, CSS, JS, fonts) so the app can load offline immediately after first visit.
- **activate** -- clean up old caches from previous versions and take control of all open clients.
- **fetch** -- intercept every network request and decide whether to serve from cache or fetch from the network.

The pipeline generates a service worker with sensible defaults for each event. Next.js projects can use `next-pwa` or `@serwist/next` instead of a hand-written worker -- the pipeline detects these dependencies and defers to them when present.

## Caching Strategies

The generated service worker applies three strategies depending on resource type:

- **Cache-first** for static assets (CSS, JS, images, fonts) -- serves from cache immediately for fast loads, falling back to the network only on cache miss.
- **Network-first** for API calls and dynamic content -- always fetches fresh data, falling back to cache when offline.
- **Stale-while-revalidate** for pages -- serves the cached version instantly while fetching an updated copy in the background for next time.

These strategies are configurable in the generated service worker file. Adjust them based on how frequently your content changes and how critical freshness is.

## Offline Testing

Playwright can emulate offline mode to verify the service worker handles disconnection correctly:

```typescript
// Go offline
await context.setOffline(true);
await page.reload();

// Verify offline fallback page renders
expect(await page.textContent("h1")).toContain("Offline");

// Go back online
await context.setOffline(false);
```

The `templates/pwa/` directory provides pre-built E2E tests covering offline navigation, cached asset loading, and recovery after reconnection.

## Installability

The pipeline verifies that the PWA meets all installability criteria:

- Valid `manifest.json` with all required fields populated
- Service worker registered and controlling the page
- Served over HTTPS (or localhost for development)
- Icons provided at 192x192 and 512x512 minimum
- Lighthouse PWA audit passes with no critical failures

If any criterion fails, the quality gate reports exactly which check did not pass and what needs to be fixed.

## Template Files

The `templates/pwa/` directory provides:

- **Playwright config** -- project configuration for PWA-specific E2E testing
- **E2E test files** -- tests for offline fallback, install prompt, and cache behavior
- **Service worker template** -- a starter `sw.js` with the three caching strategies pre-configured

These files are copied into the project during Phase 4 (Build) and customized based on the build-spec and design tokens.

## Lighthouse PWA Audit

The quality gate runs Lighthouse with the PWA category enabled. It checks:

- Installability (manifest fields, service worker, icons)
- Service worker registration and offline capability
- HTTPS redirect from HTTP
- Splash screen configuration
- Themed address bar (`theme_color` in manifest and meta tag)

Thresholds are defined in `pipeline.config.json` under the `appTypes.pwa` section. The default minimum PWA score is aligned with the overall Lighthouse thresholds configured for the quality gate.

## Pipeline Differences

When `appType` is `"pwa"`, several pipeline phases adjust their behavior:

- **Phase 4 (Build)** -- generates `manifest.json` and a service worker alongside the React components. Links the manifest in `<head>` and registers the worker on page load.
- **Phase 6 (E2E)** -- includes offline and installability tests from `templates/pwa/` in addition to the standard user-flow tests.
- **Phase 8 (Quality Gate)** -- Lighthouse runs with the PWA category enabled. A manifest validation step checks required fields and icon sizes.

## Troubleshooting

**Service worker not registering** -- the worker must be served over HTTPS or localhost. Verify that `sw.js` is in the public directory (or build output root) so it is served from the site origin. Service workers cannot be loaded from a subdirectory unless their scope is explicitly set.

**Not installable** -- check that `manifest.json` includes `name`, `start_url`, `display`, `icons`, and `theme_color`. Icons must be at least 192x192 and 512x512. Run the Lighthouse PWA audit for a detailed breakdown of which criteria failed.

**Offline page not loading** -- confirm that the `install` event caches the offline fallback page URL. If using cache-first for pages, ensure the fallback HTML is in the precache list. Check the service worker's fetch handler for routing errors.

**Old content after deploy** -- the service worker cache needs invalidation. Version the cache name (e.g., `app-cache-v2`) so the `activate` event can delete old caches. Alternatively, use stale-while-revalidate for pages so users get fresh content on the next navigation.
