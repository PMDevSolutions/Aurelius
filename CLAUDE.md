# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code-integrated multi-framework app development framework** providing specialized agents, skills, scripts, and design-to-code conversion pipelines. Supports React, Vue 3, Svelte/SvelteKit, and React Native (Expo) output targets.

The framework is designed for:
- Multi-framework app development (React/Next.js/Vite/Remix, Vue 3, SvelteKit, React Native/Expo)
- Figma-to-code, Canva-to-code, and Screenshot/URL-to-code conversion with Tailwind CSS
- Comprehensive testing (Vitest, React Testing Library, Playwright, Storybook)
- Full product lifecycle support (engineering, design, testing, marketing, operations)

## Project Structure

```
project-root/
├── .claude/              # Claude Code configuration
│   ├── agents/           # 53 specialized agents
│   ├── skills/           # 20 React-specific skills
│   ├── commands/         # Custom slash commands
│   ├── hooks/            # Hook scripts (automated hooks configured in settings.json)
│   └── pipeline.config.json  # Pipeline thresholds, iteration limits, app types
├── scripts/              # Development automation scripts
├── templates/            # Starter configs (ESLint, Tailwind, Vitest, Chrome ext, PWA, etc.)
├── docs/                 # Documentation
│   ├── figma-to-react/   # Figma conversion pipeline docs
│   ├── canva-to-react/   # Canva conversion pipeline docs
│   ├── screenshot-to-app/ # Screenshot/URL conversion pipeline docs
│   ├── multi-framework/  # Multi-framework output target docs
│   └── react-development/# React development standards
└── CLAUDE.md             # This file
```

## Development Scripts

```bash
# Lint and format code
./scripts/lint-and-format.sh

# Run tests with coverage
./scripts/run-tests.sh

# Run mutation tests (Stryker)
./scripts/run-mutation-tests.sh                    # Run with default threshold
./scripts/run-mutation-tests.sh --threshold 80     # Override threshold
./scripts/run-mutation-tests.sh --json             # JSON output

# TypeScript type checking
./scripts/check-types.sh

# Bundle size analysis
./scripts/check-bundle-size.sh

# Accessibility linting
./scripts/check-accessibility.sh

# Verify design token usage (no hardcoded values)
./scripts/verify-tokens.sh

# Verify every component has a test file
./scripts/verify-test-coverage.sh

# Pixel-level visual diff with sub-pixel, typography, and layout analysis
node scripts/visual-diff.js <actual.png> <expected.png> [--threshold 0.02] [--json]
node scripts/visual-diff.js --batch <actual-dir> <expected-dir> [--output-dir diffs/]

# Initialize a new React project
./scripts/setup-project.sh my-app --next  # or --vite

# Cross-browser testing (Playwright)
./scripts/cross-browser-test.sh chromium http://localhost:3000
./scripts/cross-browser-test.sh firefox http://localhost:3000
./scripts/cross-browser-test.sh webkit http://localhost:3000

# Setup Playwright browsers (one-time)
./scripts/setup-playwright.sh

# Dark mode visual verification
./scripts/check-dark-mode.sh http://localhost:3000

# Storybook story + MDX generation (AST-based)
./scripts/generate-stories.sh                      # Generate stories + MDX for all components
./scripts/generate-stories.sh --force              # Overwrite existing stories
./scripts/generate-stories.sh --dry-run            # Report without writing
./scripts/generate-stories.sh --no-mdx             # Skip MDX documentation
./scripts/generate-stories.sh --json               # JSON output

# Token drift detection
./scripts/sync-tokens.sh [--dry-run] [--json]

# Component documentation generation
./scripts/generate-component-docs.sh

# Dead code detection (unused exports, files, dependencies)
./scripts/check-dead-code.sh [--json]

# Security audit (dependency vulnerabilities + anti-patterns)
./scripts/check-security.sh [--json] [--level critical] [--no-fail]

# Generate typed API client from OpenAPI spec
./scripts/generate-api-client.sh --spec <path-or-url> [--output dir] [--client]

# Responsive screenshots at all breakpoints
./scripts/check-responsive.sh [url] [output-dir]

# Cross-browser CSS audit
./scripts/audit-cross-browser-css.sh [--json]

# Capture baseline screenshots for visual regression
./scripts/capture-baselines.sh [url] [--routes /,/about]

# Run visual regression tests against baselines
./scripts/regression-test.sh [url] [--update-baselines] [--json]

# Validate pipeline.config.json against its JSON Schema
./scripts/validate-pipeline-config.sh                # Validate live config
./scripts/validate-pipeline-config.sh --json         # Machine-readable output
node scripts/validate-pipeline-config.js --config <path> --schema <path>

# Export generated components as a publishable design-system workspace
./scripts/export-design-system.sh [--scope @org] [--output dir] [--framework <react|vue|svelte|react-native>] [--dry-run] [--json]

# Author / validate / install / test custom agents as versioned plugins
node scripts/create-agent-plugin.js <name> [--description ...] [--model ...] [--tools ...] [--with-hooks]
node scripts/validate-agent-plugin.js --dir <plugin-dir>   # or --all [--plugins-root <dir>]
node scripts/agent-registry.js (list | resolve <name> | install <name> | uninstall <name>)
node scripts/test-agent-plugin.js --dir <plugin-dir>       # or --all [--plugins-root <dir>]

# Incremental build with caching and profiling
./scripts/incremental-build.sh [phase|all] [--force] [--parallel]

# Pipeline cache management
node scripts/pipeline-cache.js status               # Show cache status
node scripts/pipeline-cache.js check <phase>        # Check cache validity
node scripts/pipeline-cache.js invalidate <phase>   # Invalidate cache

# Stage profiling and performance analysis
node scripts/stage-profiler.js report               # Generate performance report
node scripts/stage-profiler.js analyze              # Analyze slow stages
node scripts/stage-profiler.js history              # View build history

# Build performance dashboard
node scripts/metrics-dashboard.js generate          # Generate HTML dashboard
node scripts/metrics-dashboard.js summary           # Show metrics summary
node scripts/metrics-dashboard.js trends            # Show performance trends
```

## Development Commands

### Package Management (always use pnpm)
```bash
pnpm install              # Install dependencies
pnpm add <package>        # Add a dependency
pnpm add -D <package>     # Add a dev dependency
pnpm update               # Update dependencies
```

### Development Server
```bash
# Next.js
pnpm dev                  # Start dev server (port 3000)
pnpm build                # Production build
pnpm start                # Start production server

# Vite
pnpm dev                  # Start dev server (port 5173)
pnpm build                # Production build
pnpm preview              # Preview production build
```

### Testing
```bash
pnpm vitest               # Run tests in watch mode
pnpm vitest run           # Run tests once
pnpm vitest run --coverage # Run with coverage report
pnpm storybook            # Start Storybook dev server
pnpm build-storybook      # Build Storybook static site
```

### Code Quality
```bash
pnpm eslint .             # Run ESLint
pnpm eslint . --fix       # Auto-fix ESLint issues
pnpm prettier --check .   # Check formatting
pnpm prettier --write .   # Fix formatting
pnpm tsc --noEmit         # Type check without emitting
```

---

## Claude Code Architecture & Configuration

### Installed Plugins (5 Total)

- **episodic-memory** - Conversation search and memory
- **commit-commands** - Git workflow automation
- **superpowers** - Advanced development workflows
- **ai-taskmaster** - Task management (local)

**Note:** GitHub integration via `gh` CLI

**Full documentation:** `.claude/PLUGINS-REFERENCE.md`

---

### Custom Agents (53 Total)

53 specialized agents covering the full product lifecycle:

| Category | Count | Key Agents |
|----------|-------|------------|
| Engineering | 12 | frontend-developer, backend-architect, rapid-prototyper, test-writer-fixer, error-boundary-architect, migration-specialist, i18n-engineer, animation-optimizer, bundle-analyzer |
| Design | 5 | ui-designer, ux-researcher, brand-guardian |
| Design-to-Code | 6 | figma-react-converter, canva-react-converter, asset-cataloger, vue-converter, svelte-converter, react-native-converter |
| Testing & QA | 7 | visual-qa-agent, accessibility-auditor, api-tester, performance-benchmarker |
| Product | 3 | sprint-prioritizer, feedback-synthesizer, trend-researcher |
| Marketing | 7 | content-creator, growth-hacker, app-store-optimizer |
| Project Management | 3 | studio-producer, project-shipper, experiment-tracker |
| Operations | 5 | analytics-reporter, infrastructure-maintainer, legal-compliance-checker |
| Documentation | 1 | docusaurus-expert |
| Meta | 2 | agent-expert, command-expert |
| Bonus | 2 | joker, studio-coach |

Agents are invoked automatically based on task context.

**Full catalog:** `.claude/CUSTOM-AGENTS-GUIDE.md`

---

### Skills (20 Total)

| Skill | Purpose | Triggers |
|-------|---------|----------|
| figma-to-react-workflow | Figma-to-React pipeline (v3: enforced TDD, pixel-diff, E2E) | "convert Figma", "Figma to React" |
| figma-intake | Structured interview → build-spec.json (with appType) | Phase 1 of /build-from-figma |
| design-token-lock | Extract + lock Figma values → lockfile | Phase 2 of /build-from-figma |
| tdd-from-figma | Write tests FIRST, app-type-aware (Chrome ext, PWA) | Phase 3 of /build-from-figma |
| e2e-test-generator | Generate Playwright E2E from build-spec (new) | Phase 6 of /build-from-figma |
| react-component-development | Component patterns and best practices | "create component", "custom hook" |
| react-testing-workflows | Vitest, RTL, Playwright, Storybook | "write tests", "test coverage" |
| react-performance-optimization | Profiling, bundle analysis, Web Vitals | "performance", "bundle size" |
| react-accessibility | WCAG patterns for React | "accessibility", "a11y", "ARIA" |
| visual-qa-verification | Automated pixel-diff visual QA (v3: pixelmatch loop) | "verify", "visual QA", "compare to Figma" |
| canva-intake | Canva design discovery → build-spec.json (with appType) | Phase 1 of /build-from-canva |
| canva-token-inference | AI-powered token extraction from Canva/screenshot sources | Phase 2 of /build-from-canva and /build-from-screenshot |
| screenshot-intake | URL/screenshot discovery → build-spec.json (with outputTarget) | "build from screenshot", "clone this site" |
| state-management | State architecture: Zustand, TanStack Query, URL state | "state management", "zustand", "data fetching" |
| form-handling | React Hook Form + Zod: typed forms, field arrays, wizards | "form", "validation", "react hook form" |
| auth-flows | Auth.js, Clerk, Supabase Auth, RBAC, protected routes | "auth", "login", "session", "OAuth" |
| animation-motion | Framer Motion, CSS transitions, reduced-motion a11y | "animation", "framer motion", "transition" |
| seo-metadata | Next.js Metadata API, JSON-LD, OG images, sitemaps | "SEO", "metadata", "open graph" |
| parallel-orchestration | Concurrent phase runner for pipeline parallelization | Invoked by pipeline commands after Phase 3 |
| export-design-system | Exports components + tokens as a publishable pnpm workspace (Vite lib mode for web, tsc for RN) | Invoked by `/export-design-system` |

**Full catalog:** `.claude/skills/README.md`

---

### Figma-to-React Pipeline

**Single command:** `/build-from-figma <Figma URL>`

Autonomous 9-phase pipeline that converts a Figma design into a working, tested React app:

```
/build-from-figma https://figma.com/file/abc123

  [0] TOKEN SYNC    → sync-tokens.sh → drift check (conditional, if lockfile exists)
  [1] INTAKE        → figma-intake skill → build-spec.json (with appType)
  [2] TOKEN LOCK    → design-token-lock skill → design-tokens.lock.json
  [3] TDD (HARD GATE) → tdd-from-figma skill → failing tests (Red)
  ─── PARALLEL ORCHESTRATION (phases 4-9, max 3 concurrent) ───
  [4] BUILD         → figma-to-react-workflow → components pass tests (Green)
      ├─ [4.5] STORYBOOK   → generate-stories.sh (non-blocking)
      ├─ [5]   VISUAL DIFF  → pixelmatch loop → max 5 iterations
      │   └─ [6] E2E TESTS  → e2e-test-generator skill
      ├─ [5.5] DARK MODE   → check-dark-mode.sh (non-blocking)
      ├─ [7]   CROSS-BROWSER → Firefox/WebKit screenshots (non-blocking)
      ├─ [7.5] REGRESSION  → regression-test.sh (non-blocking)
      ├─ [8]   QUALITY GATE → [coverage|types|build|tokens|lighthouse] in parallel
      └─ [8.5] RESPONSIVE  → check-responsive.sh (non-blocking)
  [9] REPORT        → build-report.md (after quality-gate + e2e complete)
```

**Key artifacts:**
- `design-tokens.lock.json` — Single source of truth for all design values
- `build-spec.json` — Machine-readable build plan with appType, outputTarget (`"react" | "vue" | "svelte" | "react-native"`), and E2E flows
- `pipeline.config.json` — Thresholds, iteration limits, app-type definitions
- `verify-tokens.sh` — Catches hardcoded values and token drift
- `verify-test-coverage.sh` — Ensures every component has tests
- `visual-diff.js` — Pixel-level screenshot comparison with region analysis
- `sync-tokens.sh` — Detects token drift between lockfile and source
- `check-dark-mode.sh` — Dark mode screenshot capture and visual comparison
- `generate-stories.sh` — AST-based Storybook story + MDX generation with prop controls, variants, and action args
- `generate-component-docs.sh` — Generates MDX component documentation

**Features:**
- **Enforced TDD** — tests must exist before components, hard gate blocks build phase
- **Pixel-perfect visual diff** — `pixelmatch`-based comparison (not manual), up to 5 iterations
- **App-type awareness** — Chrome extensions, PWAs, React Native, and web apps get tailored E2E strategies
- **Chrome extension E2E** — Playwright persistent context with `--load-extension`
- Design token extraction with lockfile enforcement
- Cross-browser verification (Firefox, WebKit) with configurable thresholds
- Quality gate: 80%+ coverage, TypeScript, Lighthouse audit
- Resumable: TodoWrite tracks progress across interrupted sessions
- **Dark mode verification** — automated dark theme screenshot comparison (non-blocking)
- **Storybook generation** — auto-generated stories with responsive viewports
- **Token sync** — detects drift between Figma lockfile and source code
- **Component docs** — auto-generated MDX documentation with props, tokens, and links
- **Automated hooks** — pre-commit token guard, coverage warnings, dark mode reminders, Lighthouse CI, bundle size guard, mutation testing
- **Responsive verification** — automated screenshots at 5 breakpoints (320-1920px)
- **Error monitoring** — Sentry integration configured via pipeline.config.json
- **Deploy previews** — Vercel auto-deploy with visual QA on PRs
- **Parallel orchestration** — concurrent phase execution with dependency graph, resource tagging, and configurable concurrency pool

**Documentation:** `docs/figma-to-react/README.md`

---

### Canva-to-React Pipeline

**Single command:** `/build-from-canva <Canva URL>`

Same 12-phase pipeline as Figma with Canva-specific phases 1, 2, and 4:

- **Phase 1:** canva-intake (vision-based discovery via Canva AI Connector MCP)
- **Phase 2:** canva-token-inference (AI extraction with confidence scoring + user confirmation)
- **Phase 4:** canva-react-converter agent (builds components from screenshots)
- **Phases 3, 5-9:** shared (identical to Figma pipeline)

**Documentation:** `docs/canva-to-react/README.md`

---

### Screenshot/URL-to-App Pipeline

**Single command:** `/build-from-screenshot <URL or image paths>`

Same 12-phase pipeline as Figma/Canva with screenshot-specific Phase 1:

- **Phase 1:** screenshot-intake (captures URL or reads provided images, vision-based discovery)
- **Phase 2:** canva-token-inference (shared, accepts screenshot source)
- **Phase 4:** framework-specific converter agent dispatched by `outputTarget` (vue-converter, svelte-converter, react-native-converter, or figma-react-converter)
- **Phases 3, 5-9:** shared (identical to Figma/Canva pipeline)

Supports all output targets: React, Vue 3, Svelte/SvelteKit, React Native (Expo).

**Documentation:** `docs/screenshot-to-app/README.md`

---

### Multi-Framework Output

The `outputTarget` field in `build-spec.json` controls which framework the pipeline generates code for:

| Target | Value | Converter Agent | Test Library | Template |
|--------|-------|----------------|-------------|----------|
| React | `"react"` | figma-react-converter / canva-react-converter | Vitest + RTL | `templates/nextjs/` or `templates/vite/` |
| Vue 3 | `"vue"` | vue-converter | Vitest + @vue/test-utils | `templates/vue/` |
| Svelte | `"svelte"` | svelte-converter | Vitest + @testing-library/svelte | `templates/sveltekit/` |
| React Native | `"react-native"` | react-native-converter | Jest + @testing-library/react-native | `templates/expo/` |

Framework auto-detection: if `outputTarget` is not specified, the pipeline detects the framework from `package.json` dependencies and config files (e.g., `next.config.*`, `svelte.config.*`, `app.json`).

**Documentation:** `docs/multi-framework/README.md`

---

### MCP Server Integration

- **Figma Desktop MCP** - Local Figma integration (port 3845)
- **Figma Remote MCP** - Fallback remote access
- **Playwright MCP** - Cross-browser testing (Chromium, Firefox, WebKit)
- **Chrome DevTools MCP** - Screenshots, Lighthouse audits, DOM inspection
- **Canva AI Connector** - Search, export, and interact with Canva designs
- **Sentry** - Error monitoring (configured via pipeline.config.json, setup by error-boundary-architect agent)

---

### Parallel Orchestration

Pipeline phases 4-9 run concurrently via the `parallel-orchestration` skill:
- **Dependency graph** defined in `pipeline.config.json` → `orchestration.phases`
- **Concurrency pool** with configurable `maxConcurrent` (default: 3)
- **Resource tagging** prevents write conflicts between phases
- **Streaming results** report each phase as it completes
- **Batch summary** with wall time, speedup factor, and execution timeline
- **Fallback** to sequential execution when `orchestration.enabled` is `false`

Quality gate subtasks (coverage, typecheck, build, token-verify, lighthouse) also run in parallel.

---

### Automated Hooks (8 Total)

Each hook is a standalone script under `.claude/hooks/`, registered in `.claude/settings.json` as a `PostToolUse` hook on the `Bash` matcher. Hooks receive `$TOOL_INPUT` and `$TOOL_OUTPUT` as positional args, follow a defensive skeleton (`set -u`, `trap 'exit 0' ERR`, always `exit 0`), and are testable in isolation. See [docs/guides/hooks.md](docs/guides/hooks.md) for the full guide.

| Script | Trigger | Action |
|--------|---------|--------|
| `post-build-qa.sh` | `pnpm build` succeeds | Reminds to run quality gate (vitest, tsc, verify-tokens) |
| `pre-commit-token-guard.sh` | `git commit` detected | Runs `verify-tokens.sh`, warns if violations found |
| `dark-mode-reminder.sh` | `visual-diff.js` passes | Suggests running `check-dark-mode.sh` |
| `coverage-check.sh` | `vitest` with coverage output | Reminds to check threshold from pipeline config |
| `lighthouse-ci.sh` | `pnpm build` succeeds | Suggests Lighthouse audit with threshold targets from config |
| `bundle-size-guard.sh` | `git commit` detected | Warns if build output exceeds maxSizeKb from config |
| `mutation-test-reminder.sh` | `vitest` all tests pass | Suggests running Stryker for test quality validation |
| `regression-reminder.sh` | `pnpm build` succeeds | Suggests running `./scripts/regression-test.sh` if baselines exist |

---

## React Development Standards

### TypeScript
- Strict mode enabled
- No `any` types - use proper interfaces and generics
- Export prop interfaces alongside components
- Use discriminated unions for complex prop patterns

### Component Patterns
- Functional components only (no class components)
- Custom hooks for reusable logic
- Composition over inheritance
- Props interface for every component
- `children` and `className` passthrough where appropriate

### Tailwind CSS
- Utility-first styling
- Design tokens via Tailwind config (not hardcoded values)
- Responsive with mobile-first breakpoints (sm, md, lg, xl, 2xl)
- Use `cn()` utility for conditional classes (clsx + tailwind-merge)

### Testing Strategy
- **Unit tests** (Vitest): Pure functions, custom hooks, utilities
- **Component tests** (RTL): User interactions, rendering, accessibility
- **Visual tests** (Storybook): Component states, responsive variants
- **E2E tests** (Playwright): Critical user flows, cross-browser

### Accessibility
- WCAG 2.1 AA minimum
- Semantic HTML (landmarks, headings hierarchy)
- ARIA attributes on interactive elements
- Keyboard navigation support
- Color contrast 4.5:1 minimum

### Code Quality
- ESLint with React, TypeScript, and jsx-a11y plugins
- Prettier for formatting
- 2-space indentation (JS/TS/CSS/JSON)

---

### Development Workflow with Claude Code

**1. Feature Development**
```bash
# Start feature branch
git checkout -b feature/hero-component

# Develop with Claude Code
# - frontend-developer agent for React work
# - test-writer-fixer agent for tests
# - ui-designer agent for design decisions

# Commit with structure
/commit
```

**2. Code Quality**
```bash
./scripts/lint-and-format.sh
./scripts/check-types.sh
./scripts/run-tests.sh
./scripts/check-accessibility.sh
```

**3. Figma-to-React Conversion**
```
User: "Convert this Figma design to React components"
      [Provide Figma URL]

Claude: [Uses figma-react-converter agent]
        → Extracts design tokens
        → Generates Tailwind config + React components
        → Runs visual QA verification
```

**4. Using Custom Agents**
```
User: "Help me optimize app performance"
Claude: [Uses performance-benchmarker agent]

User: "Build a hero component"
Claude: [Uses frontend-developer agent]

User: "Write tests for my auth hook"
Claude: [Uses test-writer-fixer agent]
```

---

### Quick Command Reference

**Design-to-Code Pipelines:**
```bash
/build-from-figma <URL>       # Full autonomous Figma pipeline
/build-from-canva <URL>       # Full autonomous Canva pipeline
/build-from-screenshot <URL or paths>  # Full autonomous screenshot pipeline
/export-design-system [flags] # Export components + tokens as publishable pnpm workspace
```

**Quality Verification:**
```bash
/verify-all                   # Run every local quality check, human-readable summary
/ci                           # Same checks, JSON output, non-zero exit on failure
```

**Git Workflows (via commit-commands):**
```bash
/commit                       # Structured commit
/commit-push-pr              # Commit + push + PR
/clean_gone                   # Clean merged branches
```

**GitHub CLI:**
```bash
gh pr create                  # Create pull request
gh pr list                    # List pull requests
gh issue create               # Create issue
```

**Code Quality:**
```bash
./scripts/lint-and-format.sh        # ESLint + Prettier
./scripts/run-tests.sh              # Vitest + coverage
./scripts/run-mutation-tests.sh     # Mutation testing (Stryker)
./scripts/check-types.sh            # TypeScript check
./scripts/check-bundle-size.sh      # Bundle analysis
./scripts/check-accessibility.sh    # a11y linting
./scripts/verify-tokens.sh          # Design token enforcement
./scripts/sync-tokens.sh              # Token drift detection
./scripts/check-dark-mode.sh          # Dark mode verification
./scripts/generate-stories.sh         # Storybook story + MDX generation
./scripts/generate-component-docs.sh  # Component documentation
./scripts/check-dead-code.sh            # Dead code detection (knip)
./scripts/check-security.sh             # Security audit
./scripts/generate-api-client.sh        # OpenAPI → typed client
./scripts/check-responsive.sh           # Responsive screenshots
./scripts/audit-cross-browser-css.sh   # Cross-browser CSS audit
./scripts/capture-baselines.sh          # Capture regression baselines
./scripts/regression-test.sh            # Visual regression testing
./scripts/export-design-system.sh       # Export components + tokens as pnpm workspace
./scripts/validate-pipeline-config.sh   # Validate pipeline.config.json against schema
./scripts/check-doc-counts.sh           # Flag drift between documented agent/skill counts and disk
./scripts/verify-all.sh                 # Run all quality checks with summary
./scripts/verify-all.sh --ci            # CI mode: JSON output, exit 1 on any failure
```

**Agent Plugins** (custom agents as versioned plugins — see `docs/guides/agent-plugins.md`):
```bash
node scripts/create-agent-plugin.js <name> [--description ...] [--model ...] [--tools ...] [--with-hooks]
node scripts/validate-agent-plugin.js --dir <plugin-dir>   # or --all
node scripts/agent-registry.js (list | resolve <name> | install <name> | uninstall <name>)
node scripts/test-agent-plugin.js --dir <plugin-dir>       # or --all
```

**Build Performance & Caching:**
```bash
./scripts/incremental-build.sh          # Incremental build with caching
./scripts/incremental-build.sh --parallel # Parallel execution
./scripts/incremental-build.sh --force  # Force rebuild (ignore cache)
node scripts/pipeline-cache.js status   # Cache status
node scripts/stage-profiler.js report   # Performance report
node scripts/stage-profiler.js analyze  # Slow stage analysis
node scripts/metrics-dashboard.js generate # HTML dashboard
node scripts/metrics-dashboard.js summary  # Quick metrics summary
```

---

**Last Updated:** 2026-05-28
**Architecture:** 53 agents, 20 skills, 4 plugins + gh CLI, Figma + Canva + Playwright MCP, 38 scripts, 8 hooks

> **Keeping counts in sync:** When adding or removing agents, skills, scripts, or hooks, update all count references across the project. Search for the old count number in `*.md` files to find all references: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/onboarding/`, `docs/react-development/`, and `.claude/AGENT-NAMING-GUIDE.md`. The agent and skill counts are enforced automatically by `scripts/check-doc-counts.sh` (run in CI and on pre-commit), which recounts `.claude/agents/` and `.claude/skills/` and fails on any documented count that disagrees.
