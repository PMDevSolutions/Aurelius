# Error Recovery Guide

Pipeline phases can fail for many reasons: network timeouts, missing dependencies, configuration drift, or simple typos. This guide explains how to diagnose failures, recover from them, and resume without starting over.

## How the Pipeline Tracks Progress

The pipeline uses TodoWrite tasks to track each phase. As phases complete they are marked done. Failed phases remain in-progress or pending. When you re-run the pipeline command, completed phases are checked against the cache. If their inputs have not changed the phase is skipped (cache hit). This means re-running the pipeline is always safe and efficient — you will never redo work that already succeeded.

Check current cache state at any time:

```bash
node scripts/pipeline-cache.js status
```

## Phase Failure Modes

Every phase has characteristic failure patterns. The table below lists the most common ones and how to fix them.

| Phase | Common Failures | How to Fix |
|-------|----------------|------------|
| 0: Token Sync | No lockfile (non-fatal, skipped), drift detected | Run `./scripts/sync-tokens.sh --update` or fix Tailwind config |
| 1: Intake | Figma MCP connection failed, invalid URL, Canva API timeout | Check MCP server is running, verify URL format |
| 2: Token Lock | Empty design (no extractable tokens), extraction timeout | Verify design has visible content, retry |
| 3: TDD Gate | Test generation fails, no components in build-spec | Check `build-spec.json` has a `components` array |
| 4: Build | Component compile errors, test failures (red phase still active) | Fix TypeScript errors, ensure tests from Phase 3 can pass |
| 4.5: Storybook | Story generation fails, missing component exports | Check component exports, run `./scripts/generate-stories.sh` manually |
| 5: Visual Diff | Screenshot capture fails, diff threshold exceeded after 5 iterations | Check dev server is running at expected port, lower threshold or fix components |
| 5.5: Dark Mode | Dark theme not configured, screenshot fails | Non-blocking — add dark mode support or skip |
| 6: E2E Tests | Browser not installed, test timeout, element not found | Run `./scripts/setup-playwright.sh`, increase timeout in `pipeline.config.json` |
| 7: Cross-Browser | Firefox/WebKit not installed | Run `./scripts/setup-playwright.sh` to install all browsers |
| 7.5: Regression | No baselines captured yet | Run `./scripts/capture-baselines.sh` first, then `./scripts/regression-test.sh` |
| 8: Quality Gate | Coverage below 80%, TypeScript errors, Lighthouse below thresholds | Write more tests, fix type errors, optimize performance |
| 8.5: Responsive | Dev server not running, screenshot timeout | Start dev server first, check ports |
| 9: Report | No failures — generates from available data | N/A |

## Resuming a Failed Pipeline

Re-run the same pipeline command you used originally:

```bash
# Figma pipeline
/build-from-figma <URL>

# Canva pipeline
/build-from-canva <URL>

# Screenshot/URL pipeline
/build-from-screenshot <URL or paths>
```

The caching system ensures completed phases are not repeated. Only the failed phase and subsequent phases run. Before re-running, check which phases already have valid cache:

```bash
node scripts/pipeline-cache.js status
```

The output shows each phase name, its cache status (valid/invalid/missing), and when it last ran.

## Forcing a Phase Re-Run

If you need to re-run a specific phase even though its cache is valid, invalidate its cache entry:

```bash
node scripts/pipeline-cache.js invalidate <phase-name>
```

Available phase names:

| Phase Name | Pipeline Phase |
|------------|---------------|
| `token-sync` | 0: Token Sync |
| `intake` | 1: Intake |
| `token-lock` | 2: Token Lock |
| `tdd-scaffold` | 3: TDD Gate |
| `component-build` | 4: Build |
| `storybook` | 4.5: Storybook |
| `visual-diff` | 5: Visual Diff |
| `dark-mode` | 5.5: Dark Mode |
| `e2e-tests` | 6: E2E Tests |
| `cross-browser` | 7: Cross-Browser |
| `quality-gate` | 8: Quality Gate |
| `responsive` | 8.5: Responsive |
| `report` | 9: Report |

After invalidation, re-run the pipeline command. Only the invalidated phase (and anything that depends on it) will re-execute.

## Manual Phase Execution

When debugging a failure, run individual scripts directly to get detailed output:

```bash
# Token validation
./scripts/verify-tokens.sh

# Token sync (dry run shows drift without updating)
./scripts/sync-tokens.sh --dry-run

# Visual diff between two screenshots
node scripts/visual-diff.js <actual.png> <expected.png>

# TypeScript type checking
./scripts/check-types.sh

# Tests with coverage
./scripts/run-tests.sh

# Accessibility audit
./scripts/check-accessibility.sh

# Bundle size check
./scripts/check-bundle-size.sh

# Security audit
./scripts/check-security.sh
```

Running a script manually does not affect pipeline cache state. You can experiment freely without invalidating anything.

## Common Recovery Patterns

### Visual diff stuck in iteration loop

After 5 iterations and still failing, determine whether the difference is real or sub-pixel noise:

```bash
node scripts/visual-diff.js actual.png expected.png --json
```

Check the `subPixelPercentage` field in the JSON output. If more than 50% of the diff is sub-pixel, the components are visually correct and you should raise the threshold in `pipeline.config.json` under `visualDiff.threshold`. If the differences are real, fix the component styling and re-run.

### E2E tests timeout

Ensure the dev server is running at the expected port before the pipeline launches E2E tests. Check timeout and retry settings in `pipeline.config.json`:

```json
{
  "e2e": {
    "timeout": 30000,
    "retries": 2
  }
}
```

Increase `timeout` for slow environments. Increase `retries` if failures are intermittent.

### Quality gate coverage too low

Run tests with coverage to see exactly which files are under-covered:

```bash
pnpm vitest run --coverage
```

The coverage threshold is set in `pipeline.config.json` under `tdd.coverageThreshold` (default 80%). Write tests for uncovered files, then re-run the pipeline.

### Figma MCP not connecting

1. Verify Figma Desktop is running.
2. Check that the MCP server is configured on port 3845.
3. If local MCP is unavailable, the pipeline falls back to the remote Figma MCP automatically.

### Build fails with TypeScript errors

Run the type checker independently to see all errors at once:

```bash
./scripts/check-types.sh
```

Fix every reported error before re-running the pipeline. The Build phase (4) will not succeed while TypeScript errors remain.

## Parallel Phase Failures

Phases 4 through 9 run concurrently via the parallel orchestration system. A failure in one phase does not block independent phases. For example, if E2E tests fail but Visual Diff succeeds, the Visual Diff result is cached normally.

After the batch completes, the summary shows the status of every phase:

- **Succeeded** — cached, will not re-run.
- **Failed** — will re-run on next pipeline invocation.
- **Skipped** — blocked by a failed dependency, will run once the dependency passes.

Fix the failed phase and re-run the pipeline. All successful phases are served from cache.

## When to Start Fresh

In most cases, resuming is the right approach. However, some situations call for a full rebuild:

```bash
./scripts/incremental-build.sh --force
```

Start fresh after:

- **Major config changes** — significant edits to `tsconfig.json`, `tailwind.config.*`, or `pipeline.config.json`.
- **Git rebase with conflicts** — resolved merge conflicts may leave the cache out of sync with the actual file contents.
- **Suspected corrupted cache** — if phases behave unexpectedly despite matching inputs.
- **Switching output targets** — changing `outputTarget` in `build-spec.json` (e.g., from `react` to `vue`) invalidates the entire build.

The `--force` flag ignores all cached results and rebuilds every phase from scratch.
