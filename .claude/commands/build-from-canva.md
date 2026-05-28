---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, AskUserQuestion
---

# /build-from-canva — Autonomous Canva-to-Working-App Pipeline

You are the master orchestrator for converting a Canva design into a fully working, tested React application. You receive a Canva URL and guide the entire process through 12 phases, using specialized skills and agents.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 (TDD) MUST complete before Phase 4 (Build). No exceptions.
- **Visual QA uses pixel diff** — Phase 5 uses `scripts/visual-diff.js` for programmatic comparison, not manual eyeballing.
- **E2E tests are generated** — Phase 6 generates and runs Playwright E2E tests appropriate to the app type.
- **App-type aware** — Chrome extensions, PWAs, and web apps each get tailored test strategies.
- **Token inference requires confirmation** — Phase 2 extracts tokens via AI vision and MUST get user confirmation before locking.

## Input

The user provides: `$ARGUMENTS` (a Canva design URL)

Parse the Canva URL to extract:
- `designId` from the URL path (e.g., `https://www.canva.com/design/DAGxyz.../...` → `DAGxyz...`)

## Configuration

Load `.claude/pipeline.config.json` at the start. This provides:
- Visual diff thresholds and iteration limits
- TDD enforcement settings
- E2E strategy per app type
- Quality gate thresholds
- Lighthouse score minimums
- Canva-specific settings (export format, scale, inference confidence threshold)

## Progress Tracking

Use `TodoWrite` to create a master checklist. Update each item as phases complete. This enables interrupted sessions to resume.

```
[ ] Phase 0: Token Sync — sync-tokens.sh → check for drift (if lockfile exists)
[ ] Phase 1: Intake — canva-intake skill → build-spec.json
[ ] Phase 2: Token Inference — canva-token-inference skill → lockfile + tailwind config (requires user confirmation)
[ ] Phase 3: TDD Scaffold — tdd-from-figma skill → failing tests (RED)
[ ] Phase 4: Component Build — converter agent (per resolved renderer manifest) → tests pass (GREEN)
[ ] Phase 4.5: Storybook — generate-stories.sh → auto-generated stories
[ ] Phase 5: Visual Verification — pixel-diff loop (max N iterations, against Canva screenshots)
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

Invoke the `canva-intake` skill.

**Input:** The Canva URL from $ARGUMENTS
**Output:** `.claude/plans/build-spec.json` with `"source": "canva"`

This phase:
1. Exports design screenshots via Canva AI Connector MCP
2. Analyzes screenshots with Claude vision for structure, components, text
3. Scans the local project for framework, existing components, UI libraries
4. Asks the user 3-5 targeted questions (scope, component confirmation, reuse, business logic, integration)
5. Writes the build spec

**Resume check:** If `.claude/plans/build-spec.json` already exists with `"source": "canva"`, ask the user if they want to reuse it or regenerate.

## Phase 2: Token Inference

Invoke the `canva-token-inference` skill.

**Input:** build-spec.json with screenshot paths
**Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

This phase:
1. Analyzes Canva screenshots with Claude vision to extract colors, typography, spacing, effects
2. Assigns confidence scores (high/medium/low) to each token
3. **Presents tokens to user for confirmation** — this is MANDATORY, do not skip
4. After user confirms/corrects, writes the lockfile
5. Generates Tailwind config and CSS custom properties from lockfile
6. Validates completeness

**Resume check:** If `src/styles/design-tokens.lock.json` already exists with `"source": "canva"`, ask the user if they want to reuse it or re-infer.

## Phase 3: TDD Scaffold

Invoke the `tdd-from-figma` skill. (This skill reads `build-spec.json` and works identically regardless of source.)

**Input:** `build-spec.json` + `design-tokens.lock.json`
**Output:** `src/components/**/*.test.tsx` files

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
  - Drop any phase listed in `manifest.phases.exclude`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.tsx`
  - Pipeline source: `"canva"`
  - Renderer manifest: from `renderer-registry.js resolve <renderer> --json`
  - Reference screenshots: `.claude/visual-qa/screenshots/canva/`
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Start `component-build` first (dispatches the converter named in the resolved manifest, see Phase 4)
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
- If `manifest.language === "react"`, prefer the source-appropriate React converter. For the Canva pipeline that is `canva-react-converter` (it builds React components from Canva screenshots). The shipped React manifests (nextjs, vite) set `converter` to the generic `figma-react-converter`; for the Canva source, use `canva-react-converter` instead.
- Otherwise dispatch `manifest.converter` directly (e.g. `react-native-converter` for expo, and the future `vue-converter` / `svelte-converter`).

The component extension, directory, page-routing convention, and test command come from `manifest.component` and `manifest.commands.test`.

**Input:** build-spec.json, resolved renderer manifest, lockfile, existing test files, Canva screenshots
**Output:** Component and page files for the renderer's framework (React: `src/components/**/*.tsx`)

This phase:
1. Reads build-spec.json — verifies `source` is `"canva"` and reads `renderer`
2. Resolves the manifest and dispatches the converter (see selection rule above)
3. References lockfile for all token values (no approximating)
4. Uses Canva screenshots for layout/structure decisions
5. Generates components (at `manifest.component.dir` with `manifest.component.ext`) that satisfy the test files from Phase 3
6. Runs `manifest.commands.test` after each component batch to confirm GREEN

**Critical rule:** If tests fail, fix the component — never modify the test files.

## Phase 4.5: Storybook Generation (Non-Blocking)

Identical to `/build-from-figma` Phase 4.5.

```bash
./scripts/generate-stories.sh
```

## Phase 5: Visual Verification (Automated Pixel Diff)

Same process as `/build-from-figma` Phase 5, but reference screenshots come from Canva exports instead of Figma MCP.

**Reference screenshots:** Already exported during Phase 1, stored in `.claude/visual-qa/screenshots/canva/`

For each page:

```
1. Start: pnpm dev (background) — skip if appType is chrome-extension
2. Wait for server ready

3. Reference screenshots already exist from Phase 1 (canva exports)
   → Stored in .claude/visual-qa/screenshots/canva/

4. FOR iteration IN 1..maxVisualIterations:
   a. Chrome DevTools MCP: navigate → resize → take_screenshot
      → Save to .claude/visual-qa/screenshots/chromium/

   b. Run pixel diff:
      → node scripts/visual-diff.js --batch \
          .claude/visual-qa/screenshots/chromium \
          .claude/visual-qa/screenshots/canva \
          --output-dir .claude/visual-qa/diffs --json

   c. Parse JSON results:
      → IF all mismatchPct <= threshold: PASS → break
      → IF any FAIL and iteration < max:
        - Read diff images + region analysis
        - Fix component code targeting specific regions
        - Run: pnpm vitest run (ensure tests still pass)
        - Continue to next iteration

5. Stop dev server
```

## Phases 5.5 through 9

Identical to `/build-from-figma`. All shared phases work the same regardless of design source:

- **Phase 5.5:** Dark Mode verification (`check-dark-mode.sh`)
- **Phase 6:** E2E test generation (`e2e-test-generator` skill)
- **Phase 7:** Cross-browser screenshots (Firefox, WebKit)
- **Phase 8:** Quality gate (coverage, types, build, tokens, Lighthouse)
- **Phase 8.5:** Responsive screenshots (`check-responsive.sh`)
- **Phase 9:** Build report (`.claude/visual-qa/build-report.md`)

The build report should note `Source: Canva` and include the token inference confidence summary.

## Error Recovery

### Retry Protocol

For transient failures (rate limits, timeouts, MCP disconnects), apply exponential backoff from `pipeline.config.json > canva.retry`:

```
FOR attempt IN 1..maxAttempts:
  TRY operation
  ON SUCCESS: continue pipeline
  ON FAILURE:
    IF error type IN retryableErrors:
      delay = min(initialDelayMs * backoffMultiplier^(attempt-1), maxDelayMs)
      WAIT delay
      LOG: "Retry {attempt}/{maxAttempts} after {delay}ms — {error type}"
      CONTINUE
    ELSE:
      FALL THROUGH to manual recovery below
AFTER maxAttempts exhausted:
  LOG: "All {maxAttempts} retries failed for {operation}"
  FALL THROUGH to manual recovery
```

### Canva MCP Failures
- **Rate limited:** Automatic retry with exponential backoff (see protocol above). If all retries fail, pause 60 seconds and retry once more. If still failing, ask user to wait and retry later.
- **MCP connection lost:** Retry connection 3 times. If it fails, ask user to restart Canva AI Connector and re-run the current phase.
- **Export timeout:** Retry with backoff. On persistent failure, reduce export scale to 1x and retry. If still failing, ask user to manually export.

### Content Failures
- **Export fails:** Ask user to manually export design pages as PNG from Canva and provide file paths.
- **Token inference low confidence:** Present all tokens with detailed confidence breakdown. Offer to accept user-provided brand guidelines as override.
- **Complex nested groups fail to parse:** Flatten aggressively (see canva-react-converter § 3a), log skipped layers, continue.

### Environment Failures
- **Dev server won't start:** Check for port conflicts, missing dependencies. Run `pnpm install` if needed.
- **Tests won't pass after 3 attempts:** Mark component as needing manual intervention, continue with remaining.
- **Build fails:** Check TypeScript errors first, then dependency issues. Report blockers.
- **Session interrupted:** On resume, check TodoWrite progress. Skip completed phases, resume from first incomplete.

## Completion

When all phases complete, present:

1. The build report summary
2. Count of pages/components built and verified
3. Token inference accuracy (how many tokens were confirmed vs corrected)
4. Any items needing manual review
5. Next steps (e.g., "run `pnpm dev` to see the app")
