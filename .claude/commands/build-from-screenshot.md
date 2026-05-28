---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__resize_page, mcp__chrome-devtools__lighthouse_audit, mcp__chrome-devtools__evaluate_script, mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_resize, mcp__playwright__browser_snapshot, AskUserQuestion
---

# /build-from-screenshot — Autonomous Screenshot/URL-to-Working-App Pipeline

You are the master orchestrator for converting screenshots or a live URL into a fully working, tested application. You receive one or more image file paths OR a URL and guide the entire process through 12 phases, using specialized skills and agents. The output target (React, Vue, Svelte, React Native) is determined during intake and drives agent selection in the build phase.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 (TDD) MUST complete before Phase 4 (Build). No exceptions.
- **Visual QA uses pixel diff** — Phase 5 uses `scripts/visual-diff.js` for programmatic comparison, not manual eyeballing.
- **E2E tests are generated** — Phase 6 generates and runs Playwright E2E tests appropriate to the app type.
- **App-type aware** — Chrome extensions, PWAs, and web apps each get tailored test strategies.
- **Token inference requires confirmation** — Phase 2 extracts tokens via AI vision and MUST get user confirmation before locking.
- **Renderer-driven** — Phase 4 dispatches the converter agent named by the resolved renderer manifest (`renderer-registry.js resolve <renderer>`), not a hardcoded `outputTarget` table.

## Input

The user provides: `$ARGUMENTS` (a URL or one or more image file paths)

**Detect input type:**
- If `$ARGUMENTS` starts with `http://` or `https://` → **URL capture mode**
  - The pipeline will navigate to the URL and capture screenshots automatically
  - Store the original URL for the build report
- Otherwise → **File paths mode**
  - Treat `$ARGUMENTS` as one or more image file paths (space-separated or glob)
  - Verify each file exists before proceeding

**URL capture mode steps:**
1. Use Chrome DevTools MCP to navigate to the URL: `mcp__chrome-devtools__navigate_page`
2. Resize to standard viewports (desktop 1440px, tablet 768px, mobile 375px): `mcp__chrome-devtools__resize_page`
3. Take screenshots at each viewport: `mcp__chrome-devtools__take_screenshot`
4. Save screenshots to `.claude/visual-qa/screenshots/source/`

## Configuration

Load `.claude/pipeline.config.json` at the start. This provides:
- Visual diff thresholds and iteration limits
- TDD enforcement settings
- E2E strategy per app type
- Quality gate thresholds
- Lighthouse score minimums
- Token inference confidence threshold

## Progress Tracking

Use `TodoWrite` to create a master checklist. Update each item as phases complete. This enables interrupted sessions to resume.

```
[ ] Phase 0: Token Sync — sync-tokens.sh → check for drift (if lockfile exists)
[ ] Phase 1: Intake — screenshot-intake skill → build-spec.json (with outputTarget)
[ ] Phase 2: Token Inference — canva-token-inference skill → lockfile + config (requires user confirmation)
[ ] Phase 3: TDD Scaffold — tdd-from-figma skill → failing tests (RED)
[ ] Phase 4: Component Build — converter agent (per resolved renderer manifest) → tests pass (GREEN)
[ ] Phase 4.5: Storybook — generate-stories.sh → auto-generated stories
[ ] Phase 5: Visual Verification — pixel-diff loop (max N iterations, against source screenshots)
[ ] Phase 5.5: Dark Mode — check-dark-mode.sh → dark mode visual verification
[ ] Phase 6: E2E Tests — e2e-test-generator skill → Playwright tests
[ ] Phase 7: Cross-Browser — screenshots in Firefox/WebKit (non-blocking)
[ ] Phase 8: Quality Gate — coverage, types, build, tokens, Lighthouse
[ ] Phase 8.5: Responsive — check-responsive.sh → screenshots at 5 breakpoints
[ ] Phase 9: Report — build-report.md
```
## Phase 0: Token Drift Check (Conditional)

Identical to `/build-from-figma`. Only runs when `tokenSync.autoCheck` is `true` AND a lockfile exists.

```bash
./scripts/sync-tokens.sh --json
```

## Phase 1: Intake

Invoke the `screenshot-intake` skill.

**Input:** The URL or file paths from $ARGUMENTS, plus captured screenshots (if URL mode)
**Output:** `.claude/plans/build-spec.json` with `"source": "screenshot"` and `"outputTarget": "react"|"vue"|"svelte"|"react-native"`

This phase:
1. If URL mode: screenshots are already captured during input processing
2. If file mode: validates and catalogs the provided image files
3. Analyzes screenshots with Claude vision for structure, components, text, layout
4. Scans the local project for framework, existing components, UI libraries
5. Asks the user 3-5 targeted questions (scope, output target, component confirmation, reuse, business logic, integration)
6. Writes the build spec including `outputTarget` based on the user-chosen framework

**Resume check:** If `.claude/plans/build-spec.json` already exists with `"source": "screenshot"`, ask the user if they want to reuse it or regenerate.

## Phase 2: Token Inference

Invoke the `canva-token-inference` skill.

**Input:** build-spec.json with screenshot paths (source: `"screenshot"`)
**Output:** `src/styles/design-tokens.lock.json`, framework-appropriate config, `src/styles/tokens.css`

This phase:
1. Analyzes source screenshots with Claude vision to extract colors, typography, spacing, effects
2. Assigns confidence scores (high/medium/low) to each token
3. **Presents tokens to user for confirmation** — this is MANDATORY, do not skip
4. After user confirms/corrects, writes the lockfile
5. Generates framework-appropriate config (Tailwind for React/Vue/Svelte, StyleSheet tokens for React Native) and CSS custom properties from lockfile
6. Validates completeness

**Resume check:** If `src/styles/design-tokens.lock.json` already exists with `"source": "screenshot"`, ask the user if they want to reuse it or re-infer.

## Phase 3: TDD Scaffold

Invoke the `tdd-from-figma` skill. (This skill reads `build-spec.json` and works identically regardless of source.)

**Input:** `build-spec.json` + `design-tokens.lock.json`
**Output:** Test files appropriate to the output target

Identical to `/build-from-figma` Phase 3.

## Phases 4-9: Parallel Execution

After Phase 3 completes (TDD scaffold with failing tests confirmed), hand off remaining phases to the parallel orchestration skill.

**Read `renderer` from `build-spec.json` and resolve its manifest before dispatching:**

```bash
node scripts/renderer-registry.js resolve <renderer> --json
```

The manifest drives both converter dispatch (`manifest.converter`) and phase exclusion (`manifest.phases.exclude`).

**Invoke the `parallel-orchestration` skill with:**
- Phases to run: `["component-build", "storybook", "visual-diff", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]`
  - Drop any phase listed in `manifest.phases.exclude` (e.g. expo excludes `visual-diff`, `dark-mode`, `cross-browser`, `responsive`)
  - For `chrome-extension` appType: also exclude `cross-browser`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.*`
  - Pipeline source: `"screenshot"`
  - Renderer manifest: from `renderer-registry.js resolve <renderer> --json`
  - Reference screenshots: `.claude/visual-qa/screenshots/source/`
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Start `component-build` first (dispatches the converter named in the resolved manifest, see Phase 4)
2. After build completes, fan out independent phases in parallel (max 3 concurrent)
3. Run `e2e-tests` after `visual-diff` completes (or after `component-build` if visual-diff excluded)
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
- If `manifest.language === "react"`, prefer the source-appropriate React converter. For the screenshot pipeline that is `figma-react-converter` (the generic React builder) — it builds React components from reference screenshots regardless of source. The shipped React manifests (nextjs, vite) already set `converter` to `figma-react-converter`.
- Otherwise dispatch `manifest.converter` directly (e.g. `react-native-converter` for the expo renderer, and the future `vue-converter` / `svelte-converter`).

The component file extension, directory, and page-routing convention come from `manifest.component` (`ext`, `dir`, `pageRouting`); the test command comes from `manifest.commands.test`.

**Input:** build-spec.json, resolved renderer manifest, lockfile, existing test files, source screenshots
**Output:** Component and page files for the renderer's framework

This phase:
1. Reads build-spec.json — verifies `source` is `"screenshot"` and reads `renderer`
2. Resolves the manifest and dispatches the converter (see selection rule above)
3. References lockfile for all token values (no approximating)
4. Uses source screenshots for layout/structure decisions
5. Generates components (at `manifest.component.dir` with `manifest.component.ext`) that satisfy the test files from Phase 3
6. Runs `manifest.commands.test` after each component batch to confirm GREEN

**Critical rule:** If tests fail, fix the component — never modify the test files.

## Phase 4.5: Storybook Generation (Non-Blocking)

Identical to `/build-from-figma` Phase 4.5. Skipped for `react-native` outputTarget.

```bash
./scripts/generate-stories.sh
```
## Phase 5: Visual Verification (Automated Pixel Diff)

Same process as `/build-from-figma` Phase 5, but reference screenshots come from the source captures (URL screenshots or provided image files).

**Reference screenshots:** Stored in `.claude/visual-qa/screenshots/source/`

For each page:

```
1. Start: pnpm dev (background) — skip if appType is chrome-extension or the renderer excludes `visual-diff` (e.g. expo)
2. Wait for server ready

3. Reference screenshots already exist in .claude/visual-qa/screenshots/source/

4. FOR iteration IN 1..maxVisualIterations:
   a. Chrome DevTools MCP: navigate → resize → take_screenshot
      → Save to .claude/visual-qa/screenshots/chromium/

   b. Run pixel diff:
      → node scripts/visual-diff.js --batch \
          .claude/visual-qa/screenshots/chromium \
          .claude/visual-qa/screenshots/source \
          --output-dir .claude/visual-qa/diffs --json

   c. Parse JSON results:
      → IF all mismatchPct <= threshold: PASS → break
      → IF any FAIL and iteration < max:
        - Read diff images + region analysis
        - Fix component code targeting specific regions
        - Run test command (ensure tests still pass)
        - Continue to next iteration

5. Stop dev server
```

**Note:** When the resolved renderer excludes `visual-diff` (e.g. expo, which has no browser rendering), this phase is skipped. Mark as N/A in the checklist.

## Phases 5.5 through 9

Identical to `/build-from-figma`. All shared phases work the same regardless of design source:

- **Phase 5.5:** Dark Mode verification (`check-dark-mode.sh`) — skipped when the renderer excludes `dark-mode`
- **Phase 6:** E2E test generation (`e2e-test-generator` skill)
- **Phase 7:** Cross-browser screenshots (Firefox, WebKit) — skipped when the renderer excludes `cross-browser`
- **Phase 8:** Quality gate (coverage, types, build, tokens, Lighthouse)
- **Phase 8.5:** Responsive screenshots (`check-responsive.sh`) — skipped when the renderer excludes `responsive`
- **Phase 9:** Build report (`.claude/visual-qa/build-report.md`)

The build report should note:
- `Source: Screenshot (URL)` or `Source: Screenshot (files)` depending on input type
- `Source URL: <url>` if URL mode was used
- `Output Target: react|vue|svelte|react-native`
- Include the token inference confidence summary

## Error Recovery

- **URL unreachable:** Check the URL is valid and the site is accessible. Offer to retry or accept manually captured screenshots instead.
- **Screenshot capture fails:** Ask user to manually capture screenshots and provide file paths.
- **Image files not found:** List missing files. Ask user to verify paths.
- **Token inference low confidence:** Present all tokens with detailed confidence breakdown. Offer to accept user-provided brand guidelines as override.
- **Converter agent missing:** If the converter named by the resolved manifest does not exist yet, inform the user. For `react` renderers, fall back to `figma-react-converter` (the generic React builder).
- **Dev server will not start:** Check for port conflicts, missing dependencies. Run `pnpm install` if needed.
- **Tests will not pass after 3 attempts:** Mark component as needing manual intervention, continue with remaining.
- **Build fails:** Check TypeScript errors first, then dependency issues. Report blockers.
- **Session interrupted:** On resume, check TodoWrite progress. Skip completed phases, resume from first incomplete.

## Completion

When all phases complete, present:

1. The build report summary
2. Source type (URL or files) and output target framework
3. Count of pages/components built and verified
4. Token inference accuracy (how many tokens were confirmed vs corrected)
5. Any items needing manual review
6. Next steps (e.g., "run `pnpm dev` to see the app")
