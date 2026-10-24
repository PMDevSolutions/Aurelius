# Architecture Overview

This document explains how Aurelius is structured and how its components work together: agents, skills, pipelines, the component-lanes workflow, scripts, templates, hooks, rules, MCP servers, and the plugin packaging.

---

## System Architecture

```
                         ┌─────────────────────────┐
                         │      Claude Code         │
                         │   (orchestration layer)  │
                         └────────┬────────────────┘
                                  │
             ┌────────────────────┼─────────────────────┐
             │                    │                      │
     ┌───────▼──────┐   ┌────────▼────────┐   ┌────────▼────────┐
     │   56 Agents   │   │    32 Skills    │   │ Hooks + Rules   │
     │ (specialized  │   │  (workflow      │   │ (deploy guard,  │
     │  task workers) │   │   automation)  │   │  token guard,   │
     └───────┬──────┘   └────────┬────────┘   │  standards)     │
             │                    │            └────────┬────────┘
             │           ┌────────▼────────┐            │
             │           │  4 Pipelines    │            │
             │           │ (Figma, Canva,  │            │
             │           │  Screenshot,    │            │
             │           │  Conversation)  │            │
             │           └────────┬────────┘            │
             │                    │                      │
     ┌───────▼────────────────────▼──────────────────────▼───────┐
     │                    Infrastructure                          │
     │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
     │  │ 57       │  │ 11        │  │ 6 MCP    │  │ Templates│ │
     │  │ Scripts   │  │ Hooks     │  │ Servers  │  │ (8 sets) │ │
     │  └──────────┘  └───────────┘  └──────────┘  └──────────┘ │
     └───────────────────────────────────────────────────────────┘
```

---

## Agents (56 Total)

Agents are specialized Claude Code sub-processes that handle complex, multi-step tasks. Each agent is a markdown file in `.claude/agents/` with frontmatter defining its tools, capabilities, and instructions. Claude Code selects agents automatically based on your task context.

### Engineering Agents (12)

| Agent | Purpose | Key Tools |
|-------|---------|-----------|
| `frontend-developer` | Build React/Vue/Angular components, handle state management, optimize frontend performance | Write, Read, Bash, Grep, Glob |
| `backend-architect` | Design APIs, implement databases, architect scalable backend services | Write, Read, Bash, Grep |
| `rapid-prototyper` | Scaffold projects, build MVPs and proof-of-concepts quickly | Write, Edit, Bash, Read, Glob, Agent |
| `test-writer-fixer` | Write tests, run suites, analyze failures, fix broken tests | All tools |
| `error-boundary-architect` | Design error handling, React error boundaries, Sentry integration | Write, Read, Bash, Grep, Glob |
| `migration-specialist` | Upgrade React versions, migrate frameworks (CRA to Vite), run codemods | Write, Read, Bash, Grep, Glob, WebSearch |
| `i18n-engineer` | Add internationalization, manage translations, implement RTL support | Write, Read, Bash, Grep, Glob, WebSearch |
| `animation-optimizer` | Optimize animations, profile jank, ensure reduced-motion accessibility | Read, Write, Bash, Grep, Glob + Chrome DevTools MCP |
| `bundle-analyzer` | Analyze bundles, audit tree-shaking, optimize code splitting | Read, Write, Bash, Grep, Glob |
| `ai-engineer` | Integrate AI/ML features, build recommendation systems | Write, Read, Bash, WebFetch |
| `devops-automator` | Set up CI/CD, configure cloud infrastructure, automate deployments | Write, Read, Bash, Grep |
| `mobile-app-builder` | Develop React Native/Expo mobile apps, optimize mobile performance | Write, Read, Bash, Grep |

### Design Agents (5)

| Agent | Purpose |
|-------|---------|
| `ui-designer` | Create user interfaces, design systems, visual hierarchy |
| `ux-researcher` | Conduct user research, analyze behavior, create journey maps |
| `brand-guardian` | Enforce brand consistency, manage brand assets |
| `visual-storyteller` | Create data visualizations, infographics, presentations |
| `whimsy-injector` | Add micro-interactions and delightful UI details (runs proactively after UI changes) |

### Design-to-Code Agents (8)

| Agent | Purpose | Output |
|-------|---------|--------|
| `figma-react-converter` | Convert Figma designs to React components via Figma MCP | React + TypeScript + Tailwind |
| `conversation-designer` | Turn described intent into concrete design decisions and mockups for Figma generation | design-brief.json + HTML mockups |
| `canva-react-converter` | Convert Canva designs using screenshots and vision analysis | React + TypeScript + Tailwind |
| `vue-converter` | Convert designs to Vue 3 components | Vue 3 + `<script setup>` + TypeScript |
| `svelte-converter` | Convert designs to Svelte 5 components | SvelteKit + TypeScript + Tailwind |
| `react-native-converter` | Convert designs to React Native components | Expo + TypeScript + NativeWind |
| `astro-converter` | Convert designs to Astro (zero-JS `.astro` statics + React islands) | Astro + React islands + TypeScript + Tailwind |
| `asset-cataloger` | Catalog and semantically map project image assets | Mapping JSON + validation |

### Testing and QA Agents (7)

| Agent | Purpose |
|-------|---------|
| `visual-qa-agent` | Pixel-diff regression testing, cross-browser visual verification |
| `accessibility-auditor` | WCAG 2.1 AA compliance: Lighthouse audits, ARIA, contrast, keyboard nav |
| `api-tester` | REST/GraphQL API testing: performance, load, contract tests |
| `performance-benchmarker` | Profiling, Lighthouse audits, bottleneck identification |
| `test-results-analyzer` | Analyze test results, identify trends, generate quality metrics |
| `tool-evaluator` | Evaluate development tools, frameworks, and services |
| `workflow-optimizer` | Optimize human-agent collaboration and workflow efficiency |

### Product Agents (3)

| Agent | Purpose |
|-------|---------|
| `sprint-prioritizer` | Plan sprints, prioritize features, manage roadmaps |
| `feedback-synthesizer` | Analyze user feedback, identify patterns, prioritize features |
| `trend-researcher` | Research market trends, viral content, emerging user behaviors |

### Marketing Agents (7)

| Agent | Purpose |
|-------|---------|
| `content-creator` | Blog posts, video scripts, cross-platform content |
| `growth-hacker` | User acquisition, viral loops, growth experiments |
| `app-store-optimizer` | App store keywords, metadata optimization, conversion rates |
| `instagram-curator` | Instagram content strategy, Stories, Reels |
| `reddit-community-builder` | Authentic Reddit engagement and community growth |
| `tiktok-strategist` | TikTok campaigns, viral content, algorithm optimization |
| `twitter-engager` | Tweet threads, trending topics, community building |

### Project Management Agents (3)

| Agent | Purpose |
|-------|---------|
| `studio-producer` | Cross-functional coordination, resource management |
| `project-shipper` | Launch coordination, release processes, go-to-market |
| `experiment-tracker` | Track A/B tests, feature experiments, iteration results |

### Operations Agents (5)

| Agent | Purpose |
|-------|---------|
| `analytics-reporter` | Metrics analysis, performance reports, data-driven insights |
| `finance-tracker` | Budget management, cost optimization, revenue forecasting |
| `infrastructure-maintainer` | System health monitoring, scaling, reliability |
| `legal-compliance-checker` | Privacy policies, regulatory compliance, licensing |
| `support-responder` | Customer support, documentation, response automation |

### Documentation, Meta, and Bonus Agents (5)

| Agent | Purpose |
|-------|---------|
| `docusaurus-expert` | Docusaurus documentation sites, MDX content management |
| `agent-expert` | Create and design new specialized Claude Code agents |
| `command-expert` | Create CLI commands with argument parsing and automation |
| `joker` | Dad jokes, programming puns, startup humor |
| `studio-coach` | Performance coaching for agents, motivation, coordination |

---

## Skills (32 Total)

Skills are automated workflows triggered by slash commands or keyword detection. Unlike agents (which are general-purpose workers), skills encode specific multi-step processes.

### Pipeline Skills (Phase-Specific)

| Skill | Pipeline Phase | What It Does |
|-------|---------------|-------------|
| `figma-intake` | Phase 1 (Figma) | Auto-discovers Figma file structure, asks 3-5 targeted questions, produces `build-spec.json` |
| `canva-intake` | Phase 1 (Canva) | Vision-based discovery from Canva screenshots via MCP |
| `screenshot-intake` | Phase 1 (Screenshot) | Captures URL or reads images, vision-based analysis |
| `conversation-intake` | Phase C0 (Conversation) | Max-7-question interview → `build-spec.json` + `design-brief.json` (no design file) |
| `design-brief-to-figma` | Phase C1 (Conversation) | Generates a real Figma file from the brief via HTML-mockup capture |
| `design-token-lock` | Phase 2 | Extracts design tokens into `design-tokens.lock.json` + Tailwind config |
| `canva-token-inference` | Phase 2 (Canva/Screenshot) | AI-powered token extraction with confidence scoring |
| `tdd-from-figma` | Phase 3 | Writes failing tests for every component (RED phase, app-type-aware) |
| `figma-to-react-workflow` | Phase 4 | Orchestrates component generation with enforced TDD and visual QA |
| `storybook-story-generation` | Phase 4.5 | Auto-generates Storybook stories + MDX from components via ts-morph AST (non-blocking) |
| `e2e-test-generator` | Phase 6 | Generates Playwright E2E tests (web app, Chrome extension, PWA) |
| `visual-qa-verification` | Phase 5 | Automated pixel-diff using pixelmatch, up to 5 iterations |
| `parallel-orchestration` | Phases 4-9 | Concurrent phase execution with dependency graph |
| `export-design-system` | Post-build | Exports components + tokens as a publishable pnpm workspace (`/export-design-system`) |

### React Development Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `react-component-development` | "create component", "custom hook", component patterns |
| `react-testing-workflows` | "write tests", "test coverage", Vitest, Playwright |
| `react-performance-optimization` | "performance", "bundle size", profiling, Web Vitals |
| `react-accessibility` | "accessibility", "a11y", "ARIA", WCAG patterns |
| `state-management` | "state management", "zustand", "data fetching" |
| `form-handling` | "form", "validation", "react hook form", Zod |
| `auth-flows` | "auth", "login", "session", "OAuth" |
| `animation-motion` | "animation", "framer motion", "transition" |
| `seo-metadata` | "SEO", "metadata", "open graph", JSON-LD |

---

## Pipelines

Four autonomous pipelines convert designs into working, tested applications. All of them share phases 3-9; they differ in how they obtain the design and extract tokens. The conversation pipeline is the special case: it has no input design at all, so it *generates* a real Figma file first (interview → design brief → HTML mockups → Figma capture) and then joins the Figma path, whose `figma-intake` skill fast-paths conversation-sourced build specs.

### Pipeline Flow

```
INPUT SOURCE                    SHARED PIPELINE
─────────────                   ───────────────
Conversation ─► conversation-intake → design-brief-to-figma
                  (generates a real Figma file, then joins ▼)
Figma URL ──► figma-intake      [3] TDD Scaffold (hard gate)
Canva URL ──► canva-intake      [4] Component Build
Screenshot ──► screenshot-intake [5] Visual Diff (pixelmatch loop)
              │                  [6] E2E Tests (Playwright)
              ▼                  [7] Cross-Browser Screenshots
         build-spec.json         [8] Quality Gate (5 parallel checks)
              │                  [9] Build Report
              ▼
         Token Extraction
         (Figma: direct API,
          Canva/Screenshot:
          AI inference,
          Conversation: computed
          styles from generated file)
              │
              ▼
         design-tokens.lock.json
```

### Key Enforcement Rules

- **TDD is mandatory.** Phase 3 gates Phase 4 -- components cannot be built until tests exist.
- **Visual QA uses pixel diff.** `pixelmatch`-based comparison with a 2% threshold, not manual review.
- **Design tokens are locked.** A lockfile prevents hardcoded color/spacing/font values in components.
- **E2E tests are app-type-aware.** Chrome extensions, PWAs, and web apps each get tailored test strategies.

### Parallel Orchestration (Phases 4-9)

After TDD scaffolding, the pipeline runs phases concurrently where dependencies allow:

```
         tdd-scaffold (blocking)
              │
              ▼
         component-build (blocking)
              │
    ┌─────────┼─────────────┬──────────────┬──────────────┐
    │         │             │              │              │
    ▼         ▼             ▼              ▼              ▼
storybook  visual-diff  dark-mode    cross-browser   quality-gate
(non-blk)  (blocking)   (non-blk)    (non-blk)      (blocking)
              │                                          │
              ▼                                          │
           e2e-tests (blocking)                          │
              │                                          │
              └──────────────────────────────────────────┘
                                  │
                                  ▼
                               report
```

Maximum 3 phases run concurrently (configurable). Resource tagging prevents write conflicts.

### Supported App Types

| App Type | Detection | E2E Strategy | Test Harness |
|----------|-----------|-------------|-------------|
| Web App | Default | Page navigation, forms, responsive | Playwright |
| Chrome Extension | `manifest.json` with `manifest_version` | Extension load, popup, content scripts | Playwright (persistent context) |
| PWA | `manifest.json` with `start_url` | Install prompt, offline fallback, SW lifecycle | Playwright |
| React Native | Expo project | App launch, screen navigation, deep links | Maestro |

### Multi-Framework Output

The `outputTarget` field in `build-spec.json` controls which framework the pipeline generates:

| Target | Converter Agent | Test Library |
|--------|----------------|-------------|
| `"react"` | figma-react-converter / canva-react-converter | Vitest + React Testing Library |
| `"vue"` | vue-converter | Vitest + @vue/test-utils |
| `"svelte"` | svelte-converter | Vitest + @testing-library/svelte |
| `"react-native"` | react-native-converter | Jest + @testing-library/react-native |

Auto-detection: if not specified, the pipeline reads `package.json` and config files to determine the framework.

---

## Scripts (30+)

Located in `scripts/`. These are the automation backbone that agents and pipelines invoke.

### Code Quality

| Script | Purpose |
|--------|---------|
| `lint-and-format.sh` | ESLint + Prettier |
| `check-types.sh` | TypeScript `--noEmit` |
| `check-bundle-size.sh` | Bundle size warnings (threshold in pipeline config) |
| `check-accessibility.sh` | jsx-a11y scanning |
| `check-dead-code.sh` | Unused exports, files, dependencies (knip) |
| `check-security.sh` | Dependency vulnerabilities + anti-pattern detection |

### Testing

| Script | Purpose |
|--------|---------|
| `run-tests.sh` | Vitest with coverage |
| `cross-browser-test.sh` | Playwright multi-browser screenshots (ad-hoc capture, no comparison) |
| `cross-browser-baseline.sh` | Cross-browser baseline capture/compare with provenance (RFC 0002) |
| `setup-baseline-lfs.sh` | Route large baseline sets through Git LFS (storage="lfs") |
| `setup-playwright.sh` | One-time browser engine installation |
| `capture-baselines.sh` | Capture baseline screenshots for regression |
| `regression-test.sh` | Visual regression testing against baselines |

### Pipeline and Verification

| Script | Purpose |
|--------|---------|
| `verify-tokens.sh` | Catch hardcoded design values |
| `verify-test-coverage.sh` | Ensure every component has a test file |
| `visual-diff.js` | Pixel-level screenshot comparison (single + batch) |
| `sync-tokens.sh` | Token drift detection between lockfile and source |
| `check-dark-mode.sh` | Dark mode screenshot comparison |
| `check-responsive.sh` | Screenshots at 5 breakpoints (320-1920px) |
| `audit-cross-browser-css.sh` | Cross-browser CSS compatibility audit |

### Project and Documentation

| Script | Purpose |
|--------|---------|
| `setup-project.sh` | Initialize new project (`--next`, `--vite`) |
| `generate-stories.sh` | Auto-generate Storybook stories |
| `generate-component-docs.sh` | Generate MDX component documentation |
| `generate-api-client.sh` | OpenAPI spec to typed TypeScript client |

---

## Templates (8 Sets)

Located in `templates/`. Starter configurations applied by `setup-project.sh` and pipelines.

| Directory | Contents |
|-----------|---------|
| `shared/` | ESLint, Prettier, Tailwind, TypeScript, Vitest, Playwright, CSS reset (12 files) |
| `nextjs/` | Next.js config |
| `vite/` | Vite config |
| `vue/` | Vue 3 package.json, vite, tsconfig, vitest config |
| `sveltekit/` | SvelteKit config, vite, tsconfig, vitest |
| `expo/` | Expo package.json, app.json, tsconfig, babel config |
| `chrome-extension/` | Playwright fixtures for extension E2E testing |
| `pwa/` | Playwright config for PWA E2E testing (offline, install, SW) |

---

## Plugin Packaging

Aurelius needs no plugin: everything it runs lives in `.claude/`. The repo is itself a plugin. `.claude-plugin/plugin.json` points at the live agent files, `.claude/skills`, `.claude/hooks/hooks.json` and `.claude/workflows`, so another repo can install the agents, the knowledge skills and the deploy guard (`/plugin install aurelius --marketplace PMDevSolutions/Aurelius`) instead of copying them. The pipeline skills call `./scripts/…` and run only in an Aurelius checkout. Optional official plugins and the MCP servers the agents expect are in `.claude/PLUGINS-REFERENCE.md`.

GitHub integration is via the `gh` CLI (not a plugin): `gh pr create`, `gh issue create`, etc.

---

## Rules (path-scoped)

Standards live in `.claude/rules/` and load only when Claude touches matching files, which keeps CLAUDE.md short:

| Rule | Loads for |
|------|-----------|
| `react-standards.md` | `src/`, `app/`, `templates/`, component files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`) |
| `pipeline-artifacts.md` | The build spec, the lockfile, `.claude/plans/`, the pipeline config, visual baselines |
| `scripts-and-hooks.md` | `scripts/`, `.claude/hooks/`, `.husky/` |
| `claude-code-conventions.md` | `.claude/**`, `.claude-plugin/`, `evals/` |

---

## Component Lanes Workflow

`.claude/workflows/component-lanes.js` runs Phases 4-5 of the build pipelines through Claude Code's Workflow tool: one converter lane per component, tier by tier, with a separate agent rerunning each component's tests and hashing its test file; then bounded visual-diff rounds in which every page is diffed in parallel and each component has one fixer per round. The bounds and the "tests are never modified" rule are enforced in its code. `parallel-orchestration` runs Phases 4.5-9 afterwards, or all of 4-9 when workflows are unavailable.

---

## Hooks (11 Automated)

Each hook is a stand-alone script under `.claude/hooks/` on Claude Code's hook contract: the event arrives as JSON on stdin and the hook answers with JSON on stdout. They are registered in `.claude/settings.json` (and mirrored in `.claude/hooks/hooks.json` for the plugin). See the [Hook System guide](../guides/hooks.md) for the contract, the deploy guard's tiers, and how to add a hook.

| Script | Event | Action |
|--------|-------|--------|
| `deploy-guard.sh` | Before every Bash call (fail-closed) | Asks a human before production deploys, publishes, releases, merges, dispatches and pushes to the default branch; denies them inside subagents |
| `agent-no-deploy.sh` | Before Bash, in agent frontmatter | The deploy guard in subagent mode, for deploy- and release-facing agents |
| `pre-commit-token-guard.sh` | Before `git commit` | Denies the commit when a file it carries has a hardcoded value |
| `bundle-size-guard.sh` | Before `git commit` | Reminds when the build exceeds `bundleSize.maxSizeKb` |
| `post-build-qa.sh` | After a successful `pnpm build` | Reminds to run the quality gate |
| `lighthouse-ci.sh` | After a successful `pnpm build` | Names the Lighthouse thresholds from config |
| `regression-reminder.sh` | After a successful `pnpm build` | Suggests a regression run when baselines exist |
| `coverage-check.sh` | After a vitest run with coverage | Speaks when coverage is below the threshold |
| `mutation-test-reminder.sh` | After a fully passing vitest run | Suggests Stryker when the reminder is on |
| `dark-mode-reminder.sh` | After a passing visual diff | Suggests the dark-mode check |
| `session-context.sh` | Session start | Status block: a pipeline run in flight and where it resumes, lockfiles, baselines, branch |

---

## MCP Servers (6)

Model Context Protocol servers provide external tool access to agents.

| Server | Purpose | Required For |
|--------|---------|-------------|
| Figma Desktop MCP | Local Figma integration (port 3845) | Figma pipeline phases 1-2, 5 |
| Figma Remote MCP | Fallback remote Figma access; file creation and design capture | Figma pipeline (when desktop unavailable); conversation pipeline design generation (`create_new_file`, `generate_figma_design`) |
| Chrome DevTools MCP | Screenshots, Lighthouse, DOM inspection | Visual QA, quality gate |
| Playwright MCP | Cross-browser testing (Chromium, Firefox, WebKit) | E2E and cross-browser phases |
| Canva AI Connector | Search, export, interact with Canva designs | Canva pipeline phases 1-2 |
| Sentry | Error monitoring | Production error tracking |

---

## Key Artifacts

These files are generated and consumed by the pipeline:

| File | Created By | Used By | Purpose |
|------|-----------|---------|---------|
| `build-spec.json` | Intake skills | All pipeline phases | Machine-readable build plan (app type, components, output target, E2E flows) |
| `design-brief.json` | conversation-intake (via conversation-designer agent) | design-brief-to-figma | Style direction, color/typography/layout decisions, and component descriptions that drive Figma generation |
| `design-tokens.lock.json` | Token lock / inference skills | Component build, token verification | Single source of truth for all design values |
| `pipeline-state.json` | Every pipeline phase | The next session, resumed runs | Progress of a run (phases, components with test checksums, pages); `.claude/plans/`, gitignored |
| `build-report.md` | Report phase | Developer review | Final pipeline report with screenshots and metrics |
| `pipeline.config.json` | Manual configuration | All pipeline phases | Thresholds, app types, orchestration settings |

---

## How Components Connect

A typical workflow through the system:

1. **User provides a Figma URL** via `/build-from-figma`
2. **`figma-intake` skill** discovers the design, asks questions, produces `build-spec.json`
3. **`design-token-lock` skill** extracts tokens into `design-tokens.lock.json`
4. **`tdd-from-figma` skill** writes failing tests (RED phase)
5. **`figma-react-converter` agent** builds components using the `figma-to-react-workflow` skill
6. **`visual-qa-agent`** runs pixel-diff verification using `visual-diff.js`
7. **`e2e-test-generator` skill** creates Playwright tests based on app type from `build-spec.json`
8. **Hooks** fire automatically: token guard on commit, coverage check after tests, bundle size on commit
9. **Quality gate** runs 5 parallel checks per `pipeline.config.json` thresholds
10. **Final report** is generated with all results

Each step reads configuration from `pipeline.config.json` and respects the orchestration dependency graph.
