---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, mcp__figma__get_metadata, mcp__figma__get_variable_defs, mcp__figma__get_design_context, mcp__figma__get_screenshot, mcp__figma-desktop__get_metadata, mcp__figma-desktop__get_variable_defs, mcp__figma-desktop__get_design_context, mcp__figma-desktop__get_screenshot, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__resize_page, mcp__chrome-devtools__lighthouse_audit, mcp__chrome-devtools__evaluate_script, AskUserQuestion
---

# /build-from-figma — Autonomous Figma-to-Working-App Pipeline

You are the master orchestrator for converting a Figma design into a fully working, tested React application. You receive a Figma URL and guide the entire process through 9 phases, using specialized skills and agents.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 (TDD) MUST complete before Phase 4 (Build). No exceptions.
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

Use `TodoWrite` to create a master checklist. Update each item as phases complete. This enables interrupted sessions to resume.

```
[ ] Phase 0: Token Sync — sync-tokens.sh → check for drift (if lockfile exists)
[ ] Phase 1: Intake — figma-intake skill → build-spec.json
[ ] Phase 2: Token Lock — design-token-lock skill → lockfile + tailwind config
[ ] Phase 3: TDD Scaffold — tdd-from-figma skill → failing tests (RED)
[ ] Phase 4: Component Build — figma-to-react-workflow → tests pass (GREEN)
[ ] Phase 4.5: Storybook — generate-stories.sh → auto-generated stories
[ ] Phase 5: Visual Verification — pixel-diff loop (max N iterations)
[ ] Phase 5.5: Dark Mode — check-dark-mode.sh → dark mode visual verification
[ ] Phase 6: E2E Tests — e2e-test-generator skill → Playwright tests
[ ] Phase 7: Cross-Browser — screenshots in Firefox/WebKit (non-blocking)
[ ] Phase 8: Quality Gate — coverage, types, build, tokens, Lighthouse
[ ] Phase 9: Report — build-report.md
```

For each component, track: `[ ] ComponentName: test-written → implemented → visual-verified`

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

## Phases 4-9: Parallel Execution

After Phase 3 completes (TDD scaffold with failing tests confirmed), hand off remaining phases to the parallel orchestration skill.

**Read `renderer` from `build-spec.json` and resolve its manifest before dispatching:**

```bash
node scripts/renderer-registry.js resolve <renderer> --json
```

The manifest drives both converter dispatch (`manifest.converter`) and phase exclusion (`manifest.phases.exclude`).

**Invoke the `parallel-orchestration` skill with:**
- Phases to run: `["component-build", "storybook", "visual-diff", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]`
  - Drop any phase listed in `manifest.phases.exclude`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.tsx`
  - Pipeline source: `"figma"`
  - Renderer manifest: from `renderer-registry.js resolve <renderer> --json`
  - Figma screenshots: `.claude/visual-qa/screenshots/figma/`
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Start `component-build` first (dispatches the converter named in the resolved manifest, see Phase 4 — all other phases depend on it)
2. After build completes, fan out independent phases in parallel (max 3 concurrent)
3. Run `e2e-tests` after `visual-diff` completes
4. Run `report` after both `quality-gate` and `e2e-tests` complete
5. Stream results as each phase completes
6. Produce a batch summary with speedup metrics

**Fallback:** If `orchestration.enabled` is `false` in pipeline.config.json, execute phases 4-9 sequentially as documented below.

The individual phase descriptions below serve as reference for what each phase does. The parallel orchestration skill dispatches the same agents, skills, and scripts — it only changes the execution order.

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

Capture screenshots in Firefox and WebKit, compare against Chromium baseline.

```bash
# Only for web apps and PWAs (Chrome extensions are Chromium-only)
./scripts/cross-browser-test.sh firefox http://localhost:3000
./scripts/cross-browser-test.sh webkit http://localhost:3000

node scripts/visual-diff.js --batch \
  .claude/visual-qa/screenshots/firefox \
  .claude/visual-qa/screenshots/chromium \
  --output-dir .claude/visual-qa/diffs/firefox-vs-chromium \
  --threshold 0.03
```

Cross-browser differences are logged in the build report but do NOT block the pipeline.

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
- **Session interrupted:** On resume, check TodoWrite progress. Skip completed phases, resume from first incomplete item.

## Completion

When all phases complete, present:

1. The build report summary
2. Count of pages/components built and verified
3. Any items needing manual review
4. Next steps (e.g., "run `pnpm dev` to see the app")
