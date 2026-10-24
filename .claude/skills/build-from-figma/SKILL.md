---
name: build-from-figma
description: Autonomous Figma-to-working-app pipeline. Intake, design-token lockfile, failing tests first, per-component build lanes, pixel-diff visual QA, E2E, cross-browser, quality gate and build report, for React, Vue, Svelte or React Native. Use when the user gives a Figma URL and wants a working, tested app. Keywords: build from Figma, Figma to React, Figma URL, design to code, pixel-perfect
argument-hint: "<figma-url>"
disable-model-invocation: true
allowed-tools: Skill, Agent, Workflow, Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, mcp__figma__*, mcp__figma-desktop__*, mcp__chrome-devtools__*, mcp__playwright__*
---

# /build-from-figma — Autonomous Figma-to-Working-App Pipeline

You are the master orchestrator for converting a Figma design into a fully working, tested React application. You receive a Figma URL and guide the entire process through 9 phases, using specialized skills and agents.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 (TDD) MUST complete before Phase 4 (Build). No exceptions.
- **The tests are the specification** — Phases 4 and 5 never edit a test file; the `component-lanes` workflow checks every test file's checksum after each change.
- **Visual QA uses pixel diff** — Phase 5 uses `scripts/visual-diff.js` for programmatic comparison, not manual eyeballing.
- **E2E tests are generated** — Phase 6 generates and runs Playwright E2E tests appropriate to the app type.
- **App-type aware** — Chrome extensions, PWAs, and web apps each get tailored test strategies.

## Input

The user provides: `$ARGUMENTS` (a Figma URL, optionally with node-id)

Parse the Figma URL to extract:
- `fileKey` from the URL path
- `nodeId` from the `?node-id=` parameter (convert `-` to `:`)
- For branch URLs: use `branchKey` as `fileKey`

## Configuration

Load `.claude/pipeline.config.json` at the start. This provides:
- Visual diff thresholds and iteration limits
- TDD enforcement settings
- E2E strategy per app type
- Quality gate thresholds
- Lighthouse score minimums

## Progress Tracking

Track the run in **`.claude/plans/pipeline-state.json`** (gitignored, beside `build-spec.json`). Todo tools are not offered on current models, and a file survives an interrupted session: the SessionStart hook reads it and tells the next session where the run stopped. `/build-from-canva`, `/build-from-screenshot` and `/build-from-conversation` use the same file and shape.

Create it when the run starts, and rewrite it at every phase boundary and after each component and page result:

```json
{
  "pipeline": "figma",
  "source": "https://www.figma.com/design/abc123/My-App",
  "renderer": "vite",
  "appType": "web-app",
  "startedAt": "2026-10-24T15:00:00Z",
  "updatedAt": "2026-10-24T15:42:00Z",
  "phase": "5",
  "phases": {
    "0": { "name": "token-sync", "status": "skipped" },
    "1": { "name": "intake", "status": "done", "artifact": ".claude/plans/build-spec.json" },
    "2": { "name": "token-lock", "status": "done", "artifact": "src/styles/design-tokens.lock.json" },
    "3": { "name": "tdd-scaffold", "status": "done" },
    "4": { "name": "component-build", "status": "done" },
    "4.5": { "name": "storybook", "status": "pending" },
    "5": { "name": "visual-diff", "status": "running" },
    "5.5": { "name": "dark-mode", "status": "pending" },
    "6": { "name": "e2e-tests", "status": "pending" },
    "7": { "name": "cross-browser", "status": "pending" },
    "8": { "name": "quality-gate", "status": "pending" },
    "8.5": { "name": "responsive", "status": "pending" },
    "9": { "name": "report", "status": "pending" }
  },
  "components": { "Button": { "test": "src/components/Button/Button.test.tsx", "testSha256": "…", "build": "green", "attempts": 1 } },
  "pages": { "home": { "visual": "pass", "worstMismatchPct": 0.012, "rounds": 2 } },
  "notes": ["Hero: needs review, 768px layout still 4.1% off after 5 rounds"]
}
```

- Phase `status`: `pending`, `running`, `done`, `failed`, `skipped` or `needs-review`. Component `build`: `pending`, `green`, `needs-review`, `failed`. Page `visual`: `pending`, `pass`, `needs-review`, `skipped`.
- Timestamps come from `date -u +%Y-%m-%dT%H:%M:%SZ`. Set `"phase": "done"` when Phase 9 finishes.
- **Resume:** when the file exists for the same source and is not `done`, skip every phase marked `done` or `skipped` whose artifact still exists, and continue from the first other phase. A different source starts a new run: rename the old file to `pipeline-state.<startedAt>.json` first.

## Phase 0: Token Drift Check (Conditional)

Only runs when `tokenSync.autoCheck` is `true` in `pipeline.config.json` AND a lockfile already exists at `src/styles/design-tokens.lock.json`.

```bash
./scripts/sync-tokens.sh --json
```

Parse the JSON output:
- `"status": "no-drift"` → Skip Phase 2, proceed to Phase 1
- `"status": "minor-drift"` → Log drift details, proceed to Phase 2 to re-extract
- `"status": "major-drift"` → Pause and ask user: "Significant token changes detected. Re-run full intake (Phase 1) or just update tokens (Phase 2)?"

If lockfile does not exist, skip this phase entirely.

## Phase 1: Intake

Invoke the `figma-intake` skill.

**Input:** The Figma URL from $ARGUMENTS
**Output:** `.claude/plans/build-spec.json`

This phase:
1. Auto-discovers Figma file structure via MCP
2. Scans the local project for framework, existing components, UI libraries
3. Asks the user 3-5 targeted questions (scope, reuse, business logic, labels, integration)
4. Writes the build spec

**Resume check:** If `.claude/plans/build-spec.json` already exists, ask the user if they want to reuse it or regenerate.

## Phase 2: Token Lock

Invoke the `design-token-lock` skill.

**Input:** Figma file key from build-spec.json
**Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

This phase:
1. Extracts all design values from Figma via MCP
2. Writes the lockfile with exact hex, px, text content values
3. Generates Tailwind config and CSS custom properties from lockfile
4. Validates completeness against the Figma file

**Resume check:** If `src/styles/design-tokens.lock.json` already exists, ask the user if they want to reuse it or re-extract.

## Phase 3: TDD Scaffold

Invoke the `tdd-from-figma` skill.

**Input:** `build-spec.json` + `design-tokens.lock.json`
**Output:** `src/components/**/*.test.tsx` files

This phase:
1. Reads the build spec for component inventory
2. Reads the lockfile for exact text content, ARIA expectations
3. Writes test files for every component (rendering, content, a11y, interactions)
4. Runs `pnpm vitest run` to confirm RED (all tests fail — no implementations yet)

Process components in dependency order: UI primitives → Layout → Sections → Pages

## Phases 4-9: Component Lanes, then Parallel Phases

After Phase 3 confirms RED, read `renderer` from `build-spec.json` and resolve its manifest:

```bash
node scripts/renderer-registry.js resolve <renderer> --json
```

The manifest drives converter dispatch (`manifest.converter`), the test command (`manifest.commands.test`) and phase exclusion (`manifest.phases.exclude`).

### Phases 4-5: the `component-lanes` workflow

Building components and fixing visual differences are per-item work, so they run as a workflow (`.claude/workflows/component-lanes.js`) whenever the Workflow tool is available. The loop bounds and the "never modify the tests" rule are enforced in its code, not left to prose.

1. **Prepare, in this session:**
   - Record each test file's checksum (`shasum -a 256 <test file>`) in `pipeline-state.json` → `components`.
   - Start the dev server in the background with `manifest.commands.dev` (for `appType: "chrome-extension"`, run `pnpm build` and point the pages at the built output). Wait until it answers.
   - Capture the Figma reference screenshots once into `.claude/visual-qa/screenshots/figma/<page>-<width>.png` (Figma MCP `get_screenshot`), one per page and per `visualDiff.requiredBreakpoints` width the design has a frame for.
2. **Run the workflow:** call the Workflow tool with `name: "component-lanes"` and these args, passed as JSON values:
   ```json
   {
     "source": "figma",
     "converter": "figma-react-converter",
     "testCommand": "pnpm vitest run",
     "lockfile": "src/styles/design-tokens.lock.json",
     "buildSpec": ".claude/plans/build-spec.json",
     "components": [
       { "name": "Button", "tier": 0, "dir": "src/components/Button", "testFile": "src/components/Button/Button.test.tsx", "testSha256": "…" }
     ],
     "pages": [
       { "name": "home", "url": "http://localhost:5173/", "references": { "1440": ".claude/visual-qa/screenshots/figma/home-1440.png" } }
     ],
     "maxBuildAttempts": 3,
     "maxVisualIterations": 5,
     "diffPassThreshold": 0.02,
     "skipVisual": false
   }
   ```
   `tier` follows the component's `category` in the build spec: `ui` 0, `layout` 1, `sections` 2, `pages` 3. `maxVisualIterations` and `diffPassThreshold` come from `pipeline.config.json → iterationLoop`. Set `skipVisual` when the manifest excludes `visual-diff`.
3. **What it does:** each tier's components build in parallel lanes (the converter writes only inside its own directory; shared files such as barrels are applied once per tier), and a separate check reruns each component's tests and compares its test file's checksum. Then up to `maxVisualIterations` rounds: every page is diffed in parallel, the pass decision is made from the numbers, fixes are grouped so each component has one fixer per round, and every round re-checks every page.
4. **Record the result** in `pipeline-state.json`: phases 4 and 5, each component's status, each page's status and worst mismatch. A `TEST_TAMPERED` component changed its test file: restore that file from the Phase 3 output (`git checkout -- <test>` when it is committed) and mark the component `needs-review`. Leave the dev server running for the phases below.

If the Workflow tool is not available (workflows turned off, or a plan without them), run all of Phases 4-9 through `parallel-orchestration` instead.

### Phases 4.5-9: `parallel-orchestration`

**Invoke the `parallel-orchestration` skill with:**
- Phases to run: `["storybook", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]` after the workflow, or `["component-build", "storybook", "visual-diff", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]` without it
  - Drop any phase listed in `manifest.phases.exclude`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.tsx`
  - Pipeline source: `"figma"`
  - Renderer manifest: from `renderer-registry.js resolve <renderer> --json`
  - Figma screenshots: `.claude/visual-qa/screenshots/figma/`
  - Lane results: the `component-lanes` return value, when the workflow ran
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Treat `component-build` and `visual-diff` as already complete when the workflow ran; otherwise start `component-build` first (dispatching the converter named in the resolved manifest, see Phase 4)
2. Fan out the independent phases in parallel (max 3 concurrent)
3. Run `e2e-tests` after `visual-diff`
4. Run `report` after both `quality-gate` and `e2e-tests` complete
5. Stream results as each phase completes, and update `pipeline-state.json` as each one finishes
6. Produce a batch summary with speedup metrics

Stop the dev server when the last phase that needs it has finished.

**Fallback:** If `orchestration.enabled` is `false` in pipeline.config.json, execute the phases sequentially as documented below.

The individual phase descriptions below serve as reference for what each phase does. The workflow and the parallel orchestration skill dispatch the same agents, skills and scripts; they only change the execution order.

## Phase 4: Component Build (Renderer-Driven)

Read `renderer` from `build-spec.json`, resolve its manifest, and dispatch the converter it names:

```bash
node scripts/renderer-registry.js resolve <renderer> --json
```

**Converter selection:**
- If `manifest.language === "react"`, prefer the source-appropriate React builder. For the Figma pipeline that is `figma-react-converter`, driven by the `figma-to-react-workflow` skill (which detects build-spec.json and lockfile automatically). The shipped React manifests (nextjs, vite) already name `figma-react-converter` as their `converter`.
- Otherwise dispatch `manifest.converter` directly (e.g. `react-native-converter` for expo, and the future `vue-converter` / `svelte-converter`).

The component extension, directory, page-routing convention, and test command come from `manifest.component` and `manifest.commands.test`.

**Input:** build-spec.json, resolved renderer manifest, lockfile, existing test files
**Output:** Component and page files for the renderer's framework (React: `src/components/**/*.tsx`)

This phase:
1. Skips discovery (build-spec.json exists); reads `renderer` and resolves its manifest
2. References lockfile for all token values (no approximating)
3. Generates components (at `manifest.component.dir` with `manifest.component.ext`) that satisfy the test files from Phase 3
4. Runs `manifest.commands.test` after each component batch to confirm GREEN

**Critical rule:** If tests fail, fix the component — never modify the test files.

## Phase 4.5: Storybook Generation (Non-Blocking)

Only runs when `storybook.autoGenerate` is `true` in `pipeline.config.json`.

```bash
./scripts/generate-stories.sh
```

This phase:
1. Scans all components generated in Phase 4
2. Generates `.stories.tsx` files with default and responsive viewport stories
3. Runs `pnpm build-storybook --quiet` as a smoke test (if Storybook is installed)
4. Skips components that already have story files

Non-blocking: if Storybook is not installed or generation fails, log a warning and continue.

## Phase 5: Visual Verification (Automated Pixel Diff)

Automated pixel-level screenshot comparison using `scripts/visual-diff.js`.

**Prerequisites:** All unit tests passing from Phase 4.

**Configuration:** Read `.claude/pipeline.config.json`:
- `iterationLoop.maxVisualIterations` (default: 5)
- `iterationLoop.diffPassThreshold` (default: 0.02 = 2% pixel diff)

For each page in build-spec.json:

```
1. Start: pnpm dev (background) — skip if appType is chrome-extension
   For chrome-extension: pnpm build first, then test against built output
2. Wait for server/build ready

3. Capture Figma reference screenshots ONCE:
   → Figma MCP: get_screenshot for each page/frame
   → Save to .claude/visual-qa/screenshots/figma/

4. FOR iteration IN 1..maxVisualIterations:
   a. Chrome DevTools MCP: navigate → resize → take_screenshot at each breakpoint
      → Save to .claude/visual-qa/screenshots/chromium/

   b. Run pixel diff:
      → node scripts/visual-diff.js --batch \
          .claude/visual-qa/screenshots/chromium \
          .claude/visual-qa/screenshots/figma \
          --output-dir .claude/visual-qa/diffs --json

   c. Parse JSON results:
      → IF all mismatchPct <= threshold: PASS → break loop
      → IF any FAIL and iteration < max:
        - Read diff images + region analysis to identify problem areas
        - Fix component code targeting specific regions
        - Run: pnpm vitest run (ensure tests still pass)
        - Continue to next iteration
      → IF final iteration and still failing:
        - Save diff images for manual review
        - Mark as "needs manual review"

5. Stop dev server
```

## Phase 5.5: Dark Mode Verification (Non-Blocking)

Only runs when `darkMode.enabled` is `true` in `pipeline.config.json`.

**Prerequisites:** Phase 5 complete (light mode screenshots exist in `.claude/visual-qa/screenshots/chromium/`).

```bash
./scripts/check-dark-mode.sh http://localhost:3000
```

This phase:
1. Captures dark mode screenshots at all breakpoints using Playwright's `colorScheme: 'dark'`
2. Compares against light mode baselines using `visual-diff.js`
3. Uses `darkMode.diffThreshold` (default 0.03, more lenient than light mode)
4. Saves diff images to `.claude/visual-qa/diffs/dark-vs-light/`

Non-blocking: results are logged in the build report but do not halt the pipeline. Dark mode differences are expected — the goal is to catch missing dark mode styles (invisible text, missing backgrounds).

If no dark mode styles exist in the app (all screenshots match light mode), note this in the report as "No dark mode styles detected."

## Phase 6: E2E Tests

Generate and run end-to-end tests appropriate to the app type.

```
1. Invoke the e2e-test-generator skill:
   → Reads build-spec.json (appType, pages, e2e.flows, extensionManifest)
   → Generates Playwright config + test files in e2e/

2. Run E2E tests:
   → web-app: pnpm exec playwright test
   → chrome-extension: pnpm build && pnpm exec playwright test --config=playwright.chrome-ext.config.ts
   → pwa: pnpm exec playwright test (includes offline tests)

3. If E2E tests fail:
   → Read failure output
   → Fix component/page code
   → Re-run unit tests (ensure still passing)
   → Re-run E2E (max 2 retries)

4. Save results to .claude/visual-qa/e2e-report.md
```

## Phase 7: Cross-Browser Verification (Non-Blocking)

Diff Firefox and WebKit screenshots against their committed baselines with
provenance verification (RFC 0002).

```bash
# Only for web apps and PWAs (Chrome extensions are Chromium-only)
./scripts/cross-browser-baseline.sh compare http://localhost:3000 --json
```

If no cross-browser baselines are committed yet the compare skips with a
capture hint (`./scripts/cross-browser-baseline.sh capture <url>` in the
pinned Playwright container, then commit `.claude/visual-qa/baselines/`).

Cross-browser differences are logged in the build report but do NOT block the
pipeline (`visualBaselines.blocking: false`).

## Phase 8: Quality Gate

Run all quality checks. All must pass for pipeline success.

```bash
# 1. Unit test coverage (threshold from pipeline.config.json, default: 80%)
pnpm vitest run --coverage

# 2. Test existence verification
./scripts/verify-test-coverage.sh

# 3. TypeScript
pnpm tsc --noEmit

# 4. Production build
pnpm build

# 5. Token verification
./scripts/verify-tokens.sh

# 6. Lighthouse audit (via Chrome DevTools MCP)
#    → Start dev server, run lighthouse_audit per page
#    → Thresholds from pipeline.config.json → qualityGate.lighthouseThresholds
```

If any check fails, attempt to fix automatically (max 2 attempts per check). If still failing after fixes, report the failure and continue to the report phase.

## Phase 9: Report

Write `.claude/visual-qa/build-report.md` with:

- Build summary (pages, components, framework, app type, timestamps)
- Visual QA results table (pass/fail per page per breakpoint, mismatch %, iterations needed)
- E2E test results table (pass/fail per test file, app-type-specific tests)
- Cross-browser results (if applicable, non-blocking)
- Quality gate results table (each check with status and details)
- Unit test coverage percentage
- Lighthouse scores
- Diff images saved to `.claude/visual-qa/diffs/`
- Dark mode verification results (if enabled)
- Storybook generation status (stories generated, skipped)
- Component documentation links (generated by `generate-component-docs.sh`)
- Remaining issues requiring manual attention

Create the `.claude/visual-qa/` directory if it doesn't exist.

After writing the build report, generate component documentation:

```bash
./scripts/generate-component-docs.sh
```

This creates MDX files in `docs/components/` with props tables, token mappings, and links to tests and stories.

Present the report summary to the user when complete.

## Error Recovery

- **Figma MCP unavailable:** Ask user to verify Figma Desktop is running. Offer to proceed with manual screenshots.
- **Dev server won't start:** Check for port conflicts, missing dependencies. Run `pnpm install` if needed.
- **Tests won't pass after 3 attempts:** Mark component as needing manual intervention, continue with remaining components.
- **Build fails:** Check TypeScript errors first, then dependency issues. Report blockers to user.
- **Session interrupted:** On resume, read `.claude/plans/pipeline-state.json` (the SessionStart status block names the phase). Skip completed phases whose artifacts still exist and resume from the first incomplete one. An interrupted `component-lanes` run can be relaunched in the same session (or one resumed with `claude --resume`), and its finished agents return their saved results; a fresh session starts the workflow over, so prefer re-running only the components the state file does not mark green.

## Completion

When all phases complete, present:

1. The build report summary
2. Count of pages/components built and verified
3. Any items needing manual review
4. Next steps (e.g., "run `pnpm dev` to see the app")
