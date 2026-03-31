# Pipeline Configuration Guide

All pipeline behavior is controlled by `.claude/pipeline.config.json`. This document explains every section, what the defaults are, and how to customize them.

---

## File Location

```
.claude/pipeline.config.json
```

The file is version-controlled and shared across all developers. Changes to thresholds affect all pipeline runs in the repository.

---

## Configuration Sections

### Visual Diff (`visualDiff`)

Controls the pixel-level screenshot comparison engine used in Phase 5.

| Setting | Default | Description |
|---------|---------|-------------|
| `threshold` | `0.02` (2%) | Maximum pixel mismatch ratio to pass. Lower = stricter. |
| `antialiasing` | `true` | Detect and ignore anti-aliasing differences |
| `diffColorRgb` | `[255, 0, 255]` | Color used to highlight diff pixels (magenta) |
| `alphaBlending` | `0.3` | Transparency of the diff overlay |
| `subPixelClassification` | `true` | Classify diffs as sub-pixel (cosmetic) vs structural |
| `subPixelMaxClusterSize` | `2` | Max cluster size considered sub-pixel |
| `typographyAnalysis` | `true` | Detect font weight and fallback differences |
| `fontWeightThreshold` | `15` | Maximum font weight variance before flagging |
| `fontFallbackDensityThreshold` | `0.05` | Density threshold for font fallback detection |
| `layoutDriftAnalysis` | `true` | Detect element position shifts |
| `layoutShiftThresholdPx` | `2` | Max pixel shift before flagging layout drift |

**Breakpoints** (responsive screenshots):

| Name | Width |
|------|-------|
| `mobile` | 375px |
| `tablet` | 768px |
| `desktop` | 1440px |
| `wide` | 1920px |

Required breakpoints for visual diff: `mobile`, `tablet`, `desktop`.

**Output:** Diff images are saved to `.claude/visual-qa/diffs/`.

---

### Iteration Loop (`iterationLoop`)

Controls the visual diff iteration cycle in Phase 5. When a diff fails, the pipeline attempts fixes and re-compares.

| Setting | Default | Description |
|---------|---------|-------------|
| `maxVisualIterations` | `5` | Maximum fix-and-recompare attempts |
| `maxFixAttemptsPerCheck` | `2` | Max fix attempts per individual check |
| `diffPassThreshold` | `0.02` (2%) | Mismatch ratio required to pass |
| `diffWarnThreshold` | `0.05` (5%) | Mismatch ratio that triggers a warning (but still passes) |
| `regionAnalysis` | `true` | Divide screenshot into grid regions for targeted fixes |
| `regionGridSize` | `4` | Grid divisions (4 = 4x4 = 16 regions) |
| `stopOnFirstPassingIteration` | `true` | Stop iterating once diff passes |

**Example:** With defaults, the pipeline will attempt up to 5 visual fix iterations. If the diff is under 2%, it passes. Between 2-5%, it warns. Above 5%, the fix loop continues. After 5 failed iterations, the pipeline reports the remaining diff.

---

### TDD Enforcement (`tdd`)

Controls the Test-Driven Development gate at Phase 3. This is the strictest enforcement in the pipeline.

| Setting | Default | Description |
|---------|---------|-------------|
| `enforced` | `true` | TDD is mandatory -- cannot be disabled without changing this |
| `redPhaseRequired` | `true` | Tests must be written before components |
| `greenPhaseRequired` | `true` | Components must make tests pass |
| `refactorPhaseOptional` | `true` | Refactor step is optional |
| `testExistenceGate` | `true` | Phase 4 is blocked until Phase 3 produces test files |
| `coverageThreshold` | `80` | Minimum test coverage percentage |
| `componentTestRequired` | `true` | Every component must have a corresponding test |
| `lockfileAssertionsRequired` | `true` | Tests must assert against design token lockfile values |

> **This is a hard gate.** If `testExistenceGate` is `true`, the build phase cannot start until test files exist for every component in the build spec.

---

### E2E Testing (`e2e`)

Controls Playwright end-to-end test generation and execution.

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable E2E test generation |
| `conditionalOnAppType` | `true` | Tailor E2E strategy to the detected app type |
| `browsers` | `["chromium", "firefox", "webkit"]` | Browsers for E2E execution |
| `crossBrowserRequired` | `true` | Require cross-browser screenshots |
| `timeoutMs` | `30000` | Test timeout per test (30 seconds) |
| `retries` | `2` | Retry count for flaky tests |
| `mobileBrowsers` | `["mobile-chrome", "mobile-safari"]` | Mobile browser emulation targets |
| `crossBrowserDiffThreshold` | `0.03` (3%) | Acceptable visual diff between browsers |

---

### Quality Gate (`qualityGate`)

The quality gate runs 5 parallel checks after component build. All blocking checks must pass for the pipeline to succeed.

| Setting | Default | Description |
|---------|---------|-------------|
| `testsRequired` | `true` | Vitest suite must pass |
| `typescriptRequired` | `true` | `tsc --noEmit` must pass |
| `buildRequired` | `true` | `pnpm build` must succeed |
| `tokenVerificationRequired` | `true` | `verify-tokens.sh` must find no violations |
| `lighthouseRequired` | `true` | Lighthouse audit must meet thresholds |
| `e2eRequired` | `true` | E2E tests must pass |
| `testCoverageEnforced` | `true` | Coverage must meet TDD threshold (80%) |

**Lighthouse Thresholds:**

| Category | Minimum Score |
|----------|--------------|
| Performance | 80 |
| Accessibility | 90 |
| Best Practices | 90 |
| SEO | 90 |

**Mutation Testing** (opt-in):

| Setting | Default | Description |
|---------|---------|-------------|
| `mutationScore.enabled` | `false` | Disabled by default |
| `mutationScore.threshold` | `80` | Minimum mutation score if enabled |
| `mutationScore.tool` | `"stryker"` | Mutation testing framework |
| `mutationScore.blocking` | `false` | Does not block pipeline even if enabled |

---

### App Types (`appTypes`)

Defines behavior for each supported application type. The pipeline reads the app type from `build-spec.json` and applies the matching configuration.

#### Web App (`web-app`)

```json
{
  "e2eStrategy": "navigate-interact-verify",
  "defaultE2eFlows": ["page-navigation", "form-submission", "responsive-layout"],
  "testHarness": "playwright",
  "devServer": true,
  "browsers": ["chromium", "firefox", "webkit"],
  "mobileBrowsers": ["mobile-chrome", "mobile-safari"]
}
```

#### Chrome Extension (`chrome-extension`)

```json
{
  "e2eStrategy": "load-extension-interact",
  "defaultE2eFlows": ["extension-load", "popup-open", "popup-interact", "content-script-inject", "manifest-v3-compat"],
  "testHarness": "playwright-chromium-persistent",
  "devServer": false,
  "browsers": ["chromium"],
  "firefoxWebExtSupport": true,
  "browserContextOptions": {
    "headless": false,
    "args": ["--disable-extensions-except=${extensionPath}", "--load-extension=${extensionPath}"]
  },
  "buildCommand": "pnpm build",
  "extensionPathDefault": "dist"
}
```

> Chrome extensions require a non-headless Chromium browser with persistent context. The extension path is resolved from the build output.

#### PWA (`pwa`)

```json
{
  "e2eStrategy": "navigate-interact-verify-offline",
  "defaultE2eFlows": ["page-navigation", "install-prompt", "offline-fallback", "push-notification", "sw-lifecycle"],
  "testHarness": "playwright",
  "devServer": true,
  "browsers": ["chromium", "firefox", "webkit"]
}
```

#### React Native (`react-native`)

```json
{
  "e2eStrategy": "launch-app-interact-verify",
  "defaultE2eFlows": ["app-launch", "screen-navigation", "form-interaction", "deep-link"],
  "testHarness": "maestro",
  "devServer": true,
  "buildCommand": "expo build",
  "platforms": ["ios", "android"]
}
```

---

### Screenshot Capture (`screenshotCapture`)

Controls how screenshots are taken during visual QA.

| Setting | Default | Description |
|---------|---------|-------------|
| `fullPage` | `true` | Capture full page (not just viewport) |
| `format` | `"png"` | Image format |
| `quality` | `100` | Image quality (100 = lossless) |
| `waitForNetworkIdle` | `true` | Wait for network activity to stop |
| `waitAfterLoadMs` | `1000` | Additional wait after page load (ms) |
| `outputDir` | `.claude/visual-qa/screenshots` | Where screenshots are saved |

---

### Dark Mode (`darkMode`)

Controls dark mode screenshot verification.

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable dark mode checks |
| `diffThreshold` | `0.03` (3%) | Acceptable diff between light and dark modes |
| `emulateMediaFeature` | `"prefers-color-scheme: dark"` | CSS media query to emulate |
| `compareAgainst` | `"light"` | Compare dark screenshots against light baseline |
| `screenshotDir` | `.claude/visual-qa/screenshots/dark` | Dark mode screenshot output |

---

### Storybook (`storybook`)

Controls auto-generation of Storybook stories.

| Setting | Default | Description |
|---------|---------|-------------|
| `autoGenerate` | `true` | Automatically create stories for new components |
| `includeResponsiveViewports` | `true` | Include mobile/tablet/desktop viewport stories |
| `viewports` | `["mobile", "tablet", "desktop"]` | Viewport variants to generate |
| `skipPatterns` | `["**/index.ts", "**/*.test.*", "**/*.stories.*"]` | Files to exclude |

---

### Token Sync (`tokenSync`)

Controls design token drift detection between the lockfile and source code.

| Setting | Default | Description |
|---------|---------|-------------|
| `autoCheck` | `true` | Automatically check for token drift |
| `warnOnDrift` | `true` | Warn when drift is detected |
| `autoUpdate` | `false` | Do not auto-update lockfile (requires manual review) |

---

### Security (`security`)

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable security auditing |
| `auditLevel` | `"moderate"` | Minimum vulnerability level to report |
| `failOnVulnerability` | `true` | Fail pipeline on vulnerabilities |
| `checkLockfile` | `true` | Audit the lockfile for known issues |

---

### Bundle Size (`bundleSize`)

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable bundle size checks |
| `maxSizeKb` | `200` | Maximum bundle size (KB) before failing |
| `warnSizeKb` | `150` | Size (KB) that triggers a warning |

---

### Error Monitoring (`errorMonitoring`)

Sentry integration for production error tracking.

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `"sentry"` | Error monitoring provider |
| `dsn` | `""` | Sentry DSN (must be configured per project) |
| `environment` | `"production"` | Sentry environment tag |
| `sampleRate` | `1` | Error event sample rate (1 = 100%) |
| `tracesSampleRate` | `0.2` | Performance trace sample rate (20%) |
| `enableInDev` | `false` | Disable in development |
| `sourceMapUpload` | `true` | Upload source maps for readable stack traces |

---

### Deploy Preview (`deployPreview`)

Vercel-based deploy preview integration.

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable deploy previews |
| `provider` | `"vercel"` | Deploy platform |
| `autoDeployOnPR` | `true` | Auto-deploy on pull request |
| `runVisualQAOnPreview` | `true` | Run visual QA on preview deployments |
| `runLighthouseOnPreview` | `true` | Run Lighthouse on preview deployments |

---

### Responsive Verification (`responsiveVerification`)

Controls multi-breakpoint responsive screenshot checks.

| Breakpoint | Width |
|------------|-------|
| `small-mobile` | 320px |
| `mobile` | 375px |
| `tablet` | 768px |
| `desktop` | 1440px |
| `wide` | 1920px |

| Setting | Default | Description |
|---------|---------|-------------|
| `diffThreshold` | `0.03` (3%) | Acceptable diff between expected and actual |
| `blocking` | `false` | Non-blocking -- reports but does not fail pipeline |

---

### Regression Testing (`regressionTesting`)

Visual regression testing against stored baselines.

| Setting | Default | Description |
|---------|---------|-------------|
| `baselineDir` | `.claude/visual-qa/baselines` | Stored baseline screenshots |
| `threshold` | `0.02` (2%) | Acceptable diff from baseline |
| `failOnMissingBaseline` | `false` | Do not fail if baseline does not exist yet |
| `updateBaselinesOnPass` | `false` | Do not auto-update baselines |
| `routes` | `["/"]` | Routes to test |
| `browsers` | `["chromium"]` | Browsers for regression |
| `waitAfterLoadMs` | `1500` | Wait time before capture |

---

### Canva Pipeline (`canva`)

Canva-specific pipeline configuration.

| Setting | Default | Description |
|---------|---------|-------------|
| `tokenInference.confirmWithUser` | `true` | Require user confirmation of inferred tokens |
| `tokenInference.confidenceThreshold` | `"medium"` | Minimum confidence for auto-acceptance |
| `export.format` | `"png"` | Export format from Canva |
| `export.scale` | `2` | Export scale (2x for retina) |
| `mcpServer` | `"canva"` | MCP server name for Canva API |
| `retry.maxAttempts` | `3` | Retry count for Canva API failures |
| `retry.backoffMultiplier` | `2` | Exponential backoff multiplier |

---

### Screenshot Pipeline (`screenshot`)

Screenshot/URL capture configuration.

| Setting | Default | Description |
|---------|---------|-------------|
| `tokenInference.confirmWithUser` | `true` | Require user confirmation of inferred tokens |
| `capture.fullPage` | `true` | Capture full page |
| `capture.scale` | `2` | Capture scale (2x) |
| `urlCapture.viewports` | Desktop (1440x900), Mobile (375x812) | Viewport sizes for URL capture |

---

### Orchestration (`orchestration`)

Controls parallel phase execution.

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable parallel orchestration |
| `maxConcurrent` | `3` | Maximum phases running simultaneously |

**Phase dependency graph:** Defined in `orchestration.phases`. Each phase declares:
- `depends` -- phases that must complete first
- `resources` -- filesystem/port resources the phase uses (prevents conflicts)
- `blocking` -- whether the pipeline waits for this phase
- `description` -- human-readable purpose

**Quality gate subtasks** (5 parallel checks):
- `coverage` -- vitest with 80% threshold
- `typecheck` -- tsc --noEmit
- `build` -- pnpm build
- `token-verify` -- verify-tokens.sh
- `lighthouse` -- Lighthouse audit per page

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
