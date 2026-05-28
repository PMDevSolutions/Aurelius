# Scripts Reference

**Last Updated:** 2026-03-30

All scripts live in `scripts/` and are designed to run from the project root.

## Code Quality

### Lint & Format (`lint-and-format.sh`)
- **Purpose**: Run ESLint + Prettier across the project
- **Usage**: `./scripts/lint-and-format.sh` or `./scripts/lint-and-format.sh --check` (CI mode)

### Type Check (`check-types.sh`)
- **Purpose**: TypeScript type checking (tsc --noEmit)
- **Usage**: `./scripts/check-types.sh`

### Bundle Size (`check-bundle-size.sh`)
- **Purpose**: Analyze bundle size, warn on large chunks
- **Usage**: `./scripts/check-bundle-size.sh`
- **Config**: Set `BUNDLE_SIZE_LIMIT` env var (default: 250KB)

### Accessibility (`check-accessibility.sh`)
- **Purpose**: Run eslint-plugin-jsx-a11y checks
- **Usage**: `./scripts/check-accessibility.sh`

## Testing

### Run Tests (`run-tests.sh`)
- **Purpose**: Run Vitest with coverage report
- **Usage**: `./scripts/run-tests.sh` or `./scripts/run-tests.sh --watch`

### Cross-Browser Testing (`cross-browser-test.sh`)
- **Purpose**: Capture screenshots across browsers at standard breakpoints
- **Usage**: `./scripts/cross-browser-test.sh <browser> <url>`
- **Browsers**: chromium, firefox, webkit
- **Output**: Screenshots saved to `.claude/visual-qa/screenshots/<browser>/`

### Setup Playwright (`setup-playwright.sh`)
- **Purpose**: One-time setup for Playwright browser engines
- **Usage**: `./scripts/setup-playwright.sh`

## Pipeline Verification

### Verify Design Tokens (`verify-tokens.sh`)
- **Purpose**: Ensure no hardcoded color, font-size, or spacing values in components; all values must come from design tokens via Tailwind classes
- **Usage**: `./scripts/verify-tokens.sh`
- **Exit code**: 1 if hardcoded values found

### Verify Test Coverage (`verify-test-coverage.sh`)
- **Purpose**: Ensure every `.tsx` component has a corresponding `.test.tsx` file. Also checks that tests import their component, assert lockfile text content, use role-based queries, and contain describe/it blocks.
- **Usage**: `./scripts/verify-test-coverage.sh`
- **Checks**:
  1. Every component has a test file
  2. Test files import their component
  3. Tests assert text content from the design token lockfile
  4. RTL query quality (getByRole vs getByTestId ratio)
  5. Test files contain describe/it blocks
- **Exit code**: 1 if any violations found
- **Note**: Requires `python3` for lockfile JSON parsing

### Visual Diff (`visual-diff.js`)
- **Purpose**: Pixel-level screenshot comparison using `pixelmatch`. Produces diff images with magenta highlights and region-based analysis.
- **Dependencies**: `pixelmatch`, `pngjs` (install in your project: `pnpm add -D pixelmatch pngjs`)
- **Single comparison**:
  ```bash
  node scripts/visual-diff.js actual.png expected.png --threshold 0.02 --json
  ```
- **Batch comparison** (compares matching filenames across two directories):
  ```bash
  node scripts/visual-diff.js --batch actual-dir/ expected-dir/ --output-dir diffs/ --json
  ```
- **Options**:
  - `--threshold <n>` -- Mismatch percentage to consider a pass (default: 0.02 = 2%)
  - `--output <path>` -- Save diff image (single mode)
  - `--output-dir <path>` -- Save diff images (batch mode)
  - `--json` -- Output results as JSON
  - `--region-grid <n>` -- Grid size for region analysis (default: 4, meaning 4x4)
  - `--antialiasing` -- Enable anti-aliasing detection
- **Exit codes**: 0 = pass, 1 = fail (above threshold), 2 = error
- **Config**: Reads defaults from `.claude/pipeline.config.json`

## Build Performance & Caching

### Incremental Build (`incremental-build.sh`)
- **Purpose**: Run pipeline phases with intelligent caching and profiling
- **Usage**:
  ```bash
  ./scripts/incremental-build.sh              # Run all quality checks
  ./scripts/incremental-build.sh lint         # Run specific phase
  ./scripts/incremental-build.sh quality      # Run full quality gate
  ./scripts/incremental-build.sh --force      # Ignore cache, force rebuild
  ./scripts/incremental-build.sh --parallel   # Run independent phases in parallel
  ./scripts/incremental-build.sh --no-cache   # Disable caching
  ```
- **Phases**: lint, types, tests, build, bundle, a11y, tokens, quality, all
- **Features**: Hash-based caching, automatic phase skipping, stage profiling

### Pipeline Cache (`pipeline-cache.js`)
- **Purpose**: Content-addressable caching for pipeline phases using SHA-256 hashing
- **Usage**:
  ```bash
  node scripts/pipeline-cache.js status               # Show cache status
  node scripts/pipeline-cache.js check <phase>        # Check if phase cache is valid
  node scripts/pipeline-cache.js hash <file|dir>      # Hash a file or directory
  node scripts/pipeline-cache.js invalidate <phase>   # Invalidate a phase cache
  node scripts/pipeline-cache.js invalidate all       # Invalidate all caches
  node scripts/pipeline-cache.js clean --max-age 7    # Clean old entries
  ```
- **Features**: Phase-level cache, file hash tracking, cache metrics

### Stage Profiler (`stage-profiler.js`)
- **Purpose**: Track timing and performance metrics for each pipeline stage
- **Usage**:
  ```bash
  node scripts/stage-profiler.js start <stage>        # Start timing a stage
  node scripts/stage-profiler.js end <stage>          # End timing a stage
  node scripts/stage-profiler.js complete             # Archive current run
  node scripts/stage-profiler.js report               # Generate performance report
  node scripts/stage-profiler.js report --format md   # Markdown report
  node scripts/stage-profiler.js history --last 10    # Show recent runs
  node scripts/stage-profiler.js analyze              # Analyze performance trends
  node scripts/stage-profiler.js status               # Show current run status
  ```
- **Features**: Sub-second timing, memory tracking, slow stage detection, trend analysis

### Metrics Dashboard (`metrics-dashboard.js`)
- **Purpose**: Generate visual build performance dashboards
- **Usage**:
  ```bash
  node scripts/metrics-dashboard.js generate          # Generate HTML dashboard
  node scripts/metrics-dashboard.js generate --format md  # Markdown dashboard
  node scripts/metrics-dashboard.js summary           # Show performance summary
  node scripts/metrics-dashboard.js trends            # Show 7-day trends
  node scripts/metrics-dashboard.js trends --period 30d   # 30-day trends
  node scripts/metrics-dashboard.js compare <id1> <id2>   # Compare two runs
  ```
- **Output**: HTML/Markdown dashboards in `.claude/visual-qa/dashboard/`
- **Features**: Cache efficiency tracking, stage breakdown, historical trends

## Project Setup

### Setup Project (`setup-project.sh`)
- **Purpose**: Initialize a new React project with standard tooling from `templates/`
- **Usage**: `./scripts/setup-project.sh my-app --next` or `--vite`
- **What it does**: Copies template configs, installs dependencies, sets up testing

## Agent Plugin System

Tooling to author, validate, install, and test custom Claude Code agents as
versioned plugins. Full guide: [`docs/guides/agent-plugins.md`](../docs/guides/agent-plugins.md).
All four CLIs share `agent-plugin-lib.js` and use `--json` + exit codes `0/1/2`.

### Create Agent Plugin (`create-agent-plugin.js`)
- **Purpose**: Scaffold a new plugin (manifest, agent.md skeleton, default tests, optional hook stubs)
- **Usage**: `node scripts/create-agent-plugin.js <name> [--description "..."] [--model opus|sonnet|haiku] [--tools "Read,Write"] [--with-hooks] [--force] [--json]`

### Validate Agent Plugin (`validate-agent-plugin.js`)
- **Purpose**: Validate a manifest against the JSON Schema + structural checks (name consistency, agent file, hooks/skills/tools existence, dependency resolution)
- **Usage**: `node scripts/validate-agent-plugin.js --dir <plugin-dir> [--json]` or `--all [--plugins-root <dir>]`

### Agent Registry (`agent-registry.js`)
- **Purpose**: List / resolve / install / uninstall plugins with transitive dependency resolution and management-lifecycle hooks
- **Usage**: `node scripts/agent-registry.js (list | resolve <name> | install <name> | uninstall <name> [--force]) [--json]`

### Test Agent Plugin (`test-agent-plugin.js`)
- **Purpose**: Run a plugin's static, deterministic assertions (no Claude invocation); unknown assertions fail loudly
- **Usage**: `node scripts/test-agent-plugin.js --dir <plugin-dir> [--json]` or `--all [--plugins-root <dir>]`

## Agent-Specific Scripts

Each agent has supporting scripts in `scripts/<agent-name>/`:

| Agent | Scripts | Purpose |
|-------|---------|---------|
| frontend-developer | lint-and-format.sh, check-build.sh, build-report.sh | Code quality and build validation |
| performance-benchmarker | check-tools.sh, save-benchmarks.sh, compare-results.sh | Performance profiling |
| test-writer-fixer | validate-test-command.sh, save-coverage.sh, commit-coverage.sh | Test execution and coverage |
| api-tester | check-endpoints.sh, save-results.sh, generate-summary.sh | API testing |
| docusaurus-expert | validate-markdown.sh, check-build.sh, preview-link.sh | Documentation |
| analytics-reporter | check-data-sources.sh, format-report.sh, archive-report.sh | Analytics |
| test-results-analyzer | create-run-dir.sh, validate-report.sh, archive-and-trend.sh | Test analysis |
