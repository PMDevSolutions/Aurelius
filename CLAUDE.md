# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code-integrated multi-framework app development framework** providing specialized agents, skills, scripts, and design-to-code conversion pipelines. Supports React, Vue 3, Svelte/SvelteKit, and React Native (Expo) output targets.

The framework is designed for:
- Multi-framework app development (React/Next.js/Vite/Remix, Vue 3, SvelteKit, React Native/Expo)
- Figma-to-code, Canva-to-code, Screenshot/URL-to-code, and Conversation-to-code (generated Figma designs) conversion with Tailwind CSS
- Comprehensive testing (Vitest, React Testing Library, Playwright, Storybook)
- Full product lifecycle support (engineering, design, testing, marketing, operations)

## Project Structure

```
project-root/
├── .claude/              # Claude Code configuration
│   ├── agents/           # 56 specialized agents
│   ├── skills/           # 32 skills: pipelines, quality checks, React patterns
│   ├── hooks/            # Hook scripts + lib/ (registered in settings.json, mirrored in hooks.json)
│   ├── rules/            # Path-scoped standards, loaded when matching files are touched
│   ├── workflows/        # component-lanes.js: Phases 4-5 as per-component lanes
│   ├── settings.json     # Hook registrations
│   └── pipeline.config.json  # Pipeline thresholds, iteration limits, app types
├── .claude-plugin/       # Packages this repo as the `aurelius` plugin (plugin.json, marketplace.json)
├── evals/                # claude plugin eval cases for the framework's hard rules
├── scripts/              # Development automation scripts (reference: scripts/README.md)
├── packages/             # TypeScript pipeline packages (pnpm workspace)
│   ├── pipeline/         # Design-to-code core: InDesign IDML parser + IR (@aurelius/pipeline)
│   └── gui/              # Desktop GUI (Electron + React, @aurelius/gui) — see docs/GUI.md
├── renderers/            # Pluggable framework renderer manifests (renderer.json + schema)
├── templates/            # Starter configs (ESLint, Tailwind, Vitest, Chrome ext, PWA, etc.)
├── docs/                 # Documentation (pipelines, multi-framework, guides, onboarding)
└── CLAUDE.md             # This file
```

## Rules That Always Hold

1. **Tests first, and the tests are the specification.** Phase 3 writes failing tests before any component exists. When a test fails, change the component, never the test; the `component-lanes` workflow checks every test file's checksum after each change.
2. **The token lockfile is the single source of truth.** Every color, size, space and string of design copy comes from `design-tokens.lock.json` through Tailwind tokens or CSS variables. The token guard denies a commit that adds a hardcoded value.
3. **Nothing ships without a human.** Production deploys, publishes, releases, PR merges, workflow dispatches and pushes to the default branch stop at the deploy guard for a human's decision, and are denied outright inside subagents.

Detailed standards load by path from `.claude/rules/`:

| Rule | Loads for | Covers |
|------|-----------|--------|
| `react-standards.md` | `src/`, `app/`, `templates/`, `*.tsx`, `*.jsx`, `*.vue`, `*.svelte` | TypeScript, components, Tailwind tokens, tests, accessibility, code quality |
| `pipeline-artifacts.md` | build spec, lockfile, `.claude/plans/`, pipeline config, visual baselines | Who writes each artifact, the thresholds, the state file |
| `scripts-and-hooks.md` | `scripts/`, `.claude/hooks/`, `.husky/` | bash 3.2 compatibility, test layout, exit codes |
| `claude-code-conventions.md` | `.claude/**`, `.claude-plugin/`, `evals/` | Agent, skill, hook, workflow, plugin and eval conventions |

## Scripts

Every script runs from the project root; `scripts/README.md` has the full reference with flags.

```bash
# Quality
./scripts/verify-all.sh [--ci] [--skip a,b] [--include a,b]   # every check below, one summary (/verify-all, /ci)
./scripts/lint-and-format.sh [--check]       # ESLint + Prettier
./scripts/check-types.sh                     # tsc --noEmit
./scripts/run-tests.sh                       # Vitest with coverage
./scripts/run-mutation-tests.sh [--threshold 80] [--json]     # Stryker
./scripts/check-accessibility.sh             # jsx-a11y
./scripts/verify-tokens.sh                   # hardcoded values vs the lockfile
./scripts/verify-test-coverage.sh            # every component has a test
./scripts/check-bundle-size.sh               # bundle analysis
./scripts/check-dead-code.sh [--json]        # knip
./scripts/check-security.sh [--json] [--level critical] [--no-fail]
node scripts/claude-code-conformance.js [--json] [--strict]   # .claude/ against the current Claude Code spec
./scripts/check-doc-counts.sh                # documented agent/skill counts vs disk (pre-commit + CI)
./scripts/validate-pipeline-config.sh [--json]               # pipeline.config.json against its schema

# Visual QA
node scripts/visual-diff.js <actual.png> <expected.png> [--threshold 0.02] [--json]
node scripts/visual-diff.js --batch <actual-dir> <expected-dir> [--output-dir diffs/]
./scripts/check-dark-mode.sh <url>           # dark-theme capture and diff
./scripts/check-responsive.sh [url] [output-dir]             # 5 breakpoints
./scripts/capture-baselines.sh [url] [--routes /,/about]     # regression baselines
./scripts/regression-test.sh [url] [--update-baselines] [--json]
./scripts/cross-browser-baseline.sh capture|compare|verify <url> [--json] [--blocking]   # RFC 0002
./scripts/cross-browser-test.sh <chromium|firefox|webkit> <url>   # ad-hoc capture
./scripts/setup-playwright.sh                # one-time browser install
./scripts/setup-baseline-lfs.sh [--dry-run]  # Git LFS for large baseline sets

# Pipeline tooling
./scripts/setup-project.sh my-app --next|--vite|--astro|--svelte|--expo
./scripts/sync-tokens.sh [--dry-run] [--json]                # token drift
./scripts/generate-stories.sh [--force] [--dry-run] [--no-mdx] [--json]
./scripts/generate-component-docs.sh
./scripts/generate-api-client.sh --spec <path-or-url> [--output dir] [--client]
./scripts/audit-cross-browser-css.sh [--json]
./scripts/export-design-system.sh [--scope @org] [--output dir] [--framework <name>] [--dry-run] [--json]
./scripts/import-design-tokens.sh [--from dir] [--out path] [--verify lockfile] [--json]
node scripts/renderer-registry.js (list | resolve <name> | detect [dir]) [--json]
node scripts/validate-renderer.js --dir <renderer-dir>     # or --all
node scripts/create-agent-plugin.js <name> [--tools ...] [--with-hooks]   # agent plugins: docs/guides/agent-plugins.md
node scripts/validate-agent-plugin.js --dir <plugin-dir>   # or --all
node scripts/agent-registry.js (list | resolve | install | uninstall) <name>
node scripts/test-agent-plugin.js --dir <plugin-dir>       # or --all

# Build performance
./scripts/incremental-build.sh [phase|all] [--force] [--parallel]
node scripts/pipeline-cache.js status|check <phase>|invalidate <phase>
node scripts/stage-profiler.js report|analyze|history
node scripts/metrics-dashboard.js generate|summary|trends

# Desktop GUI (experimental) — docs/GUI.md
pnpm gui:dev | pnpm gui:test | pnpm gui:package
```

## Development Commands

Always use pnpm.

```bash
pnpm install                 # dependencies
pnpm dev                     # dev server (Next.js :3000, Vite :5173)
pnpm build                   # production build
pnpm vitest run [--coverage] # tests once (pnpm vitest for watch mode)
pnpm storybook               # Storybook dev server
pnpm eslint . [--fix]        # lint
pnpm prettier --check .      # format check (--write to fix)
pnpm tsc --noEmit            # type check
pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/   # the framework's own script tests
```

---

## Claude Code Architecture & Configuration

### Plugins

The framework needs no plugin: its agents, skills, hooks and workflow live in `.claude/`. The repo is itself the **`aurelius` plugin** (`.claude-plugin/plugin.json` over the live `.claude/` directories), so other repos install the agents instead of copying them: `/plugin install aurelius --marketplace PMDevSolutions/Aurelius`. The pipeline skills call `./scripts/…` and work only in an Aurelius checkout. GitHub integration is the `gh` CLI.

Optional official plugins (`typescript-lsp`, `commit-commands`, review plugins) and the MCP servers the agents expect: `.claude/PLUGINS-REFERENCE.md`.

### Custom Agents (56 Total)

56 specialized agents covering the full product lifecycle:

| Category | Count | Key Agents |
|----------|-------|------------|
| Engineering | 12 | frontend-developer, backend-architect, rapid-prototyper, test-writer-fixer, error-boundary-architect, migration-specialist, i18n-engineer, animation-optimizer, bundle-analyzer |
| Design | 5 | ui-designer, ux-researcher, brand-guardian |
| Design-to-Code | 9 | figma-react-converter, canva-react-converter, astro-converter, asset-cataloger, vue-converter, svelte-converter, react-native-converter, conversation-designer, indesign-to-react |
| Testing & QA | 7 | visual-qa-agent, accessibility-auditor, api-tester, performance-benchmarker |
| Product | 3 | sprint-prioritizer, feedback-synthesizer, trend-researcher |
| Marketing | 7 | content-creator, growth-hacker, app-store-optimizer |
| Project Management | 3 | studio-producer, project-shipper, experiment-tracker |
| Operations | 5 | analytics-reporter, infrastructure-maintainer, legal-compliance-checker |
| Documentation | 1 | docusaurus-expert |
| Meta | 2 | agent-expert, command-expert |
| Bonus | 2 | joker, studio-coach |

Agents are invoked automatically based on task context. Their frontmatter follows the Claude Code 2.1.310 subagent spec (`claude-code-conventions.md`): current tool names only, MCP access by server pattern (`mcp__figma__*`, `mcp__chrome-devtools__*`, …), `memory: local` on the eleven agents whose knowledge compounds across builds, skill preloads where a skill is the agent's playbook, and the `agent-no-deploy` hook on deploy- and release-facing agents.

**Full catalog:** `.claude/CUSTOM-AGENTS-GUIDE.md` · **Writing one:** `docs/guides/agent-creation.md`

---

### Skills (32 Total)

Every skill is also a slash command; the former `.claude/commands/` files are skills now. Pipelines and other long runs with side effects are user-invoked only (`disable-model-invocation`).

| Skill | Purpose | Invocation |
|-------|---------|------------|
| build-from-figma | Figma URL → working, tested app (defines the pipeline state file) | `/build-from-figma <url>` |
| build-from-canva | The same pipeline from a Canva design | `/build-from-canva <url>` |
| build-from-screenshot | The same pipeline from a URL or images, any output target | `/build-from-screenshot <url \| paths>` |
| build-from-conversation | Interview → generated Figma file → /build-from-figma | `/build-from-conversation [description]` |
| verify-all | Every local quality check, human-readable summary | `/verify-all` |
| ci | The same checks, JSON output, non-zero exit on failure | `/ci` |
| lint | ESLint + Prettier, auto-fix or `--check` | `/lint`, "lint this" |
| test | Vitest: suite, file, pattern, coverage | `/test`, "run the tests" |
| figma-to-react-workflow | Figma-to-React conversion playbook (TDD, pixel diff, E2E) | "convert Figma", "Figma to React" |
| figma-intake | Structured interview → build-spec.json (with appType) | Phase 1 of /build-from-figma |
| design-token-lock | Extract + lock Figma values → lockfile | Phase 2 of /build-from-figma |
| tdd-from-figma | Write tests FIRST, app-type-aware (Chrome ext, PWA) | Phase 3 of /build-from-figma |
| e2e-test-generator | Generate Playwright E2E from build-spec | Phase 6 of /build-from-figma |
| storybook-story-generation | Auto-generate Storybook stories + MDX (AST-based, non-blocking) | Phase 4.5, "generate stories" |
| visual-qa-verification | Automated pixel-diff visual QA | "verify", "visual QA", "compare to Figma" |
| parallel-orchestration | Phase scheduler for Phases 4.5-9 (all of 4-9 without workflows) | Invoked by the pipelines after Phase 3 |
| canva-intake | Canva design discovery → build-spec.json (with appType) | Phase 1 of /build-from-canva |
| canva-token-inference | AI token extraction from Canva/screenshot sources, user-confirmed | Phase 2 of /build-from-canva and /build-from-screenshot |
| screenshot-intake | URL/screenshot discovery → build-spec.json (with outputTarget) | "build from screenshot", "clone this site" |
| conversation-intake | Interview → build-spec.json + design-brief.json (no design file) | Phase C0 of /build-from-conversation |
| design-brief-to-figma | Generates a real Figma file from design-brief.json via HTML-mockup capture | Phase C1 of /build-from-conversation |
| export-design-system | Components + tokens → publishable pnpm workspace | `/export-design-system` |
| indesign-conversion | InDesign IDML/PDF → React components, tokens, stories | "InDesign to React", "IDML" |
| react-component-development | Component patterns and best practices | "create component", "custom hook" |
| react-testing-workflows | Vitest, RTL, Playwright, Storybook | "write tests", "test coverage" |
| react-performance-optimization | Profiling, bundle analysis, Web Vitals | "performance", "bundle size" |
| react-accessibility | WCAG patterns for React | "accessibility", "a11y", "ARIA" |
| state-management | Zustand, TanStack Query, URL state | "state management", "zustand", "data fetching" |
| form-handling | React Hook Form + Zod: typed forms, field arrays, wizards | "form", "validation", "react hook form" |
| auth-flows | Auth.js, Clerk, Supabase Auth, RBAC, protected routes | "auth", "login", "session", "OAuth" |
| animation-motion | Framer Motion, CSS transitions, reduced-motion a11y | "animation", "framer motion", "transition" |
| seo-metadata | Next.js Metadata API, JSON-LD, OG images, sitemaps | "SEO", "metadata", "open graph" |

**Full catalog:** `.claude/skills/README.md`

---

### Figma-to-React Pipeline

**Single command:** `/build-from-figma <Figma URL>`

Autonomous pipeline that converts a Figma design into a working, tested React app:

```
/build-from-figma https://figma.com/file/abc123

  [0] TOKEN SYNC    → sync-tokens.sh → drift check (conditional, if lockfile exists)
  [1] INTAKE        → figma-intake skill → build-spec.json (with appType)
  [2] TOKEN LOCK    → design-token-lock skill → design-tokens.lock.json
  [3] TDD (HARD GATE) → tdd-from-figma skill → failing tests (Red), test checksums recorded
  ─── COMPONENT LANES (Workflow tool: .claude/workflows/component-lanes.js) ───
  [4] BUILD         → one converter lane per component, tier by tier (Green)
                      tests rerun and test files checksummed by a separate agent
  [5] VISUAL DIFF   → ≤ maxVisualIterations rounds: every page diffed in parallel,
                      one fixer per component, every page re-checked
  ─── PARALLEL ORCHESTRATION (phases 4.5-9, max 3 concurrent) ───
      ├─ [4.5] STORYBOOK   → generate-stories.sh (non-blocking)
      ├─ [5.5] DARK MODE   → check-dark-mode.sh (non-blocking)
      ├─ [6]   E2E TESTS   → e2e-test-generator skill
      ├─ [7]   CROSS-BROWSER → cross-browser-baseline.sh compare (non-blocking)
      ├─ [7.5] REGRESSION  → regression-test.sh (non-blocking)
      ├─ [8]   QUALITY GATE → [coverage|types|build|tokens|lighthouse] in parallel
      └─ [8.5] RESPONSIVE  → check-responsive.sh (non-blocking)
  [9] REPORT        → build-report.md (after quality-gate + e2e complete)
```

Without the Workflow tool, `parallel-orchestration` runs all of Phases 4-9.

**Key artifacts:**
- `design-tokens.lock.json` — Single source of truth for all design values
- `build-spec.json` — Machine-readable build plan with appType, outputTarget (`"react" | "vue" | "svelte" | "react-native"`), and E2E flows
- `.claude/plans/pipeline-state.json` — The run's progress: phases, components (with test checksums), pages. Survives an interrupted session; the SessionStart hook reports where a run stopped
- `pipeline.config.json` — Thresholds, iteration limits, app-type definitions
- `.claude/visual-qa/baselines/manifest.json` — Cross-browser baseline provenance (engine, Playwright version, pinned image, sha256, host — RFC 0002)

**Features:**
- **Enforced TDD** — tests must exist before components, hard gate blocks the build phase, and the lanes reject a changed test file
- **Pixel-perfect visual diff** — `pixelmatch`-based comparison, bounded in code
- **App-type awareness** — Chrome extensions, PWAs, React Native, and web apps get tailored E2E strategies (Chrome extension E2E: Playwright persistent context with `--load-extension`)
- Cross-browser verification (Firefox, WebKit) — committed per-engine baselines diffed at the 0.03 cross-engine threshold (RFC 0002; backends: commit | ci-artifact | service)
- Quality gate: 80%+ coverage, TypeScript, Lighthouse audit; dark mode, Storybook, responsive and regression checks (non-blocking); Sentry and Vercel deploy previews configured via pipeline.config.json
- **Resumable** — the state file survives an interrupted session

**Documentation:** `docs/figma-to-react/README.md`

---

### Canva-to-React Pipeline

**Single command:** `/build-from-canva <Canva URL>`

Same pipeline as Figma with Canva-specific phases 1, 2, and 4:

- **Phase 1:** canva-intake (vision-based discovery via Canva AI Connector MCP)
- **Phase 2:** canva-token-inference (AI extraction with confidence scoring + user confirmation)
- **Phase 4:** canva-react-converter agent in the component lanes (builds components from screenshots)
- **Phases 3, 5-9:** shared (identical to Figma pipeline)

**Documentation:** `docs/canva-to-react/README.md`

---

### Screenshot/URL-to-App Pipeline

**Single command:** `/build-from-screenshot <URL or image paths>`

Same pipeline with a screenshot-specific Phase 1; Phase 4 dispatches the converter named by the renderer manifest (vue-converter, svelte-converter, react-native-converter, or figma-react-converter). Supports all output targets: React, Vue 3, Svelte/SvelteKit, React Native (Expo).

**Documentation:** `docs/screenshot-to-app/README.md`

---

### Conversation-to-App Pipeline

**Single command:** `/build-from-conversation [optional description]`

"Talk to build" — no pre-existing design file required. Two phases generate a real Figma design from a structured conversation, then hand off to the unchanged `/build-from-figma` pipeline:

- **Phase C0:** conversation-intake (max-7-question interview + conversation-designer agent → `build-spec.json` with `"source": "conversation"` + `design-brief.json`)
- **Phase C1:** design-brief-to-figma (per-page HTML mockups → new Figma file via `create_new_file` + `generate_figma_design` capture → node IDs mapped into the build spec)
- **Handoff:** `/build-from-figma <generated URL>` runs phases 0-9 as usual; figma-intake fast-paths on the conversation-sourced build spec, and design-token-lock falls back to computed styles

**Documentation:** `docs/conversation-to-app/README.md`

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

**Documentation:** `docs/multi-framework/README.md` · **Renderers:** `docs/multi-framework/renderers.md`

---

### MCP Server Integration

- **Figma Desktop MCP** (`figma-desktop`, `.mcp.json`) — local Figma integration (port 3845, needs the desktop app with Dev Mode)
- **Figma Remote MCP** (`figma`, `.mcp.json`) — fallback remote access
- **Playwright MCP** (`playwright`, `.mcp.json`) — cross-browser testing; the committed entry uses Windows `cmd /c`, so on macOS and Linux add a user-scope server (`.claude/PLUGINS-REFERENCE.md`)
- **Chrome DevTools MCP** (`chrome-devtools`) — screenshots, Lighthouse audits, DOM inspection; not in `.mcp.json`, add it at user scope
- **Canva AI Connector** — search, export, and interact with Canva designs
- **Sentry** — error monitoring (configured via pipeline.config.json, set up by the error-boundary-architect agent)

Agents reach these through server patterns in their `tools` lists. Servers bundled in a plugin carry `mcp__plugin_<plugin>_<server>__*` names, which those patterns do not match.

---

### Component Lanes and Parallel Orchestration

- **`component-lanes` workflow** (`.claude/workflows/component-lanes.js`) runs Phases 4-5 when the Workflow tool is available. The attempt bound, the test-file checksum check, the visual iteration bound and the pass decision are enforced in its code; `scripts/__tests__/component-lanes.test.js` covers its control flow.
- **`parallel-orchestration` skill** runs Phases 4.5-9 (all of 4-9 without workflows): dependency graph from `pipeline.config.json` → `orchestration.phases`, a concurrency pool (`maxConcurrent`, default 3), resource tagging against write conflicts, streaming results and a batch summary. Quality-gate subtasks (coverage, typecheck, build, token-verify, lighthouse) run in parallel too. Falls back to sequential execution when `orchestration.enabled` is `false`.

---

### Automated Hooks (11 Total)

Each hook is a standalone script under `.claude/hooks/` on the documented stdin/stdout JSON contract (shared `lib/hook-io.sh`), registered in `.claude/settings.json` and mirrored in `.claude/hooks/hooks.json` for the plugin. Every hook keeps a defensive skeleton (`set -u`, `trap 'exit 0' ERR`, always exit 0) and has tests in `scripts/__tests__/hooks.test.js`. Guide: [docs/guides/hooks.md](docs/guides/hooks.md).

| Script | Event (filter) | Action |
|--------|----------------|--------|
| `deploy-guard.sh` | PreToolUse Bash, every call, fail-closed | `ask` before production deploys, publishes, releases, store submissions, merges, dispatches and pushes to the default branch; reminder on preview deploys; `deny` for all of these inside subagents |
| `agent-no-deploy.sh` | PreToolUse Bash, agent frontmatter | The deploy guard in subagent mode, for deploy- and release-facing agents |
| `pre-commit-token-guard.sh` | PreToolUse `git commit` | `deny` when a file the commit carries has a hardcoded value (`verify-tokens.sh`) |
| `bundle-size-guard.sh` | PreToolUse `git commit` | Reminder when the build exceeds `bundleSize.maxSizeKb` |
| `post-build-qa.sh` | PostToolUse `pnpm *build*` | After a successful build: run the quality gate |
| `lighthouse-ci.sh` | PostToolUse `pnpm *build*` | After a successful build: Lighthouse thresholds from config |
| `regression-reminder.sh` | PostToolUse `pnpm *build*` | After a successful build: regression test when baselines exist |
| `coverage-check.sh` | PostToolUse `*vitest*` | Coverage below `tdd.coverageThreshold` |
| `mutation-test-reminder.sh` | PostToolUse `*vitest*` | After a fully passing run: Stryker, when `mutationTesting.reminder` is on |
| `dark-mode-reminder.sh` | PostToolUse `*visual-diff*` | After a passing visual diff: dark-mode check |
| `session-context.sh` | SessionStart | Status block: a pipeline run in flight and where it resumes, build spec, lockfiles, baselines, branch |

All hooks but the deploy guard stay silent outside an Aurelius project (no `.claude/pipeline.config.json`).

---

### Evals

`evals/` holds `claude plugin eval` cases for the hard rules: `no-prod-deploy`, `tests-are-the-spec`, `lockfile-holds`, `tests-first`. Runs cost model calls, so they run by hand: `claude plugin eval . --scaffold --allow-tools Write Edit Bash` (`evals/README.md`).

---

## Development Workflow with Claude Code

**1. Feature development**
```bash
git checkout -b feature/hero-component
# frontend-developer agent for React work, test-writer-fixer for tests, ui-designer for design decisions
./scripts/verify-all.sh                    # before opening the PR
gh pr create                               # merging and releasing stop at the deploy guard
```

**2. Design-to-code**
```
/build-from-figma <Figma URL>              # or /build-from-canva, /build-from-screenshot, /build-from-conversation
/export-design-system [flags]              # components + tokens as a publishable pnpm workspace
aurelius pipeline indesign <input> [--target ...] [--styling ...] [--output ...]   # InDesign IDML/PDF → React
```

**3. Working on the framework itself**
- After editing `.claude/`: `node scripts/claude-code-conformance.js`
- After adding a script: its vitest file in `scripts/__tests__/`, an entry in `scripts/README.md` and above
- Optional git shortcuts (`/commit`, `/commit-push-pr`, `/clean_gone`) come from the `commit-commands` plugin

---

**Last Updated:** 2026-10-24
**Architecture:** 56 agents, 32 skills, 11 hooks, 4 rules, 1 workflow, 4 eval cases, 57 scripts, 5 renderers (nextjs, vite, astro, sveltekit, expo); packaged as the `aurelius` plugin; Figma, Canva and Playwright MCP + gh CLI

> **Keeping counts in sync:** When adding or removing agents, skills, scripts, or hooks, update all count references across the project. Search for the old count number in `*.md` files to find all references: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/onboarding/`, `docs/react-development/`, and `.claude/AGENT-NAMING-GUIDE.md`. The agent and skill counts are enforced automatically by `scripts/check-doc-counts.sh` (run in CI and on pre-commit), which recounts `.claude/agents/` and `.claude/skills/` and fails on any documented count that disagrees. `.claude-plugin/plugin.json` lists every agent file; `node scripts/claude-code-conformance.js` fails when an agent is missing from it.
