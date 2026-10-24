# Figma-to-React Pipeline

Convert Figma designs into fully working, tested React applications with a single command.

## Overview

The `/build-from-figma` command runs a 12-phase autonomous pipeline:

```
[0] Token Sync  → sync-tokens.sh → drift check (conditional)
[1] Intake      → figma-intake skill → build-spec.json
[2] Token Lock  → design-token-lock skill → lockfile + Tailwind config
[3] TDD (Gate)  → tdd-from-figma skill → failing tests (RED), test checksums recorded
[4] Build       → component-lanes workflow → one converter lane per component (GREEN)
[4.5] Storybook → generate-stories.sh → auto-generated stories
[5] Visual Diff → component-lanes workflow → bounded pixel-diff rounds, one fixer per component
[5.5] Dark Mode → check-dark-mode.sh → dark mode verification
[6] E2E Tests   → e2e-test-generator skill → Playwright tests
[7] Cross-Browser→ Firefox/WebKit screenshots (non-blocking)
[8] Quality Gate → coverage + TypeScript + build + tokens + Lighthouse + mutation score (opt-in)
[8.5] Responsive→ check-responsive.sh → screenshots at 5 breakpoints (non-blocking)
[9] Report      → .claude/visual-qa/build-report.md + docs/components/
```

Phases 4 and 5 run through the `component-lanes` workflow (`.claude/workflows/component-lanes.js`) when the Workflow tool is available: the attempt bound, the check that no test file changed, the visual iteration bound and the pass decision are enforced in its code. `parallel-orchestration` then runs Phases 4.5-9, or all of 4-9 without workflows. The run's progress lives in `.claude/plans/pipeline-state.json`, so an interrupted session resumes where it stopped.

## Prerequisites

- **Claude Code** in an Aurelius checkout (the agents, skills, hooks and workflow load from `.claude/`)
- **Figma MCP** configured (Figma Desktop app running locally, or remote MCP fallback)
- **Chrome DevTools MCP** for screenshots and Lighthouse audits (not in `.mcp.json`; add it at user scope, see `.claude/PLUGINS-REFERENCE.md`)
- **Playwright MCP** for cross-browser testing
- **Node.js 18+** and **pnpm** installed
- **Figma file URL** with designs ready for development

## Quick Start

```
/build-from-figma https://figma.com/file/abc123/My-Design?node-id=1-2
```

The pipeline handles everything: Figma discovery, token extraction, test generation, component building, visual verification, E2E testing, and quality gates.

## What Gets Generated

```
app/
├── src/
│   ├── components/          # React components from Figma
│   │   ├── Hero.tsx
│   │   ├── Hero.test.tsx    # Tests written BEFORE components
│   │   ├── Navigation.tsx
│   │   └── ...
│   ├── styles/
│   │   ├── design-tokens.lock.json  # Locked design values
│   │   ├── tokens.css               # CSS custom properties
│   │   └── globals.css              # Tailwind base
│   └── types/
│       └── design-system.ts
├── docs/
│   └── components/           # Auto-generated component docs
│       ├── index.mdx         # Component index with status table
│       ├── Hero.mdx          # Per-component documentation
│       └── Navigation.mdx
├── e2e/                     # Generated Playwright E2E tests
├── tailwind.config.ts       # Generated from design tokens
├── vitest.config.ts
└── package.json
```

### Pipeline Artifacts (in `.claude/`)

```
.claude/
├── plans/
│   └── build-spec.json          # Machine-readable build plan
├── visual-qa/
│   ├── build-report.md          # Final report
│   ├── e2e-report.md            # E2E test results
│   ├── screenshots/
│   │   ├── figma/               # Reference screenshots from Figma
│   │   ├── dark/               # Dark mode screenshots
│   │   ├── chromium/            # App screenshots
│   │   ├── firefox/             # Cross-browser (if applicable)
│   │   └── webkit/              # Cross-browser (if applicable)
│   └── diffs/                   # Pixel-diff images (magenta highlights)
└── pipeline.config.json         # Thresholds and settings
```

## Supported App Types

The pipeline detects the app type from `manifest.json` and adjusts its strategy:

### Web App (default)
- Standard Playwright E2E: page navigation, forms, responsive layout
- Dev server for visual QA
- Cross-browser verification (Firefox, WebKit)

### Chrome Extension
- Detected when `manifest.json` contains `manifest_version`
- E2E uses `chromium.launchPersistentContext` with `--load-extension`
- Tests cover: extension loading, popup rendering, Chrome storage, content scripts, message passing
- Must build before testing (`pnpm build`), no dev server
- Cross-browser verification skipped (Chromium only)

### PWA
- Detected when `manifest.json` contains `start_url` or `display`
- E2E includes: install prompt, offline fallback, service worker registration
- Dev server for visual QA
- Cross-browser verification included

## Enforcement Rules

### TDD is Mandatory
Phase 3 must complete before Phase 4 begins. Tests are written first, confirmed to fail (RED), then components are built to make them pass (GREEN). If tests fail after component generation, the component is fixed -- never the test.

### Pixel-Diff Visual QA
Phase 5 uses `scripts/visual-diff.js` (pixelmatch) for programmatic comparison:
- Captures Figma reference screenshots once
- Iterates up to 5 times (configurable in `pipeline.config.json`)
- Pass threshold: 2% pixel mismatch (configurable)
- Region-based analysis identifies which areas need fixes (4x4 grid)
- Diff images saved for review

### Advanced Visual Analysis

Phase 5 includes three additional analysis layers beyond pixel comparison:

- **Sub-pixel classification** — Diff pixels are classified as sub-pixel rendering artifacts (isolated 1-2px clusters) vs real differences (larger connected regions). When >50% of diffs are sub-pixel, the report flags this so developers know the mismatch is cosmetic, not structural.

- **Font weight detection** — Luminance analysis of text regions detects when rendered font weight differs from the design (e.g., 400 vs 700). Reports whether the actual rendering is "heavier" or "lighter" than expected.

- **Font fallback detection** — Character density profile comparison detects when a fallback font is rendering instead of the intended font family. Different fonts have different character widths, producing measurably different density patterns.

- **Layout drift detection** — Cross-correlation of horizontal/vertical projection profiles detects when content has shifted position between screenshots. Reports estimated dx/dy offset in pixels. Threshold: >2px triggers a warning.

These analyses are enabled by default and configurable in `pipeline.config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `visualDiff.subPixelClassification` | true | Classify diff pixels as sub-pixel vs real |
| `visualDiff.typographyAnalysis` | true | Detect font weight and fallback mismatches |
| `visualDiff.layoutDriftAnalysis` | true | Detect content position shifts |
| `visualDiff.subPixelMaxClusterSize` | 2 | Max cluster size for sub-pixel classification |
| `visualDiff.fontWeightThreshold` | 15 | Luminance difference for weight mismatch |
| `visualDiff.fontFallbackDensityThreshold` | 0.05 | Density diff for fallback detection |
| `visualDiff.layoutShiftThresholdPx` | 2 | Pixel shift threshold for layout drift |

### Design Token Lockfile
All design values (colors, typography, spacing, text content) are extracted into `design-tokens.lock.json`. Components must reference tokens through Tailwind classes -- no hardcoded values. Enforced by `scripts/verify-tokens.sh`.

## Configuration

All pipeline behavior is controlled by `.claude/pipeline.config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `visualDiff.threshold` | 0.02 | Pixel mismatch pass threshold (2%) |
| `iterationLoop.maxVisualIterations` | 5 | Max visual fix iterations |
| `tdd.enforced` | true | TDD gate cannot be bypassed |
| `tdd.coverageThreshold` | 80 | Minimum test coverage percentage |
| `qualityGate.lighthouseThresholds.accessibility` | 90 | Minimum Lighthouse a11y score |
| `appTypes.chrome-extension.extensionPathDefault` | "dist" | Built extension directory |
| `darkMode.enabled` | true | Enable dark mode visual verification |
| `darkMode.diffThreshold` | 0.03 | Dark mode pixel mismatch threshold |
| `storybook.autoGenerate` | true | Auto-generate Storybook stories |
| `tokenSync.autoCheck` | true | Check for token drift before extraction |

See the full config file for all options.

## Key Skills

| Skill | Phase | Purpose |
|-------|-------|---------|
| figma-intake | 1 | Auto-discovers Figma structure, asks targeted questions, writes build-spec.json |
| design-token-lock | 2 | Extracts all design values into a lockfile |
| tdd-from-figma | 3 | Writes failing tests for every component |
| figma-to-react-workflow | 4 | Generates components that pass the tests |
| visual-qa-verification | 5 | Pixel-diff comparison loop |
| e2e-test-generator | 6 | Generates Playwright E2E tests |
| sync-tokens.sh | 0 | Detects token drift between lockfile and source |
| generate-stories.sh | 4.5 | Auto-generates Storybook stories |
| check-dark-mode.sh | 5.5 | Dark mode visual verification |
| generate-component-docs.sh | 9 | MDX component documentation |
| check-responsive.sh | 8.5 | Responsive screenshots at 5 breakpoints |

## Agent Integration

| Agent | Role |
|-------|------|
| **figma-react-converter** | Reads Figma, generates components |
| **asset-cataloger** | Maps hash-named image exports to semantic filenames |
| **visual-qa-agent** | Compares rendered output against Figma screenshots |
| **accessibility-auditor** | WCAG compliance check on generated components |
| **test-writer-fixer** | Fixes test failures during component generation |

## Troubleshooting

- **Figma MCP unavailable:** Verify Figma Desktop app is running. Check MCP config in `.claude/settings.json`. Test with `mcp__figma__whoami`.
- **No Figma variables defined:** Token extraction will rely on computed styles (less accurate). Define named styles/variables in Figma for best results.
- **Visual diff threshold too strict:** Adjust `visualDiff.threshold` in `pipeline.config.json`. Anti-aliasing differences are common -- enable `antialiasing: true`.
- **Chrome extension E2E fails:** Ensure `pnpm build` succeeds first. Check that `dist/manifest.json` exists. Extension tests require non-headless Chromium.
- **Tests won't pass after 3 attempts:** Pipeline marks the component for manual intervention and continues with remaining components.
- **Session interrupted:** The pipeline tracks its run in `.claude/plans/pipeline-state.json`, and the next session's status block says where it stopped. Re-run `/build-from-figma`: completed phases are skipped and the run resumes at the first incomplete one.

## Related Documentation

- `docs/canva-to-react/README.md` -- Canva-to-React conversion pipeline
- `scripts/README.md` -- Scripts reference (visual-diff.js, verify-tokens.sh, verify-test-coverage.sh)
- `templates/README.md` -- Starter configs including Chrome extension E2E templates
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
- `docs/react-development/README.md` -- React development standards
