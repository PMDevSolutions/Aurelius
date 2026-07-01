# Templates Reference

**Last Updated:** 2026-03-24

Starter configuration files for new projects. These are copied by `scripts/setup-project.sh` or referenced directly when scaffolding a new app.

## Directory Structure

```
templates/
├── shared/              # Framework-agnostic configs (used by all project types)
├── nextjs/              # Next.js-specific configs
├── vite/                # Vite-specific configs
├── astro/               # Astro hybrid-islands starter (React islands + Tailwind)
├── vue/                 # Vue 3 + Vite configs
├── sveltekit/           # SvelteKit configs
├── expo/                # Expo + React Native configs
├── chrome-extension/    # Chrome extension E2E testing templates
└── pwa/                 # PWA E2E testing templates (offline, SW lifecycle)
```

## Shared Templates (`shared/`)

These configs apply to any React project regardless of framework:

| File | Purpose |
|------|---------|
| `eslint.config.js` | ESLint flat config with React, TypeScript, and jsx-a11y plugins |
| `prettier.config.js` | Prettier formatting rules (2-space indent, trailing commas) |
| `tailwind.config.ts` | Base Tailwind config with design token structure |
| `tsconfig.json` | TypeScript strict mode with path aliases |
| `vitest.config.template.ts.tpl` | Vitest config with jsdom, RTL setup, and coverage thresholds |
| `playwright.config.ts` | Shared cross-browser Playwright config (chromium, firefox, webkit, mobile) |
| `css/cross-browser-reset.css` | Cross-browser CSS normalization (fonts, scrollbars, forms, focus) |

### Usage

Copy into your project root when starting a new app:

```bash
cp templates/shared/eslint.config.js .
cp templates/shared/prettier.config.js .
cp templates/shared/tailwind.config.ts .
cp templates/shared/tsconfig.json .
cp templates/shared/vitest.config.template.ts.tpl vitest.config.ts
```

Or use the setup script: `./scripts/setup-project.sh my-app --vite`

## Next.js Templates (`nextjs/`)

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config with App Router defaults |

### Usage

```bash
./scripts/setup-project.sh my-app --next
```

Copies shared templates plus Next.js-specific config.

## Vite Templates (`vite/`)

| File | Purpose |
|------|---------|
| `vite.config.ts.tpl` | Vite config with React plugin, path aliases, and build optimizations |

### Usage

```bash
./scripts/setup-project.sh my-app --vite
```

Copies shared templates plus Vite-specific config.

## Astro Templates (`astro/`)

| File | Purpose |
|------|---------|
| `astro.config.mjs` | Astro config with `@astrojs/react` (islands) + `@tailwindcss/vite` (Tailwind v4) |
| `package.json` | Astro + React island deps; Vitest + RTL + jsdom for tests |
| `tsconfig.json` | Extends `astro/tsconfigs/strict`, `jsx: react-jsx` for islands |
| `tailwind.config.mjs` | Tailwind content globs covering `.astro`, `.tsx`, `.ts`, `.md`, `.mdx` |
| `vitest.config.ts` | `getViteConfig` wiring jsdom + Astro Container API testing |
| `src/pages/index.astro` | Example page composing a static `.astro` + a React island |
| `src/components/Hero.astro` | Static, zero-JS component (props via frontmatter `interface Props`) |
| `src/components/Counter.tsx` | Interactive React island, hydrated with `client:*` |
| `src/test/setup.ts` | Imports `@testing-library/jest-dom` |

### Usage

```bash
./scripts/setup-project.sh my-app --renderer astro
```

Hybrid output: static/presentational components are zero-JS `.astro` files; interactive components are React islands (`.tsx`) hydrated via `client:load`/`client:visible`. Static components are tested with the Astro Container API (`experimental_AstroContainer` from `astro/container`); islands use Vitest + @testing-library/react.

## Vue 3 Templates (`vue/`)

| File | Purpose |
|------|---------|
| `vite.config.ts.tpl` | Vite config with Vue plugin and path aliases |
| `tsconfig.json` | TypeScript config for Vue 3 with strict mode |
| `vitest.config.ts.tpl` | Vitest config with @vue/test-utils setup |
| `tailwind.config.ts` | Tailwind config with Vue-compatible content paths |

### Usage

```bash
./scripts/setup-project.sh my-app --vue
```

Copies shared templates plus Vue 3-specific configs. Sets up a Vue 3 + Vite + Tailwind CSS + Vitest project with Composition API (`<script setup>`) as the default component pattern.

## SvelteKit Templates (`sveltekit/`)

| File | Purpose |
|------|---------|
| `svelte.config.js` | SvelteKit config with Vite adapter |
| `vite.config.ts.tpl` | Vite config with SvelteKit plugin |
| `tsconfig.json` | TypeScript config for Svelte |
| `vitest.config.ts.tpl` | Vitest config with @testing-library/svelte setup |
| `tailwind.config.ts` | Tailwind config with Svelte-compatible content paths |

### Usage

```bash
./scripts/setup-project.sh my-app --sveltekit
```

Copies shared templates plus SvelteKit-specific configs. Sets up a SvelteKit + Tailwind CSS + Vitest project with TypeScript support.

## Expo Templates (`expo/`)

| File | Purpose |
|------|---------|
| `app.json` | Expo app config with default settings |
| `tsconfig.json` | TypeScript config for React Native / Expo |
| `jest.config.ts` | Jest config with @testing-library/react-native setup |
| `tailwind.config.ts` | NativeWind (Tailwind for React Native) config |
| `babel.config.js` | Babel config with NativeWind preset |

### Usage

```bash
./scripts/setup-project.sh my-app --expo
```

Sets up an Expo + NativeWind + Jest project with TypeScript. Uses Expo Router for navigation and NativeWind for Tailwind CSS-style styling in React Native.

## PWA Templates (`pwa/`)

Playwright E2E testing infrastructure for Progressive Web Apps. These are used by the `e2e-test-generator` skill (Phase 6 of `/build-from-figma`) for PWA app types.

| File | Purpose |
|------|---------|
| `playwright.pwa.config.ts` | Playwright config with offline + cross-browser projects (10 total) |
| `e2e/pwa-install.e2e.ts` | Manifest validation and service worker registration tests |
| `e2e/pwa-offline.e2e.ts` | Offline fallback, cached navigation, and network recovery tests |
| `e2e/sw-lifecycle.e2e.ts` | Full SW lifecycle: install, activate, fetch, update, cache strategy |

### How PWA E2E Works

PWA tests run across all browsers with additional offline-specific projects:

1. **Standard tests** (chromium, firefox, webkit, mobile): Page navigation, forms, responsive
2. **Offline tests** (pwa-offline, pwa-offline-firefox, pwa-offline-webkit): Service worker caching, offline fallback, network recovery
3. **SW lifecycle tests** (sw-lifecycle, Chrome only): Deep service worker install/activate/fetch/update testing

### Usage

```bash
# Copy templates into your PWA project
cp templates/pwa/playwright.pwa.config.ts playwright.config.ts
cp -r templates/pwa/e2e ./e2e

# Install Playwright (all browsers)
pnpm add -D @playwright/test
pnpm exec playwright install

# Run tests
pnpm exec playwright test

# Offline tests only
pnpm exec playwright test --project=pwa-offline
```

## Chrome Extension Templates (`chrome-extension/`)

Playwright E2E testing infrastructure for Chrome extensions. These are used by the `e2e-test-generator` skill (Phase 6 of `/build-from-figma`) and can be copied manually for any Chrome extension project.

| File | Purpose |
|------|---------|
| `playwright.chrome-ext.config.ts` | Playwright config for extension testing (non-headless, single worker) |
| `e2e/fixtures.ts` | Custom Playwright fixtures: `extensionContext`, `extensionId`, `extensionPopup`, `extensionServiceWorker` |
| `e2e/extension.e2e.ts` | Example E2E tests: extension loading, popup rendering, Chrome storage, content scripts, message passing, visual regression |
| `e2e/manifest-v3.e2e.ts` | MV3 manifest structure validation + runtime API checks |
| `e2e/firefox-fixtures.ts` | Firefox WebExtension test fixtures (`firefoxContext`, `firefoxExtensionId`, `firefoxExtensionPopup`) |
| `e2e/firefox-webext.e2e.ts` | Firefox-specific extension loading, API, and visual regression tests |

### How Chrome Extension E2E Works

Chrome extensions cannot run in headless mode. The fixtures use `chromium.launchPersistentContext` with `--load-extension` to load the built extension:

1. Build the extension: `pnpm build`
2. Playwright launches Chromium with the extension loaded from `dist/`
3. The `extensionId` fixture extracts the ID from the service worker URL
4. The `extensionPopup` fixture opens `chrome-extension://<id>/popup.html` as a page
5. Tests interact with the popup, service worker, storage, and content scripts

### Usage

```bash
# Copy templates into your Chrome extension project
cp templates/chrome-extension/playwright.chrome-ext.config.ts .
cp -r templates/chrome-extension/e2e ./e2e

# Install Playwright
pnpm add -D @playwright/test
pnpm exec playwright install chromium

# Build and test
pnpm build
pnpm exec playwright test --config=playwright.chrome-ext.config.ts
```

### Environment Variables

- `EXTENSION_PATH` -- Override the path to the built extension (default: `./dist`)
