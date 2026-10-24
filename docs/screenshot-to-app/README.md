# Screenshot/URL-to-App Pipeline

Build fully working, tested applications from screenshots or live URLs with a single command -- no design tool needed.

## Overview

The `/build-from-screenshot` command runs the same 12-phase autonomous pipeline as `/build-from-figma` and `/build-from-canva`, with a screenshot-specific Phase 1 for URL capture or image file intake. Supports all output targets: React, Vue 3, Svelte/SvelteKit, and React Native (Expo).

```
[0] Token Sync  → sync-tokens.sh → drift check (conditional)
[1] Intake      → screenshot-intake skill → build-spec.json (screenshot-specific)
[2] Token Infer → canva-token-inference skill → lockfile + Tailwind config (AI-powered, shared)
[3] TDD (Gate)  → tdd-from-figma skill → failing tests (RED)
[4] Build       → converter agent (dispatched by outputTarget) → components pass tests (GREEN)
[4.5] Storybook → generate-stories.sh → auto-generated stories
[5] Visual Diff → visual-qa-verification skill → pixel-diff loop
[5.5] Dark Mode → check-dark-mode.sh → dark mode verification
[6] E2E Tests   → e2e-test-generator skill → Playwright tests
[7] Cross-Browser→ Firefox/WebKit screenshots (non-blocking)
[8] Quality Gate → coverage + TypeScript + build + tokens + Lighthouse + mutation score (opt-in)
[8.5] Responsive→ check-responsive.sh → screenshots at 5 breakpoints (non-blocking)
[9] Report      → .claude/visual-qa/build-report.md + docs/components/
```

## Prerequisites

- **Claude Code** with the framework's agents, skills, and plugins installed
- **Chrome DevTools MCP** for URL screenshot capture, Lighthouse audits, and DOM inspection
- **Playwright MCP** for cross-browser testing
- **Node.js 18+** and **pnpm** installed

## Quick Start

### From a URL

```
/build-from-screenshot https://example.com
```

The pipeline captures screenshots of the live site at multiple viewports, then runs the full conversion pipeline.

### From image files

```
/build-from-screenshot ./designs/homepage.png ./designs/about.png
```

Provide one or more screenshot images. The pipeline uses Claude vision to analyze the designs.

### With a specific output target

```
/build-from-screenshot https://example.com --outputTarget vue
```

Override the default React output target. Valid values: `react`, `vue`, `svelte`, `react-native`.

## Input Modes

| Mode | Input | How It Works |
|------|-------|-------------|
| **URL capture** | A live URL | Chrome DevTools MCP navigates to the URL and captures screenshots at multiple breakpoints (320, 768, 1024, 1280, 1920px) |
| **Image files** | One or more `.png`, `.jpg`, `.webp` files | Files are read directly and analyzed with Claude vision |

## How It Differs from Figma/Canva Pipelines

| Aspect | Figma Pipeline | Canva Pipeline | Screenshot Pipeline |
|--------|---------------|----------------|-------------------|
| **Design access** | Figma MCP reads structured layer data | Canva MCP exports screenshots | URL capture or provided images |
| **Design tool required** | Yes (Figma) | Yes (Canva) | No |
| **Token extraction** | Direct API extraction | AI inference from screenshots | AI inference from screenshots (shared with Canva) |
| **Component detection** | Figma frames/components with names | Vision-based from screenshots | Vision-based from screenshots |
| **Phase 1 skill** | figma-intake | canva-intake | screenshot-intake |
| **Phase 2 skill** | design-token-lock | canva-token-inference | canva-token-inference (shared) |
| **Phase 4 agent** | figma-react-converter | canva-react-converter | Dispatched by outputTarget |
| **Output targets** | React only | React only | React, Vue, Svelte, React Native |
| **Phases 3, 5-9** | Shared | Shared | Shared (identical) |

## Phase 1: Screenshot Intake

The `screenshot-intake` skill handles design discovery:

1. **URL mode:** Navigates to the URL using Chrome DevTools MCP, captures full-page screenshots at 5 breakpoints, and extracts any accessible DOM metadata (fonts, colors, spacing).
2. **Image mode:** Reads the provided image files directly.
3. **Vision analysis:** Uses Claude vision to identify page structure, components, layout patterns, color palette, typography, and interactive elements.
4. **Interview:** Asks targeted questions about app type, functionality, and output target preference.
5. **Output:** Produces `build-spec.json` with `source: "screenshot"`, detected `appType`, and `outputTarget`.

## Phase 4: Framework-Specific Build

Phase 4 dispatches to the appropriate converter agent based on the `outputTarget` field in `build-spec.json`:

| outputTarget | Converter Agent | Styling | Test Library |
|-------------|----------------|---------|-------------|
| `react` | figma-react-converter | Tailwind CSS | Vitest + @testing-library/react |
| `vue` | vue-converter | Tailwind CSS | Vitest + @vue/test-utils |
| `svelte` | svelte-converter | Tailwind CSS | Vitest + @testing-library/svelte |
| `react-native` | react-native-converter | NativeWind | Jest + @testing-library/react-native |

## Key Artifacts

- `build-spec.json` -- Machine-readable build plan with `source`, `appType`, `outputTarget`, component list, and E2E flows
- `design-tokens.lock.json` -- Single source of truth for all design values (colors, typography, spacing, radii, shadows)
- `.claude/visual-qa/build-report.md` -- Final pipeline report with diff images and documentation links

## Supported App Types

| App Type | Detection | E2E Strategy | Special Handling |
|----------|-----------|-------------|-----------------|
| **Web App** | Default | Page navigation, forms, responsive | Standard Playwright |
| **Chrome Extension** | `manifest.json` with `manifest_version` | Extension load, popup, storage, content scripts | Persistent browser context with `--load-extension` |
| **PWA** | `manifest.json` with `start_url` | Install prompt, offline fallback | Service worker and offline tests |
| **React Native** | `app.json` with Expo config | Detox or Maestro flows | NativeWind styling, platform-specific components |

## Configuration

Screenshot-specific settings in `.claude/pipeline.config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `screenshot.enabled` | true | Enable screenshot pipeline support |
| `screenshot.captureBreakpoints` | [320, 768, 1024, 1280, 1920] | Viewport widths for URL capture |
| `screenshot.captureFullPage` | true | Capture full scrollable page |
| `screenshot.waitForNetwork` | true | Wait for network idle before capture |
| `screenshot.maxImages` | 10 | Maximum number of input images to process |

All other settings (visual diff threshold, TDD enforcement, coverage threshold, Lighthouse minimums, token inference confidence) are shared with the Figma and Canva pipelines.

## Troubleshooting

- **URL capture fails:** Ensure Chrome DevTools MCP is running and accessible. Check that the target URL is not behind authentication or a firewall. Try capturing manually with `mcp__chrome-devtools__take_screenshot` first.
- **Token inference inaccurate:** Increase screenshot resolution or provide higher-quality images. Lower the confidence threshold to flag more tokens for manual review.
- **Wrong framework detected:** Explicitly pass `--outputTarget` to override auto-detection, or set `outputTarget` in the intake interview.
- **Visual diff threshold too strict:** Adjust `visualDiff.threshold` in `pipeline.config.json`. Screenshot-sourced designs may have rendering differences -- consider using 3% threshold.
- **Tests won't pass after 3 attempts:** Pipeline marks the component for manual intervention and continues with remaining components.
- **Session interrupted:** The pipeline tracks its run in `.claude/plans/pipeline-state.json`, and the next session's status block says where it stopped. Re-run `/build-from-screenshot`: completed phases are skipped and the run resumes at the first incomplete one.

## Related Documentation

- `docs/figma-to-react/README.md` -- Figma-to-React conversion pipeline
- `docs/canva-to-react/README.md` -- Canva-to-React conversion pipeline
- `docs/multi-framework/README.md` -- Multi-framework output target documentation
- `scripts/README.md` -- Scripts reference (visual-diff.js, verify-tokens.sh, verify-test-coverage.sh)
- `templates/README.md` -- Starter configs including Vue, SvelteKit, and Expo templates
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
