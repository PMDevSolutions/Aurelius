# Pipeline Configuration Guide

All pipeline behavior is controlled by `.claude/pipeline.config.json`. This document explains every section, what the defaults are, and how to customize them. Every field documented here traces directly to a property in the JSON Schema, and every default shown is the value currently in the live config.

---

## Schema & Validation

The config is backed by a JSON Schema: [.claude/pipeline.config.schema.json](../../.claude/pipeline.config.schema.json). The schema is the authoritative definition of every field — its type, constraints (min/max/enum/pattern), and a description.

The very first line of `.claude/pipeline.config.json` is:

```json
"$schema": "./pipeline.config.schema.json"
```

This relative pointer is what gives you a great editing experience for free: most modern editors (VS Code, JetBrains IDEs) read the `$schema` key and automatically provide **autocomplete**, **inline validation**, **hover documentation**, and **enum suggestions** as you type. No setup required.

### Validating locally

Run the wrapper script to validate the live config against the schema:

```bash
./scripts/validate-pipeline-config.sh          # validate live config, human-readable
./scripts/validate-pipeline-config.sh --json   # machine-readable output
```

The wrapper calls the underlying Node validator, which you can also run directly:

```bash
node scripts/validate-pipeline-config.js
node scripts/validate-pipeline-config.js --json
node scripts/validate-pipeline-config.js --config <path/to/config.json>
node scripts/validate-pipeline-config.js --schema <path/to/schema.json>
```

**Exit codes:**

| Code | Meaning |
| ---- | ------- |
| `0` | Config is valid against the schema |
| `1` | Schema or structural errors (the config violates the schema) |
| `2` | Usage or IO error (bad flags, missing/unreadable file, invalid JSON) |

### Validation in CI

Validation runs automatically in CI. The GitHub Actions `script-tests` job runs `node scripts/validate-pipeline-config.js` on every push and pull request, so any change to `pipeline.config.json` is validated before it can merge. A config that fails the schema fails the build.

### Editor Setup

Because the config already carries a `$schema` key, most editors pick up the schema with **no configuration at all**. The mapping below is a fallback for editors that do not honor inline `$schema` references.

For VS Code, add the following to `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": [".claude/pipeline.config.json"],
      "url": "./.claude/pipeline.config.schema.json"
    }
  ]
}
```

This explicitly associates the config file with the schema, enabling autocomplete and validation even when the inline `$schema` key is ignored.

---

## File Location

```
.claude/pipeline.config.json
```

The file is version-controlled and shared across all developers. Changes to thresholds affect all pipeline runs in the repository.

---

## Top-Level Meta Fields

These three fields live at the root of the config. `version` is the only **required** field in the entire schema.

| Field         | Type                                | Default                                                              | Description                                                                                |
| ------------- | ----------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `$schema`     | `string`                            | `"./pipeline.config.schema.json"`                                   | JSON Schema URI used by editors for validation and autocompletion.                         |
| `description` | `string`                            | `"Configuration for the Figma-to-React autonomous build pipeline"`  | Free-text description of the config file.                                                  |
| `version`     | `string` (pattern `^\d+\.\d+\.\d+$`) | `"1.0.0"`                                                            | Semantic version of the config schema in use. **Required.** Must be `MAJOR.MINOR.PATCH`.   |

```json
{
  "$schema": "./pipeline.config.schema.json",
  "description": "Configuration for the Figma-to-React autonomous build pipeline",
  "version": "1.0.0"
}
```

---

## Shared Types

The schema defines 9 reusable types in its `$defs` block. Several sections below reference these, so they are documented once here.

| Type (`$def`)            | Underlying shape                                                                                                                                                                | Description                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `percentageRatio`        | `number (0–1)`                                                                                                                                                                  | A ratio between 0 and 1 (e.g. `0.02` = 2%).                                                                                                                                                      |
| `percentageInt`          | `integer (0–100)`                                                                                                                                                              | A whole-number percentage between 0 and 100.                                                                                                                                                    |
| `breakpointMap`          | `object` of `string → integer (≥1)`                                                                                                                                            | Map of viewport-name → pixel width.                                                                                                                                                             |
| `browserList`            | `string[]` (each `enum: chromium, firefox, webkit`)                                                                                                                            | A list of desktop browsers.                                                                                                                                                                     |
| `appType`                | `object` (see [App Types](#app-types-apptypes))                                                                                                                                 | Definition of a supported application type. **Required keys:** `description`, `e2eStrategy`, `defaultE2eFlows`, `testHarness`.                                                                   |
| `tokenInferenceOptions`  | `object`: `confirmWithUser` (`boolean`), `confidenceThreshold` (`string` enum: `low`, `medium`, `high`), `maxInferenceRetries` (`integer ≥0`)                                  | AI token-inference behavior, shared by the Canva and Screenshot pipelines.                                                                                                                       |
| `retryOptions`           | `object`: `maxAttempts` (`integer ≥1`), `initialDelayMs` (`integer ≥0`), `backoffMultiplier` (`number ≥1`), `maxDelayMs` (`integer ≥0`), `retryableErrors` (`string[]`)        | Exponential-backoff retry config for external API calls.                                                                                                                                        |
| `resourceList`           | `array` of either a `string` (`"category:name"`, e.g. `"filesystem:tokens"`) or an `object` `{ name: string, mode: "exclusive" \| "shared" }`                                  | Resources a phase holds. Two phases declaring the same **exclusive** resource cannot run concurrently; **shared** resources may be held by multiple phases (e.g. a read-only dev server).        |
| `orchestrationPhase`     | `object`: `depends` (`string[]`, **required**), `resources` (`resourceList`), `blocking` (`boolean`), `description` (`string`, **required**)                                   | A single node in the orchestration dependency graph. `depends[]` entries must reference other phase keys in the same map.                                                                        |

---

## Visual Diff (`visualDiff`)

Pixel-diff thresholds and analysis options for the visual QA loop (Phase 5).

| Field                          | Type                          | Default                  | Description                                                                                  |
| ------------------------------ | ----------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `threshold`                    | `percentageRatio` (0–1)       | `0.02`                   | Max acceptable mismatch ratio. `0.02` = 2%. Lower is stricter.                               |
| `antialiasing`                 | `boolean`                     | `true`                   | Ignore antialiasing differences when comparing.                                              |
| `diffColorRgb`                 | `integer[3]` (each 0–255)     | `[255, 0, 255]`          | RGB color used to highlight differences in the diff image (magenta).                         |
| `alphaBlending`                | `number (0–1)`                | `0.3`                    | Opacity of the diff overlay.                                                                 |
| `breakpoints`                  | `breakpointMap`               | see example              | Map of viewport name → pixel width used for responsive diffs.                                |
| `requiredBreakpoints`          | `string[]`                    | `["mobile","tablet","desktop"]` | Subset of breakpoint names that must pass for a build to be considered successful.    |
| `outputDir`                    | `string`                      | `".claude/visual-qa/diffs"` | Where diff images are written.                                                            |
| `subPixelClassification`       | `boolean`                     | `true`                   | Enable sub-pixel cluster analysis to distinguish rendering noise from real diffs.            |
| `subPixelMaxClusterSize`       | `integer (≥1)`                | `2`                      | Max cluster size (px) considered sub-pixel noise rather than a real difference.              |
| `typographyAnalysis`           | `boolean`                     | `true`                   | Detect font-weight and font-fallback differences.                                            |
| `fontWeightThreshold`          | `number (≥0)`                 | `15`                     | Sensitivity for font-weight mismatch detection (higher = more permissive).                   |
| `fontFallbackDensityThreshold` | `number (0–1)`                | `0.05`                   | Density of pixel differences that signal a font fallback.                                    |
| `layoutDriftAnalysis`          | `boolean`                     | `true`                   | Detect horizontal/vertical layout shifts vs pixel-level color differences.                   |
| `layoutShiftThresholdPx`       | `number (≥0)`                 | `2`                      | Px shift above which a region is flagged as a layout drift.                                  |

```json
"visualDiff": {
  "threshold": 0.02,
  "antialiasing": true,
  "diffColorRgb": [255, 0, 255],
  "alphaBlending": 0.3,
  "breakpoints": {
    "mobile": 375,
    "tablet": 768,
    "desktop": 1440,
    "wide": 1920
  },
  "requiredBreakpoints": ["mobile", "tablet", "desktop"],
  "outputDir": ".claude/visual-qa/diffs",
  "subPixelClassification": true,
  "subPixelMaxClusterSize": 2,
  "typographyAnalysis": true,
  "fontWeightThreshold": 15,
  "fontFallbackDensityThreshold": 0.05,
  "layoutDriftAnalysis": true,
  "layoutShiftThresholdPx": 2
}
```

---

## Iteration Loop (`iterationLoop`)

Controls the auto-fix loop that runs after each visual diff failure.

| Field                          | Type                    | Default | Description                                                                       |
| ------------------------------ | ----------------------- | ------- | --------------------------------------------------------------------------------- |
| `maxVisualIterations`          | `integer (≥1)`          | `5`     | Max times the build/diff/fix loop runs before giving up.                          |
| `maxFixAttemptsPerCheck`       | `integer (≥1)`          | `2`     | Max fix attempts the agent makes per iteration before re-running the diff.        |
| `diffPassThreshold`            | `percentageRatio` (0–1) | `0.02`  | Mismatch ratio at or below which the diff passes.                                 |
| `diffWarnThreshold`            | `percentageRatio` (0–1) | `0.05`  | Mismatch ratio that triggers a warning (but still passes).                        |
| `regionAnalysis`               | `boolean`               | `true`  | Split each diff into a grid of regions to localize fixes.                         |
| `regionGridSize`               | `integer (≥1)`          | `4`     | Grid dimension (e.g. `4` = 4x4 = 16 regions) for region-based diff analysis.      |
| `stopOnFirstPassingIteration`  | `boolean`               | `true`  | Exit the loop as soon as one iteration passes the threshold.                      |

**Example behavior:** With these defaults, the pipeline attempts up to 5 visual fix iterations. A diff under 2% passes; between 2–5% it warns; above 5% the fix loop continues. After 5 failed iterations, the pipeline reports the remaining diff.

```json
"iterationLoop": {
  "maxVisualIterations": 5,
  "maxFixAttemptsPerCheck": 2,
  "diffPassThreshold": 0.02,
  "diffWarnThreshold": 0.05,
  "regionAnalysis": true,
  "regionGridSize": 4,
  "stopOnFirstPassingIteration": true
}
```

---

## TDD Enforcement (`tdd`)

Test-driven development enforcement for the build pipeline (Phase 3). This is the strictest enforcement in the pipeline.

| Field                       | Type                  | Default | Description                                                                |
| --------------------------- | --------------------- | ------- | -------------------------------------------------------------------------- |
| `enforced`                  | `boolean`             | `true`  | Hard gate Phase 4 (build) on Phase 3 (tests) completion.                   |
| `redPhaseRequired`          | `boolean`             | `true`  | Tests must be written (and fail) before components exist.                  |
| `greenPhaseRequired`        | `boolean`             | `true`  | Components must make the tests pass.                                       |
| `refactorPhaseOptional`     | `boolean`             | `true`  | The refactor step is optional.                                            |
| `testExistenceGate`         | `boolean`             | `true`  | Block the build until every component has a corresponding test file.       |
| `coverageThreshold`         | `percentageInt` (0–100) | `80`  | Minimum test coverage percentage.                                          |
| `componentTestRequired`     | `boolean`             | `true`  | Every component must have a corresponding test.                            |
| `lockfileAssertionsRequired`| `boolean`             | `true`  | Require tests to assert against `design-tokens.lock.json` values.          |

> **This is a hard gate.** When `testExistenceGate` is `true`, the build phase cannot start until test files exist for every component in the build spec.

```json
"tdd": {
  "enforced": true,
  "redPhaseRequired": true,
  "greenPhaseRequired": true,
  "refactorPhaseOptional": true,
  "testExistenceGate": true,
  "coverageThreshold": 80,
  "componentTestRequired": true,
  "lockfileAssertionsRequired": true
}
```

---

## E2E Testing (`e2e`)

End-to-end Playwright test configuration.

| Field                       | Type                    | Default                              | Description                                                                                       |
| --------------------------- | ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `enabled`                   | `boolean`               | `true`                               | Enable E2E test generation and execution.                                                         |
| `conditionalOnAppType`      | `boolean`               | `true`                               | Skip E2E for app types whose `appTypes.<type>.devServer` is `false`.                              |
| `browsers`                  | `browserList`           | `["chromium","firefox","webkit"]`    | Browsers for E2E execution.                                                                       |
| `crossBrowserBrowsers`      | `browserList`           | `["chromium","firefox","webkit"]`    | Browsers used specifically for cross-browser screenshot comparison.                               |
| `crossBrowserRequired`      | `boolean`               | `true`                               | Require cross-browser screenshots.                                                                |
| `timeoutMs`                 | `integer (≥0)`          | `30000`                              | Test timeout per test, in milliseconds (30s).                                                     |
| `retries`                   | `integer (≥0)`          | `2`                                  | Retry count for flaky tests.                                                                       |
| `mobileBrowsers`            | `string[]` (enum: `mobile-chrome`, `mobile-safari`) | `["mobile-chrome","mobile-safari"]` | Mobile browser emulation targets.                                       |
| `crossBrowserDiffThreshold` | `percentageRatio` (0–1) | `0.03`                               | Acceptable visual diff between browsers (3%).                                                      |

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

---

## Quality Gate (`qualityGate`)

Gate criteria that must pass before Phase 9 (report) runs. All blocking checks must pass for the pipeline to succeed.

| Field                              | Type      | Default | Description                                                          |
| ---------------------------------- | --------- | ------- | -------------------------------------------------------------------- |
| `testsRequired`                    | `boolean` | `true`  | Vitest suite must pass.                                              |
| `typescriptRequired`               | `boolean` | `true`  | `tsc --noEmit` must pass.                                            |
| `buildRequired`                    | `boolean` | `true`  | `pnpm build` must succeed.                                           |
| `tokenVerificationRequired`        | `boolean` | `true`  | `verify-tokens.sh` must find no violations.                          |
| `lighthouseRequired`               | `boolean` | `true`  | Lighthouse audit must meet thresholds.                              |
| `lighthouseThresholds`             | `object`  | see below | Minimum Lighthouse category scores (see sub-table).                |
| `e2eRequired`                      | `boolean` | `true`  | E2E tests must pass.                                                 |
| `crossBrowserScreenshotsRequired`  | `boolean` | `false` | Require cross-browser screenshots as a gate condition.              |
| `testCoverageEnforced`            | `boolean` | `true`  | Coverage must meet the TDD threshold (80%).                          |
| `mutationScore`                    | `object`  | see below | Mutation-score gate behavior (see sub-table).                      |

**`lighthouseThresholds`** — each value is a `percentageInt` (0–100):

| Field           | Type                    | Default | Description                       |
| --------------- | ----------------------- | ------- | --------------------------------- |
| `performance`   | `percentageInt` (0–100) | `80`    | Minimum Lighthouse performance.   |
| `accessibility` | `percentageInt` (0–100) | `90`    | Minimum Lighthouse accessibility. |
| `bestPractices` | `percentageInt` (0–100) | `90`    | Minimum Lighthouse best-practices.|
| `seo`           | `percentageInt` (0–100) | `90`    | Minimum Lighthouse SEO.           |

**`mutationScore`** — gate behavior for mutation testing (opt-in):

| Field       | Type                    | Default    | Description                                                       |
| ----------- | ----------------------- | ---------- | ----------------------------------------------------------------- |
| `enabled`   | `boolean`               | `false`    | Enable the mutation-score gate.                                   |
| `threshold` | `percentageInt` (0–100) | `80`       | Minimum mutation score required if enabled.                       |
| `tool`      | `string` (enum: `stryker`) | `"stryker"` | Mutation testing framework.                                    |
| `blocking`  | `boolean`               | `false`    | If `false`, the score is reported but does not fail the gate.     |

```json
"qualityGate": {
  "testsRequired": true,
  "typescriptRequired": true,
  "buildRequired": true,
  "tokenVerificationRequired": true,
  "lighthouseRequired": true,
  "lighthouseThresholds": {
    "performance": 80,
    "accessibility": 90,
    "bestPractices": 90,
    "seo": 90
  },
  "e2eRequired": true,
  "crossBrowserScreenshotsRequired": false,
  "testCoverageEnforced": true,
  "mutationScore": {
    "enabled": false,
    "threshold": 80,
    "tool": "stryker",
    "blocking": false
  }
}
```

---

## App Types (`appTypes`)

Definitions for the four supported app types. Keys are referenced by `build-spec.json.appType`. Each value follows the shared `appType` shape, whose **required** fields are `description`, `e2eStrategy`, `defaultE2eFlows`, and `testHarness`.

**The `appType` shape:**

| Field                   | Type                                                              | Required | Description                                                                                              |
| ----------------------- | ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `description`           | `string`                                                         | yes      | Human-readable description of the app type.                                                              |
| `e2eStrategy`           | `string`                                                         | yes      | Identifier consumed by `e2e-test-generator` to choose a test template.                                  |
| `defaultE2eFlows`       | `string[]`                                                       | yes      | Named flows to generate by default for this app type.                                                   |
| `testHarness`           | `string` (enum: `playwright`, `playwright-chromium-persistent`, `maestro`) | yes | Which test runner the converter agent should target.                                         |
| `devServer`             | `boolean`                                                        | no       | Whether the pipeline starts `pnpm dev` before screenshots/E2E for this app type.                        |
| `browsers`              | `browserList`                                                   | no       | Desktop browsers for this app type.                                                                     |
| `firefoxWebExtSupport`  | `boolean`                                                        | no       | Whether Firefox web-extension testing is supported.                                                     |
| `mobileBrowsers`        | `string[]` (enum: `mobile-chrome`, `mobile-safari`)             | no       | Mobile browser emulation targets.                                                                       |
| `browserContextOptions` | `object` (additional properties allowed)                        | no       | Pass-through options forwarded to Playwright's `browserContext`. May contain tokens like `${extensionPath}`. |
| `buildCommand`          | `string`                                                        | no       | Command used to build the app before testing.                                                           |
| `extensionPathDefault`  | `string`                                                        | no       | Default path to the built extension (chrome-extension only).                                            |
| `platforms`             | `string[]` (enum: `ios`, `android`)                            | no       | Target platforms (react-native only).                                                                   |

The four configured app types and their defaults:

| App type (key)     | `e2eStrategy`                       | `testHarness`                      | `devServer` |
| ------------------ | ----------------------------------- | ---------------------------------- | ----------- |
| `web-app`          | `navigate-interact-verify`          | `playwright`                       | `true`      |
| `chrome-extension` | `load-extension-interact`           | `playwright-chromium-persistent`   | `false`     |
| `pwa`              | `navigate-interact-verify-offline`  | `playwright`                       | `true`      |
| `react-native`     | `launch-app-interact-verify`        | `maestro`                          | `true`      |

> Chrome extensions require a non-headless Chromium browser with persistent context; the `${extensionPath}` token in `browserContextOptions.args` is resolved from `extensionPathDefault`. React Native uses Maestro and declares target `platforms` instead of browsers.

```json
"appTypes": {
  "web-app": {
    "description": "Standard React web application (SPA or SSR)",
    "e2eStrategy": "navigate-interact-verify",
    "defaultE2eFlows": ["page-navigation", "form-submission", "responsive-layout"],
    "testHarness": "playwright",
    "devServer": true,
    "browsers": ["chromium", "firefox", "webkit"],
    "mobileBrowsers": ["mobile-chrome", "mobile-safari"],
    "browserContextOptions": {}
  },
  "chrome-extension": {
    "description": "Chrome browser extension with popup, background, and/or content scripts",
    "e2eStrategy": "load-extension-interact",
    "defaultE2eFlows": [
      "extension-load",
      "popup-open",
      "popup-interact",
      "content-script-inject",
      "manifest-v3-compat"
    ],
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
  },
  "pwa": {
    "description": "Progressive Web App with offline support and installability",
    "e2eStrategy": "navigate-interact-verify-offline",
    "defaultE2eFlows": [
      "page-navigation",
      "install-prompt",
      "offline-fallback",
      "push-notification",
      "sw-lifecycle"
    ],
    "testHarness": "playwright",
    "devServer": true,
    "browsers": ["chromium", "firefox", "webkit"],
    "mobileBrowsers": ["mobile-chrome", "mobile-safari"],
    "browserContextOptions": {}
  },
  "react-native": {
    "description": "React Native mobile app via Expo",
    "e2eStrategy": "launch-app-interact-verify",
    "defaultE2eFlows": ["app-launch", "screen-navigation", "form-interaction", "deep-link"],
    "testHarness": "maestro",
    "devServer": true,
    "buildCommand": "expo build",
    "platforms": ["ios", "android"]
  }
}
```

---

## Screenshot Capture (`screenshotCapture`)

Default screenshot capture settings used by visual-diff and intake phases.

| Field                | Type                                  | Default                            | Description                                  |
| -------------------- | ------------------------------------- | ---------------------------------- | -------------------------------------------- |
| `fullPage`           | `boolean`                             | `true`                             | Capture the full page, not just the viewport.|
| `format`             | `string` (enum: `png`, `jpeg`, `webp`) | `"png"`                            | Image format.                                |
| `quality`            | `integer (1–100)`                     | `100`                              | Image quality (100 = lossless).              |
| `waitForNetworkIdle` | `boolean`                             | `true`                             | Wait for network activity to stop.           |
| `waitAfterLoadMs`    | `integer (≥0)`                        | `1000`                             | Additional wait after page load, in ms.      |
| `outputDir`          | `string`                              | `".claude/visual-qa/screenshots"`  | Where screenshots are saved.                 |

```json
"screenshotCapture": {
  "fullPage": true,
  "format": "png",
  "quality": 100,
  "waitForNetworkIdle": true,
  "waitAfterLoadMs": 1000,
  "outputDir": ".claude/visual-qa/screenshots"
}
```

---

## Dark Mode (`darkMode`)

Dark mode screenshot verification.

| Field                 | Type                              | Default                                  | Description                                                                          |
| --------------------- | --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `enabled`             | `boolean`                         | `true`                                   | Enable dark mode checks.                                                             |
| `diffThreshold`       | `percentageRatio` (0–1)           | `0.03`                                   | Acceptable diff for dark mode (3%).                                                  |
| `emulateMediaFeature` | `string`                          | `"prefers-color-scheme: dark"`           | Chrome DevTools / Playwright media-feature emulation string.                        |
| `compareAgainst`      | `string` (enum: `light`, `design`) | `"light"`                                | Diff dark mode against the light-mode capture or against a separate design reference.|
| `screenshotDir`       | `string`                          | `".claude/visual-qa/screenshots/dark"`   | Dark mode screenshot output directory.                                              |

```json
"darkMode": {
  "enabled": true,
  "diffThreshold": 0.03,
  "emulateMediaFeature": "prefers-color-scheme: dark",
  "compareAgainst": "light",
  "screenshotDir": ".claude/visual-qa/screenshots/dark"
}
```

---

## Storybook (`storybook`)

Auto-generation of Storybook stories and MDX docs.

| Field                        | Type           | Default                                      | Description                                                                          |
| ---------------------------- | -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `autoGenerate`               | `boolean`      | `true`                                       | Automatically create stories for new components.                                     |
| `includeResponsiveViewports` | `boolean`      | `true`                                       | Include mobile/tablet/desktop viewport stories.                                      |
| `viewports`                  | `string[]`     | `["mobile","tablet","desktop"]`              | Names of breakpoints (from `visualDiff.breakpoints`) to include as Storybook viewports.|
| `skipPatterns`               | `string[]`     | `["**/index.ts","**/*.test.*","**/*.stories.*"]` | Glob patterns to exclude from story generation.                                 |
| `generateMdx`                | `boolean`      | `true`                                       | Also generate MDX documentation alongside stories.                                   |
| `maxVariantsPerProp`         | `integer (≥1)` | `10`                                         | Cap on variants generated per discriminated prop to keep stories navigable.          |

```json
"storybook": {
  "autoGenerate": true,
  "includeResponsiveViewports": true,
  "viewports": ["mobile", "tablet", "desktop"],
  "skipPatterns": ["**/index.ts", "**/*.test.*", "**/*.stories.*"],
  "generateMdx": true,
  "maxVariantsPerProp": 10
}
```

---

## Token Sync (`tokenSync`)

Design token drift detection between the lockfile and source code.

| Field         | Type      | Default | Description                                                                       |
| ------------- | --------- | ------- | --------------------------------------------------------------------------------- |
| `autoCheck`   | `boolean` | `true`  | Automatically check for token drift.                                              |
| `warnOnDrift` | `boolean` | `true`  | Warn when drift is detected.                                                      |
| `autoUpdate`  | `boolean` | `false` | When `true`, `sync-tokens.sh` rewrites the lockfile in place when drift is found. |

```json
"tokenSync": {
  "autoCheck": true,
  "warnOnDrift": true,
  "autoUpdate": false
}
```

---

## Reporting (`reporting`)

Output locations and contents of the generated reports.

| Field                       | Type      | Default                       | Description                                |
| --------------------------- | --------- | ----------------------------- | ------------------------------------------ |
| `outputDir`                 | `string`  | `".claude/visual-qa"`         | Directory where reports are written.       |
| `buildReportFile`           | `string`  | `"build-report.md"`           | Filename of the main build report.         |
| `diffReportFile`            | `string`  | `"diff-report.md"`            | Filename of the visual-diff report.        |
| `e2eReportFile`             | `string`  | `"e2e-report.md"`             | Filename of the E2E report.                |
| `accessibilityReportFile`   | `string`  | `"accessibility-report.md"`   | Filename of the accessibility report.      |
| `includeScreenshots`        | `boolean` | `true`                        | Embed screenshots in reports.              |
| `includeDiffImages`         | `boolean` | `true`                        | Embed diff images in reports.              |

```json
"reporting": {
  "outputDir": ".claude/visual-qa",
  "buildReportFile": "build-report.md",
  "diffReportFile": "diff-report.md",
  "e2eReportFile": "e2e-report.md",
  "accessibilityReportFile": "accessibility-report.md",
  "includeScreenshots": true,
  "includeDiffImages": true
}
```

---

## Security (`security`)

Dependency auditing, CSP, input sanitization, and security headers.

| Field                 | Type                                            | Default      | Description                                  |
| --------------------- | ----------------------------------------------- | ------------ | -------------------------------------------- |
| `enabled`             | `boolean`                                       | `true`       | Enable security auditing.                    |
| `auditLevel`          | `string` (enum: `low`, `moderate`, `high`, `critical`) | `"moderate"` | Minimum vulnerability level to report.|
| `failOnVulnerability` | `boolean`                                       | `true`       | Fail the pipeline on vulnerabilities.        |
| `checkLockfile`       | `boolean`                                       | `true`       | Audit the lockfile for known issues.         |
| `snyk`                | `object`                                        | see below    | Snyk scanning options (sub-table).           |
| `csp`                 | `object`                                        | see below    | Content Security Policy options (sub-table). |
| `inputSanitization`   | `object`                                        | see below    | URL/input sanitization options (sub-table).  |
| `headers`             | `object`                                        | see below    | Security headers (sub-table).                |

**`snyk`:**

| Field               | Type                                              | Default  | Description                       |
| ------------------- | ------------------------------------------------- | -------- | --------------------------------- |
| `enabled`           | `boolean`                                         | `true`   | Enable Snyk scanning.             |
| `severityThreshold` | `string` (enum: `low`, `medium`, `high`, `critical`) | `"high"` | Minimum severity Snyk reports. |
| `failOnIssues`      | `boolean`                                         | `false`  | Fail the pipeline on Snyk issues. |

**`csp`** — Content Security Policy applied to deploy previews:

| Field        | Type      | Default              | Description                                |
| ------------ | --------- | -------------------- | ------------------------------------------ |
| `enabled`    | `boolean` | `true`               | Enable CSP on deploy previews.             |
| `reportOnly` | `boolean` | `false`              | Use `Content-Security-Policy-Report-Only`. |
| `reportUri`  | `string`  | `"/api/csp-report"`  | URI to which CSP violation reports are sent.|

**`inputSanitization`:**

| Field                | Type      | Default | Description                                                              |
| -------------------- | --------- | ------- | ------------------------------------------------------------------------ |
| `enabled`            | `boolean` | `true`  | Enable input sanitization.                                               |
| `blockPrivateUrls`   | `boolean` | `true`  | Reject URLs in private IP ranges to prevent SSRF in URL-capture mode.    |
| `allowLocalhostInDev`| `boolean` | `true`  | Permit localhost URLs in development.                                    |

**`headers`:**

| Field            | Type                                              | Default                          | Description                          |
| ---------------- | ------------------------------------------------- | -------------------------------- | ------------------------------------ |
| `hsts`           | `boolean`                                         | `true`                           | Send the HSTS header.                |
| `noSniff`        | `boolean`                                         | `true`                           | Send `X-Content-Type-Options: nosniff`.|
| `frameOptions`   | `string` (enum: `DENY`, `SAMEORIGIN`)             | `"SAMEORIGIN"`                   | `X-Frame-Options` value.             |
| `xssProtection`  | `boolean`                                         | `true`                           | Send the legacy XSS-protection header.|
| `referrerPolicy` | `string` (enum: `no-referrer`, `no-referrer-when-downgrade`, `origin`, `origin-when-cross-origin`, `same-origin`, `strict-origin`, `strict-origin-when-cross-origin`, `unsafe-url`) | `"strict-origin-when-cross-origin"` | `Referrer-Policy` value. |

```json
"security": {
  "enabled": true,
  "auditLevel": "moderate",
  "failOnVulnerability": true,
  "checkLockfile": true,
  "snyk": {
    "enabled": true,
    "severityThreshold": "high",
    "failOnIssues": false
  },
  "csp": {
    "enabled": true,
    "reportOnly": false,
    "reportUri": "/api/csp-report"
  },
  "inputSanitization": {
    "enabled": true,
    "blockPrivateUrls": true,
    "allowLocalhostInDev": true
  },
  "headers": {
    "hsts": true,
    "noSniff": true,
    "frameOptions": "SAMEORIGIN",
    "xssProtection": true,
    "referrerPolicy": "strict-origin-when-cross-origin"
  }
}
```

---

## Bundle Size (`bundleSize`)

| Field        | Type           | Default | Description                                  |
| ------------ | -------------- | ------- | -------------------------------------------- |
| `enabled`    | `boolean`      | `true`  | Enable bundle size checks.                   |
| `maxSizeKb`  | `integer (≥1)` | `200`   | Maximum bundle size (KB) before failing.     |
| `warnSizeKb` | `integer (≥1)` | `150`   | Bundle size (KB) that triggers a warning.    |

```json
"bundleSize": {
  "enabled": true,
  "maxSizeKb": 200,
  "warnSizeKb": 150
}
```

---

## Mutation Testing (`mutationTesting`)

Top-level Stryker mutation-testing reminder/runner config. This is distinct from — but related to — `qualityGate.mutationScore`, which controls whether mutation score acts as a **gate**. This section controls the standalone runner and the reminder hook.

| Field            | Type                       | Default     | Description                                        |
| ---------------- | -------------------------- | ----------- | -------------------------------------------------- |
| `enabled`        | `boolean`                  | `true`      | Enable the mutation-testing runner.                |
| `tool`           | `string` (enum: `stryker`) | `"stryker"` | Mutation testing framework.                        |
| `scoreThreshold` | `percentageInt` (0–100)    | `80`        | Minimum mutation score target.                     |
| `reminder`       | `boolean`                  | `true`      | Emit the post-test reminder to run mutation tests. |

```json
"mutationTesting": {
  "enabled": true,
  "tool": "stryker",
  "scoreThreshold": 80,
  "reminder": true
}
```

---

## Error Monitoring (`errorMonitoring`)

Sentry integration for production error tracking.

| Field              | Type                       | Default        | Description                                          |
| ------------------ | -------------------------- | -------------- | ---------------------------------------------------- |
| `provider`         | `string` (enum: `sentry`)  | `"sentry"`     | Error monitoring provider.                           |
| `dsn`              | `string`                   | `""`           | Sentry DSN (must be configured per project).         |
| `environment`      | `string`                   | `"production"` | Sentry environment tag.                              |
| `sampleRate`       | `number (0–1)`             | `1`            | Error event sample rate (1 = 100%).                  |
| `tracesSampleRate` | `number (0–1)`             | `0.2`          | Performance trace sample rate (20%).                 |
| `enableInDev`      | `boolean`                  | `false`        | Enable error monitoring in development.              |
| `sourceMapUpload`  | `boolean`                  | `true`         | Upload source maps for readable stack traces.        |

```json
"errorMonitoring": {
  "provider": "sentry",
  "dsn": "",
  "environment": "production",
  "sampleRate": 1,
  "tracesSampleRate": 0.2,
  "enableInDev": false,
  "sourceMapUpload": true
}
```

---

## Deploy Preview (`deployPreview`)

Deploy-preview integration for pull requests.

| Field                    | Type                                            | Default     | Description                                |
| ------------------------ | ----------------------------------------------- | ----------- | ------------------------------------------ |
| `enabled`                | `boolean`                                       | `true`      | Enable deploy previews.                    |
| `provider`               | `string` (enum: `vercel`, `netlify`, `cloudflare`) | `"vercel"` | Deploy platform.                       |
| `autoDeployOnPR`         | `boolean`                                       | `true`      | Auto-deploy on pull request.               |
| `runVisualQAOnPreview`   | `boolean`                                       | `true`      | Run visual QA on preview deployments.      |
| `runLighthouseOnPreview` | `boolean`                                       | `true`      | Run Lighthouse on preview deployments.     |

```json
"deployPreview": {
  "enabled": true,
  "provider": "vercel",
  "autoDeployOnPR": true,
  "runVisualQAOnPreview": true,
  "runLighthouseOnPreview": true
}
```

---

## Responsive Verification (`responsiveVerification`)

Multi-breakpoint responsive screenshot checks.

| Field           | Type                    | Default     | Description                                              |
| --------------- | ----------------------- | ----------- | ------------------------------------------------------- |
| `enabled`       | `boolean`               | `true`      | Enable responsive verification.                         |
| `breakpoints`   | `breakpointMap`         | see example | Map of viewport name → pixel width to capture.          |
| `diffThreshold` | `percentageRatio` (0–1) | `0.03`      | Acceptable diff between expected and actual (3%).        |
| `blocking`      | `boolean`               | `false`     | Non-blocking — reports but does not fail the pipeline.  |

```json
"responsiveVerification": {
  "enabled": true,
  "breakpoints": {
    "small-mobile": 320,
    "mobile": 375,
    "tablet": 768,
    "desktop": 1440,
    "wide": 1920
  },
  "diffThreshold": 0.03,
  "blocking": false
}
```

---

## Regression Testing (`regressionTesting`)

Visual regression testing against stored baselines.

| Field                   | Type                    | Default                                          | Description                                       |
| ----------------------- | ----------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `enabled`               | `boolean`               | `true`                                           | Enable regression testing.                        |
| `baselineDir`           | `string`                | `".claude/visual-qa/baselines"`                  | Directory of stored baseline screenshots.         |
| `screenshotDir`         | `string`                | `".claude/visual-qa/screenshots/regression"`     | Where new regression screenshots are written.     |
| `diffDir`               | `string`                | `".claude/visual-qa/diffs/regression"`           | Where regression diff images are written.         |
| `threshold`             | `percentageRatio` (0–1) | `0.02`                                           | Acceptable diff from baseline (2%).               |
| `failOnMissingBaseline` | `boolean`               | `false`                                          | Fail if a baseline does not exist yet.            |
| `updateBaselinesOnPass` | `boolean`               | `false`                                          | Auto-update baselines when a run passes.          |
| `breakpoints`           | `breakpointMap`         | `{ "mobile": 375, "desktop": 1440 }`             | Map of viewport name → pixel width to capture.    |
| `waitAfterLoadMs`       | `integer (≥0)`          | `1500`                                           | Wait time before capture, in ms.                  |
| `fullPage`              | `boolean`               | `true`                                           | Capture full page.                                |
| `routes`                | `string[]`              | `["/"]`                                          | Routes to test.                                   |
| `browsers`              | `browserList`           | `["chromium"]`                                   | Browsers for regression capture.                  |
| `reportFile`            | `string`                | `"regression-report.md"`                         | Filename of the regression report.                |

```json
"regressionTesting": {
  "enabled": true,
  "baselineDir": ".claude/visual-qa/baselines",
  "screenshotDir": ".claude/visual-qa/screenshots/regression",
  "diffDir": ".claude/visual-qa/diffs/regression",
  "threshold": 0.02,
  "failOnMissingBaseline": false,
  "updateBaselinesOnPass": false,
  "breakpoints": {
    "mobile": 375,
    "desktop": 1440
  },
  "waitAfterLoadMs": 1500,
  "fullPage": true,
  "routes": ["/"],
  "browsers": ["chromium"],
  "reportFile": "regression-report.md"
}
```

---

## Dead Code (`deadCode`)

Unused export/dependency/file detection.

| Field                       | Type                                | Default                                        | Description                          |
| --------------------------- | ----------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `enabled`                   | `boolean`                           | `true`                                         | Enable dead-code detection.          |
| `tool`                      | `string` (enum: `knip`, `ts-prune`) | `"knip"`                                       | Dead-code analysis tool.             |
| `ignorePatterns`            | `string[]`                          | `["**/*.stories.*","**/*.test.*","**/*.e2e.*"]`| Glob patterns to ignore.             |
| `reportUnusedExports`       | `boolean`                           | `true`                                         | Report unused exports.               |
| `reportUnusedDependencies`  | `boolean`                           | `true`                                         | Report unused dependencies.          |
| `reportUnusedFiles`         | `boolean`                           | `true`                                         | Report unused files.                 |

```json
"deadCode": {
  "enabled": true,
  "tool": "knip",
  "ignorePatterns": ["**/*.stories.*", "**/*.test.*", "**/*.e2e.*"],
  "reportUnusedExports": true,
  "reportUnusedDependencies": true,
  "reportUnusedFiles": true
}
```

---

## Canva Pipeline (`canva`)

Canva-specific pipeline configuration.

| Field             | Type                                                   | Default     | Description                                                  |
| ----------------- | ------------------------------------------------------ | ----------- | ------------------------------------------------------------ |
| `enabled`         | `boolean`                                              | `true`      | Enable the Canva pipeline.                                   |
| `tokenInference`  | `tokenInferenceOptions`                                | see below   | AI token-inference behavior (shared type).                   |
| `export`          | `object`                                               | see below   | Canva export options (sub-table).                            |
| `mcpServer`       | `string`                                               | `"canva"`   | MCP server name for the Canva API.                           |
| `restApiFallback` | `boolean`                                              | `false`     | Fall back to the Canva REST API if the MCP server fails.     |
| `retry`           | `retryOptions`                                         | see below   | Exponential-backoff retry config (shared type).              |

**`tokenInference`** (shared `tokenInferenceOptions` type):

| Field                 | Type                                       | Default    | Description                                                                  |
| --------------------- | ------------------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| `confirmWithUser`     | `boolean`                                  | `true`     | Block before writing the lockfile until the user confirms inferred tokens.   |
| `confidenceThreshold` | `string` (enum: `low`, `medium`, `high`)   | `"medium"` | Min confidence below which a token must be confirmed even if `confirmWithUser` is false. |
| `maxInferenceRetries` | `integer (≥0)`                             | `2`        | Max inference retries.                                                       |

**`export`:**

| Field     | Type                                  | Default | Description                                            |
| --------- | ------------------------------------- | ------- | ------------------------------------------------------ |
| `format`  | `string` (enum: `png`, `jpeg`, `webp`) | `"png"` | Export format from Canva.                              |
| `scale`   | `number (≥1)`                         | `2`     | PNG export scale factor (1 = 1x, 2 = 2x retina, 3 = 3x).|
| `quality` | `integer (1–100)`                     | `100`   | Export quality.                                        |

**`retry`** (shared `retryOptions` type):

| Field               | Type           | Default                                                                       | Description                                                 |
| ------------------- | -------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `maxAttempts`       | `integer (≥1)` | `3`                                                                           | Max retry attempts.                                         |
| `initialDelayMs`    | `integer (≥0)` | `2000`                                                                        | Initial backoff delay, in ms.                               |
| `backoffMultiplier` | `number (≥1)`  | `2`                                                                           | Exponential backoff multiplier.                             |
| `maxDelayMs`        | `integer (≥0)` | `30000`                                                                       | Maximum backoff delay, in ms.                               |
| `retryableErrors`   | `string[]`     | `["rate_limit","timeout","server_error","export_failed","mcp_connection_lost"]` | Error codes/keywords that trigger a retry.              |

```json
"canva": {
  "enabled": true,
  "tokenInference": {
    "confirmWithUser": true,
    "confidenceThreshold": "medium",
    "maxInferenceRetries": 2
  },
  "export": {
    "format": "png",
    "scale": 2,
    "quality": 100
  },
  "mcpServer": "canva",
  "restApiFallback": false,
  "retry": {
    "maxAttempts": 3,
    "initialDelayMs": 2000,
    "backoffMultiplier": 2,
    "maxDelayMs": 30000,
    "retryableErrors": [
      "rate_limit",
      "timeout",
      "server_error",
      "export_failed",
      "mcp_connection_lost"
    ]
  }
}
```

---

## Screenshot Pipeline (`screenshot`)

Screenshot/URL capture pipeline configuration.

| Field            | Type                    | Default   | Description                                  |
| ---------------- | ----------------------- | --------- | -------------------------------------------- |
| `enabled`        | `boolean`               | `true`    | Enable the screenshot pipeline.              |
| `tokenInference` | `tokenInferenceOptions` | see below | AI token-inference behavior (shared type).   |
| `capture`        | `object`                | see below | Screenshot capture options (sub-table).      |
| `urlCapture`     | `object`                | see below | URL-capture options and viewports (sub-table).|

**`tokenInference`** (shared `tokenInferenceOptions` type):

| Field                 | Type                                     | Default    | Description                                            |
| --------------------- | ---------------------------------------- | ---------- | ------------------------------------------------------ |
| `confirmWithUser`     | `boolean`                                | `true`     | Require user confirmation of inferred tokens.          |
| `confidenceThreshold` | `string` (enum: `low`, `medium`, `high`) | `"medium"` | Min confidence below which a token must be confirmed.  |
| `maxInferenceRetries` | `integer (≥0)`                           | `2`        | Max inference retries.                                 |

**`capture`:**

| Field                | Type                                  | Default | Description                              |
| -------------------- | ------------------------------------- | ------- | ---------------------------------------- |
| `format`             | `string` (enum: `png`, `jpeg`, `webp`) | `"png"` | Capture image format.                    |
| `scale`              | `number (≥1)`                         | `2`     | Capture scale factor (2x retina).        |
| `quality`            | `integer (1–100)`                     | `100`   | Capture quality.                         |
| `fullPage`           | `boolean`                             | `true`  | Capture full page.                       |
| `waitForNetworkIdle` | `boolean`                             | `true`  | Wait for network activity to stop.       |
| `waitAfterLoadMs`    | `integer (≥0)`                        | `1000`  | Additional wait after page load, in ms.  |

**`urlCapture`:**

| Field       | Type                              | Default     | Description                                                                 |
| ----------- | --------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `enabled`   | `boolean`                         | `true`      | Enable URL capture.                                                         |
| `viewports` | `object[]` (min 1 item)           | see example | List of viewports. Each requires `name` (`string`), `width` and `height` (`integer ≥1`). |

```json
"screenshot": {
  "enabled": true,
  "tokenInference": {
    "confirmWithUser": true,
    "confidenceThreshold": "medium",
    "maxInferenceRetries": 2
  },
  "capture": {
    "format": "png",
    "scale": 2,
    "quality": 100,
    "fullPage": true,
    "waitForNetworkIdle": true,
    "waitAfterLoadMs": 1000
  },
  "urlCapture": {
    "enabled": true,
    "viewports": [
      { "name": "desktop", "width": 1440, "height": 900 },
      { "name": "mobile", "width": 375, "height": 812 }
    ]
  }
}
```

---

## Orchestration (`orchestration`)

Parallel phase-execution graph. Phase keys are arbitrary; each phase's `depends[]` entries must reference other keys in the same `phases` map.

| Field                  | Type           | Default     | Description                                                        |
| ---------------------- | -------------- | ----------- | ------------------------------------------------------------------ |
| `enabled`              | `boolean`      | `true`      | Enable parallel orchestration. When `false`, phases run sequentially.|
| `maxConcurrent`        | `integer (≥1)` | `3`         | Max phases that may run simultaneously across the graph.           |
| `phases`               | `object` (min 1 property) | see below | Map of phase name → `orchestrationPhase` (shared type).       |
| `qualityGateSubtasks`  | `object`       | see below   | Map of subtask name → `{ resources, description }`.                |
| `reporting`            | `object`       | see below   | Orchestration reporting toggles (sub-table).                       |

**`phases`** — each value follows the shared `orchestrationPhase` shape:

| Field         | Type           | Required | Description                                                                                            |
| ------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `depends`     | `string[]`     | yes      | Phase keys that must complete before this phase starts.                                                |
| `resources`   | `resourceList` | no       | Resources the phase holds (exclusive or shared); prevents write conflicts.                             |
| `blocking`    | `boolean`      | no       | When `true`, failure of this phase fails the whole pipeline; when `false`, failure is reported only.   |
| `description` | `string`       | yes      | Human-readable purpose.                                                                                |

The live config defines 13 phases: `token-sync`, `intake`, `token-lock`, `tdd-scaffold`, `component-build`, `storybook`, `visual-diff`, `dark-mode`, `e2e-tests`, `cross-browser`, `quality-gate`, `responsive`, and `report`.

**`qualityGateSubtasks`** — each value is `{ resources: resourceList, description: string }`. The live config defines 6 subtasks: `coverage`, `typecheck`, `build`, `token-verify`, `lighthouse`, and `mutation-score`.

**`reporting`:**

| Field                  | Type      | Default | Description                                  |
| ---------------------- | --------- | ------- | -------------------------------------------- |
| `showStreamingResults` | `boolean` | `true`  | Report each phase result as it completes.    |
| `showBatchSummary`     | `boolean` | `true`  | Print a batch summary at the end.            |
| `showSpeedupEstimate`  | `boolean` | `true`  | Show the speedup factor vs sequential.       |
| `includeTimeline`      | `boolean` | `true`  | Include an execution timeline.               |

```json
"orchestration": {
  "enabled": true,
  "maxConcurrent": 3,
  "phases": {
    "token-sync": {
      "depends": [],
      "resources": ["filesystem:tokens"],
      "blocking": true,
      "description": "Check for token drift against lockfile"
    },
    "component-build": {
      "depends": ["tdd-scaffold"],
      "resources": ["filesystem:src", { "name": "port:dev-server", "mode": "shared" }],
      "blocking": true,
      "description": "Build components to pass tests (GREEN phase)"
    },
    "report": {
      "depends": ["quality-gate", "e2e-tests"],
      "resources": ["filesystem:report"],
      "blocking": true,
      "description": "Generate build report with all results"
    }
  },
  "qualityGateSubtasks": {
    "coverage": {
      "resources": [],
      "description": "Run vitest with coverage, check 80% threshold"
    },
    "build": {
      "resources": [{ "name": "port:build", "mode": "shared" }],
      "description": "Run pnpm build"
    }
  },
  "reporting": {
    "showStreamingResults": true,
    "showBatchSummary": true,
    "showSpeedupEstimate": true,
    "includeTimeline": true
  }
}
```

> The example above is abridged to a few representative phases and subtasks. The live config lists all 13 phases and 6 subtasks.

---

## Caching (`caching`)

Content-hash caching of phase outputs to skip unchanged work on rebuild.

| Field                      | Type                                | Default                    | Description                                                                  |
| -------------------------- | ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `enabled`                  | `boolean`                           | `true`                     | Enable caching.                                                              |
| `strategy`                 | `string` (enum: `content-hash`, `mtime`) | `"content-hash"`      | How cache validity is determined.                                            |
| `directory`                | `string`                            | `".claude/pipeline-cache"` | Cache directory.                                                             |
| `maxAgeDays`               | `integer (≥1)`                      | `7`                        | Cache entries older than this many days are evicted by the cleanup pass.     |
| `inputCategories`          | `object` of `string → string[]`     | see example                | Named glob groups (e.g. `source`, `styles`) referenced by `phaseInputs`.     |
| `phaseInputs`              | `object` of `string → string[]`     | see example                | Map phase name → list of `inputCategories` keys whose changes invalidate it. |
| `invalidateOnConfigChange` | `boolean`                           | `true`                     | Invalidate all caches when the config changes.                               |

```json
"caching": {
  "enabled": true,
  "strategy": "content-hash",
  "directory": ".claude/pipeline-cache",
  "maxAgeDays": 7,
  "inputCategories": {
    "source": ["src/**/*.{ts,tsx,js,jsx}", "components/**/*.{ts,tsx}"],
    "styles": ["src/**/*.css", "styles/**/*.css", "tailwind.config.*"],
    "tests": ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx}"],
    "config": ["package.json", "tsconfig.json", "vite.config.*", "next.config.*"],
    "tokens": ["design-tokens.lock.json", "tailwind.config.*"],
    "figma": ["build-spec.json", "design-tokens.lock.json"]
  },
  "phaseInputs": {
    "token-sync": ["tokens", "config"],
    "component-build": ["source", "styles", "tokens", "tests", "config"],
    "quality-gate": ["source", "tests", "config"]
  },
  "invalidateOnConfigChange": true
}
```

> The `phaseInputs` example is abridged; the live config maps all 12 cacheable phases.

---

## Profiling (`profiling`)

Build stage profiling and performance metrics.

| Field                  | Type           | Default                                | Description                                       |
| ---------------------- | -------------- | -------------------------------------- | ------------------------------------------------- |
| `enabled`              | `boolean`      | `true`                                 | Enable profiling.                                 |
| `metricsDirectory`     | `string`       | `".claude/pipeline-cache/metrics"`     | Where metrics are stored.                         |
| `historyLimit`         | `integer (≥1)` | `50`                                   | Number of build runs to retain in history.        |
| `slowStageThresholdMs` | `integer (≥0)` | `30000`                                | Stage duration above which a stage is "slow", in ms.|
| `alerts`               | `object`       | see below                              | Performance alert options (sub-table).            |
| `reporting`            | `object`       | see below                              | Profiling report options (sub-table).             |

**`alerts`:**

| Field                     | Type           | Default | Description                                                          |
| ------------------------- | -------------- | ------- | -------------------------------------------------------------------- |
| `enabled`                 | `boolean`      | `true`  | Enable performance alerts.                                           |
| `slowStageWarning`        | `boolean`      | `true`  | Warn when a stage exceeds `slowStageThresholdMs`.                    |
| `memoryThresholdMb`       | `integer (≥1)` | `1024`  | Memory usage (MB) above which an alert fires.                       |
| `trendDegradationPercent` | `number (≥0)`  | `20`    | Percent slowdown vs historical median that triggers a degradation alert. |

**`reporting`:**

| Field                  | Type                              | Default          | Description                          |
| ---------------------- | --------------------------------- | ---------------- | ------------------------------------ |
| `generateOnComplete`   | `boolean`                         | `true`           | Generate a report after each build.  |
| `formats`              | `string[]` (enum: `md`, `json`, `html`) | `["md","json"]`  | Report output formats.        |
| `includeMemoryMetrics` | `boolean`                         | `true`           | Include memory metrics in reports.   |
| `includeTimeline`      | `boolean`                         | `true`           | Include an execution timeline.       |

```json
"profiling": {
  "enabled": true,
  "metricsDirectory": ".claude/pipeline-cache/metrics",
  "historyLimit": 50,
  "slowStageThresholdMs": 30000,
  "alerts": {
    "enabled": true,
    "slowStageWarning": true,
    "memoryThresholdMb": 1024,
    "trendDegradationPercent": 20
  },
  "reporting": {
    "generateOnComplete": true,
    "formats": ["md", "json"],
    "includeMemoryMetrics": true,
    "includeTimeline": true
  }
}
```

---

## Incremental Build (`incrementalBuild`)

Incremental build with cache-aware phase skipping.

| Field               | Type           | Default                                                   | Description                                                          |
| ------------------- | -------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `enabled`           | `boolean`      | `true`                                                    | Enable incremental builds.                                          |
| `parallelPhases`    | `boolean`      | `true`                                                    | Run independent phases in parallel.                                 |
| `skipCachedPhases`  | `boolean`      | `true`                                                    | Skip phases whose cache is still valid.                             |
| `forceRebuildOn`    | `string[]`     | `["package.json","pnpm-lock.yaml","pipeline.config.json"]`| Files whose modification forces a full rebuild regardless of cache.  |
| `maxParallelPhases` | `integer (≥1)` | `4`                                                       | Max phases to run in parallel during an incremental build.          |

```json
"incrementalBuild": {
  "enabled": true,
  "parallelPhases": true,
  "skipCachedPhases": true,
  "forceRebuildOn": ["package.json", "pnpm-lock.yaml", "pipeline.config.json"],
  "maxParallelPhases": 4
}
```

---

## Dashboard (`dashboard`)

Build-performance dashboard generation.

| Field                   | Type                        | Default                            | Description                              |
| ----------------------- | --------------------------- | ---------------------------------- | ---------------------------------------- |
| `enabled`               | `boolean`                   | `true`                             | Enable dashboard generation.             |
| `outputDirectory`       | `string`                    | `".claude/visual-qa/dashboard"`    | Where the dashboard is written.          |
| `formats`               | `string[]` (enum: `html`, `md`) | `["html","md"]`                | Dashboard output formats.                |
| `autoGenerateAfterBuild`| `boolean`                   | `true`                             | Regenerate the dashboard after each build.|
| `includeCharts`         | `boolean`                   | `true`                             | Include charts in the dashboard.         |
| `retentionDays`         | `integer (≥1)`              | `30`                               | Days of dashboard history to retain.     |

```json
"dashboard": {
  "enabled": true,
  "outputDirectory": ".claude/visual-qa/dashboard",
  "formats": ["html", "md"],
  "autoGenerateAfterBuild": true,
  "includeCharts": true,
  "retentionDays": 30
}
```

---

## Customization Examples

### Relax the visual diff threshold for early prototyping

```json
"visualDiff": {
  "threshold": 0.05
},
"iterationLoop": {
  "diffPassThreshold": 0.05,
  "maxVisualIterations": 3
}
```

### Disable non-blocking checks for faster iteration

```json
"darkMode": { "enabled": false },
"storybook": { "autoGenerate": false },
"responsiveVerification": { "enabled": false }
```

### Enable mutation testing

```json
"qualityGate": {
  "mutationScore": {
    "enabled": true,
    "threshold": 80,
    "blocking": true
  }
}
```

### Lower bundle size limits for mobile-first apps

```json
"bundleSize": {
  "maxSizeKb": 100,
  "warnSizeKb": 75
}
```
