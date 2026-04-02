# User Guides for Core Framework Systems — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write 11 user-facing documentation guides covering design tokens, visual QA, caching, hooks, error recovery, agent creation, and framework-specific converter workflows — then link them from the onboarding docs.

**Architecture:** All guides go in a new `docs/guides/` directory. Each guide is a standalone Markdown file that explains one system end-to-end with examples, configuration snippets, and troubleshooting tips. Guides reference source files but do not duplicate CLAUDE.md content.

**Tech Stack:** Markdown documentation, referencing shell scripts, Node.js scripts, JSON configs, and YAML agent definitions.

---

## Task 1: Create `docs/guides/` Directory and Index

**Files:**
- Create: `docs/guides/README.md`

**Step 1: Create the guides index**

Write `docs/guides/README.md`:

```markdown
# Framework Guides

Deep-dive documentation for Aurelius framework systems. These guides go beyond the [Quickstart](../onboarding/quickstart.md) and explain how each system works under the hood.

## Core Pipeline Systems (P0)

| Guide | What You Will Learn |
|-------|-------------------|
| [Design Token System](design-tokens.md) | Token structure, lockfile format, validation, sync strategy, drift detection |
| [Visual QA Deep Dive](visual-qa.md) | How visual-diff.js works, sub-pixel detection, typography analysis, threshold tuning |
| [Pipeline Caching & Performance](caching.md) | Incremental builds, cache invalidation, profiling, when to use --force |

## Development Guides (P1)

| Guide | What You Will Learn |
|-------|-------------------|
| [Hook System](hooks.md) | How hooks fire, execution order, creating custom hooks |
| [Error Recovery](error-recovery.md) | What to do when a pipeline phase fails, how to resume, common failure modes |
| [Agent Creation](agent-creation.md) | How to create a custom agent, required YAML frontmatter, tool declarations |

## Framework-Specific Guides (P2)

| Guide | What You Will Learn |
|-------|-------------------|
| [Vue Converter Workflow](vue-converter.md) | Vue 3 pipeline specifics, Composition API patterns |
| [Svelte Converter Workflow](svelte-converter.md) | SvelteKit pipeline specifics, store patterns |
| [React Native Converter Workflow](react-native-converter.md) | Expo pipeline specifics, NativeWind setup |
| [Chrome Extension Pipeline](chrome-extension.md) | Manifest v3, service worker testing, extension E2E |
| [PWA Pipeline](pwa.md) | Service worker lifecycle, offline testing, manifest validation |
```

**Step 2: Commit**

```bash
git add docs/guides/README.md
git commit -m "docs: add guides directory with index

Creates docs/guides/ for deep-dive framework documentation.
Indexes all 11 planned guides across P0, P1, and P2 priority tiers."
```

---

## Task 2: Design Token System Guide (P0)

**Files:**
- Create: `docs/guides/design-tokens.md`
- Reference: `scripts/verify-tokens.sh`, `scripts/sync-tokens.sh`, `.claude/pipeline.config.json` (lines 43-52 for TDD, caching section for token inputs)

**Step 1: Write the guide**

Write `docs/guides/design-tokens.md` covering these sections:

1. **Overview** — What design tokens are and why Aurelius uses a lockfile-based system
2. **Token Structure** — The `design-tokens.lock.json` format with example:
   ```json
   {
     "colors": { "primary": "#3B82F6", "secondary": "#10B981" },
     "spacing": { "sm": "0.5rem", "md": "1rem", "lg": "1.5rem" },
     "typography": { "heading": { "fontFamily": "Inter", "fontWeight": 700 } },
     "metadata": { "source": "figma", "fileKey": "abc123", "exportedAt": "..." }
   }
   ```
3. **Lockfile Locations** — Searched at `src/styles/design-tokens.lock.json` then `design-tokens.lock.json` (root)
4. **How Tokens Flow** — Figma/Canva → lockfile → `tailwind.config.ts` + CSS custom properties → components
5. **Token Validation (`verify-tokens.sh`)** — What it checks (hardcoded hex colors in .tsx, arbitrary pixel values in Tailwind classes, inline style objects), exit codes (0=pass, 1=violations), example output
6. **Token Drift Detection (`sync-tokens.sh`)** — Compares lockfile against tailwind.config and CSS vars, modes (`--dry-run`, `--update`, `--json`), exit codes (0=no drift, 1=drift, 2=no lockfile)
7. **Pipeline Integration** — Phase 0 (Token Sync) runs `sync-tokens.sh` if lockfile exists; Phase 2 (Token Lock) creates/updates lockfile; pre-commit hook runs `verify-tokens.sh`
8. **Configuration** — Relevant `pipeline.config.json` sections: `caching.inputCategories.tokens`, `orchestration.phases[0]` (token-sync)
9. **Troubleshooting** — Common issues: "No lockfile found", "Token drift detected", "Hardcoded hex color at file:line"

**Step 2: Commit**

```bash
git add docs/guides/design-tokens.md
git commit -m "docs: add design token system guide

Covers token structure, lockfile format, verify-tokens.sh,
sync-tokens.sh, pipeline integration, and troubleshooting."
```

---

## Task 3: Visual QA Deep Dive Guide (P0)

**Files:**
- Create: `docs/guides/visual-qa.md`
- Reference: `scripts/visual-diff.js`, `.claude/pipeline.config.json` (lines 5-42 for visualDiff and iterationLoop)

**Step 1: Write the guide**

Write `docs/guides/visual-qa.md` covering:

1. **Overview** — Pixel-level screenshot comparison using pixelmatch, not manual eyeballing
2. **How `visual-diff.js` Works** — Takes actual + expected PNG, outputs diff image with magenta highlights, returns mismatch percentage
3. **Usage** — Single mode: `node scripts/visual-diff.js <actual> <expected> [--threshold 0.02] [--output diff.png] [--json]`; Batch mode: `node scripts/visual-diff.js --batch <dir-actual> <dir-expected> [--output-dir diffs/]`
4. **Exit Codes** — 0=pass (below threshold), 1=fail (above threshold), 2=error
5. **Sub-Pixel Detection** — How the tool classifies differences: sub-pixel rendering noise vs actual layout changes. The `visualDiff.subPixelClassification` config
6. **Typography Analysis** — Font rendering differences, `visualDiff.typographyAnalysis` config
7. **Region Grid Analysis** — 4x4 grid divides the image into 16 regions, reports per-region mismatch so you can pinpoint which area drifted. Configured via `iterationLoop.regionAnalysis.gridSize`
8. **Layout Drift Detection** — `visualDiff.layoutDriftDetection` for detecting element position shifts
9. **Threshold Tuning** — Default 0.02 (2%), warn at 0.05 (5%). When to adjust: font rendering cross-platform, anti-aliasing, retina vs standard
10. **Iteration Loop** — Pipeline Phase 5 runs up to `iterationLoop.maxVisualIterations` (5) iterations, fixing diffs each round
11. **Breakpoints** — Default breakpoints for responsive comparison: mobile (375px), tablet (768px), desktop (1440px), wide (1920px)
12. **Output Location** — Diff images saved to `.claude/visual-qa/diffs` (configurable via `visualDiff.outputDirectory`)
13. **Dark Mode Verification** — After visual diff passes, `check-dark-mode.sh` captures dark theme screenshots for comparison
14. **Troubleshooting** — "Diff too high due to font rendering", "Region X shows drift but looks identical" (sub-pixel), "Batch mode missing files"

**Step 2: Commit**

```bash
git add docs/guides/visual-qa.md
git commit -m "docs: add visual QA deep dive guide

Covers visual-diff.js internals, sub-pixel detection, typography
analysis, region grids, threshold tuning, and iteration loop."
```

---

## Task 4: Pipeline Caching & Performance Guide (P0)

**Files:**
- Create: `docs/guides/caching.md`
- Reference: `scripts/pipeline-cache.js`, `scripts/stage-profiler.js`, `scripts/metrics-dashboard.js`, `scripts/incremental-build.sh`, `.claude/pipeline.config.json` (caching, profiling, dashboard sections)

**Step 1: Write the guide**

Write `docs/guides/caching.md` covering:

1. **Overview** — Content-hash caching skips unchanged pipeline phases, profiling tracks stage performance, dashboard visualizes trends
2. **How Incremental Builds Work** — `incremental-build.sh` hashes inputs per phase, checks cache, skips if valid, profiles timing
3. **Cache Strategy** — Content-addressable via SHA-256. Inputs categorized: source, styles, tests, config, tokens, figma. Phase-level granularity
4. **Cache Commands** — `node scripts/pipeline-cache.js status` (show cache), `check <phase>` (validate), `invalidate <phase>` (force re-run), `clean` (remove stale entries)
5. **Cache Location** — `.claude/pipeline-cache/cache-manifest.json`
6. **Cache Invalidation Rules** — When does cache invalidate? Source file changes, config changes, dependency changes. Manual invalidation with `invalidate <phase>`
7. **When to Use `--force`** — Fresh clone, after git rebase, suspected stale cache, CI environments. Command: `./scripts/incremental-build.sh --force`
8. **Parallel Execution** — `./scripts/incremental-build.sh --parallel` runs independent phases concurrently (respects dependency graph from `orchestration.phases`)
9. **Stage Profiling** — `node scripts/stage-profiler.js start/end/report/history/analyze`. Metrics: timing (sub-second), memory, CPU. Stored in `.claude/pipeline-cache/metrics/`
10. **Slow Stage Detection** — Threshold: 30 seconds (`profiling.slowStageThresholdMs`). Memory threshold: 1024MB. Trend degradation alert at 20%
11. **Metrics Dashboard** — `node scripts/metrics-dashboard.js generate` (HTML), `summary` (terminal), `trends` (performance over time). Output: `.claude/visual-qa/dashboard/`. Retention: 30 days
12. **Configuration Reference** — Key `pipeline.config.json` sections: `caching`, `profiling`, `dashboard`
13. **Troubleshooting** — "Cache not invalidating after changes" (check input categories), "Build slower than expected" (run `analyze`), "Dashboard empty" (run build first)

**Step 2: Commit**

```bash
git add docs/guides/caching.md
git commit -m "docs: add pipeline caching and performance guide

Covers incremental builds, cache invalidation, stage profiling,
metrics dashboard, and performance troubleshooting."
```

---

## Task 5: Hook System Guide (P1)

**Files:**
- Create: `docs/guides/hooks.md`
- Reference: `.claude/settings.json`, `.claude/hooks/` directory

**Step 1: Write the guide**

Write `docs/guides/hooks.md` covering:

1. **Overview** — Hooks are shell commands that run automatically in response to Claude Code tool events. Configured in `.claude/settings.json`
2. **How Hooks Fire** — PostToolUse event fires after a Bash tool completes. The hook's command receives tool output and checks for patterns (e.g., `pnpm build` success, `git commit` detected)
3. **Hook Configuration Format** — JSON structure:
   ```json
   {
     "hooks": {
       "PostToolUse": [{
         "matcher": "Bash",
         "hooks": [{
           "type": "command",
           "command": "bash -c '...'",
           "description": "Human-readable description"
         }]
       }]
     }
   }
   ```
4. **Execution Order** — All PostToolUse hooks with matching `matcher` run sequentially after the tool completes. Order follows array position in settings.json
5. **The 8 Built-In Hooks** — Table with: name, trigger pattern, what it does, example output. Cover all 8: post-build QA, pre-commit token guard, dark mode reminder, coverage enforcement, Lighthouse CI, bundle size guard, mutation testing reminder, regression reminder
6. **Creating a Custom Hook** — Step-by-step: add entry to `settings.json` → hooks array, write the bash command that pattern-matches tool output, test by running the triggering command
7. **Hook Scripts Directory** — `.claude/hooks/` contains reusable hook scripts. When a hook is complex, extract it to a script file and reference it from settings.json
8. **Best Practices** — Keep hooks fast (<2s), use exit code 0 for info/reminders (non-blocking), pattern-match carefully to avoid false triggers
9. **Troubleshooting** — "Hook not firing" (check matcher and pattern), "Hook blocking workflow" (check exit codes), "Hook output not visible" (check description field)

**Step 2: Commit**

```bash
git add docs/guides/hooks.md
git commit -m "docs: add hook system guide

Covers hook configuration, execution order, all 8 built-in hooks,
creating custom hooks, and troubleshooting."
```

---

## Task 6: Error Recovery Guide (P1)

**Files:**
- Create: `docs/guides/error-recovery.md`
- Reference: `.claude/pipeline.config.json` (orchestration section), `docs/onboarding/troubleshooting.md`

**Step 1: Write the guide**

Write `docs/guides/error-recovery.md` covering:

1. **Overview** — Pipeline phases can fail. This guide explains how to diagnose, recover, and resume
2. **How the Pipeline Tracks Progress** — TodoWrite tasks mark each phase. Completed phases are not re-run. Failed phases show in the task list
3. **Phase Failure Modes** — Table per phase:
   - Phase 0 (Token Sync): no lockfile (skip), drift detected (warning)
   - Phase 1 (Intake): Figma MCP connection failed, invalid URL
   - Phase 2 (Token Lock): empty design, extraction timeout
   - Phase 3 (TDD Gate): test generation fails, no components in build-spec
   - Phase 4 (Build): component compile errors, test failures
   - Phase 5 (Visual Diff): screenshot capture fails, diff threshold exceeded after 5 iterations
   - Phase 6 (E2E): browser not installed, test timeout
   - Phase 7 (Cross-Browser): Firefox/WebKit not available
   - Phase 8 (Quality Gate): coverage below 80%, TypeScript errors, Lighthouse below thresholds
   - Phase 9 (Report): no failures possible (generates from available data)
4. **Resuming a Failed Pipeline** — Re-run the pipeline command. Completed phases are cached; the pipeline picks up from the failed phase. Use `node scripts/pipeline-cache.js status` to see which phases have valid cache
5. **Forcing a Phase Re-Run** — `node scripts/pipeline-cache.js invalidate <phase-name>` then re-run pipeline
6. **Manual Phase Execution** — Run individual scripts directly: `./scripts/verify-tokens.sh`, `node scripts/visual-diff.js`, etc. Useful for debugging a specific phase
7. **Common Recovery Patterns** — "Visual diff stuck in iteration loop" (lower threshold or manually approve), "E2E tests timeout" (check dev server is running, increase timeout in pipeline.config.json), "Quality gate coverage too low" (write more tests, check coverage report)
8. **Parallel Phase Failures** — When orchestration runs phases concurrently, one phase failure does not block independent phases. Check the batch summary for which phases succeeded/failed
9. **When to Start Fresh** — `./scripts/incremental-build.sh --force` rebuilds everything. Use after major config changes, git rebase, or when cache seems corrupted

**Step 2: Commit**

```bash
git add docs/guides/error-recovery.md
git commit -m "docs: add error recovery guide

Covers pipeline failure modes per phase, resuming failed pipelines,
manual phase execution, and common recovery patterns."
```

---

## Task 7: Agent Creation Guide (P1)

**Files:**
- Create: `docs/guides/agent-creation.md`
- Reference: `.claude/agents/` (any agent file for structure example)

**Step 1: Write the guide**

Write `docs/guides/agent-creation.md` covering:

1. **Overview** — Agents are specialized Markdown files with YAML frontmatter that Claude Code loads based on task context
2. **Agent File Location** — `.claude/agents/<agent-name>.md`
3. **Required YAML Frontmatter** — Example:
   ```yaml
   ---
   name: my-agent
   description: One-line description of what this agent does
   tools: [Read, Write, Edit, Bash, Grep, Glob]
   model: sonnet
   ---
   ```
4. **Frontmatter Fields Explained** — `name` (kebab-case, matches filename), `description` (shown in agent selection, be specific), `tools` (array of allowed tools — only declare what the agent needs), `model` (sonnet for most, opus for complex design/architecture work), `permissionMode` (optional, `bypassPermissions` for autonomous pipelines)
5. **Available Tools** — Full list of declarable tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Agent (sub-agents), AskUserQuestion, TaskOutput, TodoWrite, plus MCP tools (mcp__figma__*, mcp__playwright__*, mcp__chrome-devtools__*)
6. **Agent Body Structure** — After the frontmatter, write Markdown that instructs the agent. Recommended sections: Primary Responsibilities, Workflow (numbered steps), Key Principles, Quality Standards
7. **Choosing a Model** — `sonnet` for most agents (fast, capable), `opus` for agents that need deep reasoning (design interpretation, architecture decisions), `haiku` for simple/fast tasks
8. **Example: Creating a Documentation Agent** — Full walkthrough from idea to working agent
9. **Testing Your Agent** — Invoke it with the Agent tool, verify it selects the right tools, check output quality
10. **Registration** — Add to CLAUDE.md agent table and `.claude/CUSTOM-AGENTS-GUIDE.md` catalog
11. **Best Practices** — Keep scope focused (one responsibility), declare minimal tools, write clear instructions, include examples in the agent body

**Step 2: Commit**

```bash
git add docs/guides/agent-creation.md
git commit -m "docs: add agent creation guide

Covers YAML frontmatter, tool declarations, model selection,
agent body structure, testing, and best practices."
```

---

## Task 8: Vue Converter Workflow Guide (P2)

**Files:**
- Create: `docs/guides/vue-converter.md`
- Reference: `.claude/agents/vue-converter.md`, `templates/vue/`, `docs/multi-framework/README.md`

**Step 1: Write the guide**

Write `docs/guides/vue-converter.md` covering:

1. **Overview** — How the pipeline generates Vue 3 components from Figma/Canva/screenshot sources
2. **When Vue Is Selected** — `outputTarget: "vue"` in build-spec.json, or auto-detected from `vue` in package.json
3. **The `vue-converter` Agent** — What it does, which tools it uses, how it reads build-spec and tokens
4. **Component Patterns** — `<script setup lang="ts">` with `defineProps`/`defineEmits`, Composition API, composables for reusable logic
5. **Styling** — Tailwind utility classes in `<template>`, design tokens mapped to Tailwind config
6. **Testing** — Vitest + @vue/test-utils, mounting components, testing props/emits/slots
7. **Template Files** — What `templates/vue/` provides: vite.config, tsconfig, vitest.config, tailwind.config
8. **Differences from React Pipeline** — No JSX (uses `<template>`), no hooks (uses composables), no className merging (Tailwind directly in template)
9. **Limitations** — Storybook support (Vue + Storybook available but less mature), no React-specific hooks

**Step 2: Commit**

```bash
git add docs/guides/vue-converter.md
git commit -m "docs: add Vue converter workflow guide

Covers Vue 3 pipeline specifics, Composition API patterns,
testing with vue/test-utils, and template files."
```

---

## Task 9: Svelte Converter Workflow Guide (P2)

**Files:**
- Create: `docs/guides/svelte-converter.md`
- Reference: `.claude/agents/svelte-converter.md`, `templates/sveltekit/`, `docs/multi-framework/README.md`

**Step 1: Write the guide**

Write `docs/guides/svelte-converter.md` covering:

1. **Overview** — SvelteKit output from design sources
2. **When Svelte Is Selected** — `outputTarget: "svelte"` or auto-detected from `svelte.config.*`
3. **The `svelte-converter` Agent** — Capabilities and tools
4. **Component Patterns** — `.svelte` files with `<script lang="ts">`, Svelte 5 `$props()` rune (preferred) or Svelte 4 `export let`, reactive declarations
5. **SvelteKit Routes** — `+page.svelte`, `+layout.svelte`, `+page.server.ts` for server data
6. **Stores** — Writable and derived stores for shared state, equivalent to React context/Zustand
7. **Styling** — Tailwind in markup, scoped styles in `<style>` blocks
8. **Testing** — Vitest + @testing-library/svelte
9. **Template Files** — What `templates/sveltekit/` provides
10. **Differences from React Pipeline** — No virtual DOM, no hooks (reactive declarations), built-in transitions/animations

**Step 2: Commit**

```bash
git add docs/guides/svelte-converter.md
git commit -m "docs: add Svelte converter workflow guide

Covers SvelteKit pipeline specifics, Svelte 5 runes,
store patterns, and testing with testing-library/svelte."
```

---

## Task 10: React Native Converter Workflow Guide (P2)

**Files:**
- Create: `docs/guides/react-native-converter.md`
- Reference: `.claude/agents/react-native-converter.md`, `templates/expo/`, `docs/multi-framework/README.md`

**Step 1: Write the guide**

Write `docs/guides/react-native-converter.md` covering:

1. **Overview** — Expo + React Native output from design sources
2. **When React Native Is Selected** — `outputTarget: "react-native"` or auto-detected from `app.json` with Expo config
3. **The `react-native-converter` Agent** — Capabilities, NativeWind integration
4. **NativeWind Setup** — Tailwind CSS for React Native via NativeWind, `className` prop, how tokens map
5. **Component Patterns** — `View`/`Text`/`Image`/`Pressable`/`ScrollView` primitives, no HTML elements
6. **Key Differences from Web React** — No `onClick` (use `onPress`), no CSS media queries (use `useWindowDimensions`), platform-specific shadows, no CSS grid (use flexbox)
7. **Navigation** — Expo Router for file-based routing
8. **Testing** — Jest + @testing-library/react-native (not Vitest)
9. **E2E Testing** — Detox or Maestro instead of Playwright
10. **Template Files** — What `templates/expo/` provides: app.json, babel.config, jest.config, nativewind setup
11. **Pipeline Differences** — Storybook skipped, cross-browser skipped (simulator testing instead), Lighthouse skipped

**Step 2: Commit**

```bash
git add docs/guides/react-native-converter.md
git commit -m "docs: add React Native converter workflow guide

Covers Expo pipeline specifics, NativeWind setup,
native primitives, and testing with react-native-testing-library."
```

---

## Task 11: Chrome Extension Pipeline Guide (P2)

**Files:**
- Create: `docs/guides/chrome-extension.md`
- Reference: `templates/chrome-extension/`, `.claude/pipeline.config.json` (appTypes.chrome-extension)

**Step 1: Write the guide**

Write `docs/guides/chrome-extension.md` covering:

1. **Overview** — Building Chrome extensions with Manifest v3 through the pipeline
2. **App Type Configuration** — Set `appType: "chrome-extension"` in build-spec.json. Pipeline auto-configures E2E strategy
3. **Manifest v3** — Required fields, permissions, service worker entry, content scripts
4. **Service Worker Testing** — How to test background scripts, message passing
5. **Extension E2E with Playwright** — Persistent context with `--load-extension`, `templates/chrome-extension/` fixtures. Example:
   ```typescript
   const context = await chromium.launchPersistentContext('', {
     args: [`--load-extension=${extensionPath}`]
   });
   ```
6. **Popup and Content Script Testing** — Navigating to `chrome-extension://<id>/popup.html`, interacting with injected content scripts
7. **Firefox Support** — `templates/chrome-extension/playwright-firefox.fixture.ts` for cross-browser extension testing
8. **Template Files** — What `templates/chrome-extension/` provides
9. **Pipeline Differences** — No Lighthouse (not a web page), custom E2E fixtures, manifest validation step
10. **Troubleshooting** — "Extension not loading in Playwright" (check manifest path), "Service worker not registering" (check Manifest v3 syntax)

**Step 2: Commit**

```bash
git add docs/guides/chrome-extension.md
git commit -m "docs: add Chrome extension pipeline guide

Covers Manifest v3, service worker testing, Playwright
persistent context for extension E2E, and Firefox support."
```

---

## Task 12: PWA Pipeline Guide (P2)

**Files:**
- Create: `docs/guides/pwa.md`
- Reference: `templates/pwa/`, `.claude/pipeline.config.json` (appTypes.pwa)

**Step 1: Write the guide**

Write `docs/guides/pwa.md` covering:

1. **Overview** — Building Progressive Web Apps through the pipeline
2. **App Type Configuration** — Set `appType: "pwa"` in build-spec.json
3. **Service Worker Lifecycle** — Registration, install, activate, fetch events. How the pipeline generates a service worker
4. **Offline Testing** — Playwright network emulation, testing offline fallback pages. Template: `templates/pwa/`
5. **Web App Manifest** — Required fields: `name`, `short_name`, `start_url`, `display`, `icons`. Validation checks
6. **Installability** — What makes a PWA installable, how the pipeline verifies installability criteria
7. **Caching Strategy** — Cache-first for assets, network-first for API calls (configurable)
8. **Template Files** — What `templates/pwa/` provides: Playwright config, E2E test files for offline/install flows
9. **Lighthouse PWA Audit** — Thresholds from pipeline.config.json, what the audit checks
10. **Pipeline Differences** — Additional Lighthouse PWA category, service worker validation step, offline E2E tests
11. **Troubleshooting** — "Service worker not registering" (check HTTPS/localhost), "Offline page not loading" (check cache strategy), "Not installable" (check manifest)

**Step 2: Commit**

```bash
git add docs/guides/pwa.md
git commit -m "docs: add PWA pipeline guide

Covers service worker lifecycle, offline testing, manifest
validation, caching strategies, and Lighthouse PWA audit."
```

---

## Task 13: Link Guides from Onboarding Docs and CLAUDE.md

**Files:**
- Modify: `docs/onboarding/README.md`
- Modify: `docs/onboarding/quickstart.md`

**Step 1: Add guides section to onboarding README**

In `docs/onboarding/README.md`, add a new row to the Documentation Map table:

```markdown
| [Framework Guides](../guides/README.md) | Deep dives into design tokens, visual QA, caching, hooks, error recovery, agent creation, and framework-specific workflows |
```

**Step 2: Add "Next Steps" links to quickstart**

In `docs/onboarding/quickstart.md`, in the "Next Steps" section at the bottom, add:

```markdown
- Browse the [Framework Guides](../guides/README.md) for deep dives into design tokens, visual QA, caching, hooks, and more
```

**Step 3: Commit**

```bash
git add docs/onboarding/README.md docs/onboarding/quickstart.md
git commit -m "docs: link guides from onboarding documentation

Adds Framework Guides to the documentation map and quickstart
next steps section for discoverability."
```

---

## Summary

| Task | Guide | Priority | Est. Lines |
|------|-------|----------|-----------|
| 1 | Guides index (`README.md`) | Setup | ~30 |
| 2 | Design Token System | P0 | ~150 |
| 3 | Visual QA Deep Dive | P0 | ~200 |
| 4 | Pipeline Caching & Performance | P0 | ~180 |
| 5 | Hook System | P1 | ~150 |
| 6 | Error Recovery | P1 | ~160 |
| 7 | Agent Creation | P1 | ~170 |
| 8 | Vue Converter Workflow | P2 | ~100 |
| 9 | Svelte Converter Workflow | P2 | ~100 |
| 10 | React Native Converter Workflow | P2 | ~120 |
| 11 | Chrome Extension Pipeline | P2 | ~110 |
| 12 | PWA Pipeline | P2 | ~110 |
| 13 | Link from onboarding docs | Final | ~10 |

**Total: 13 tasks, 13 commits, ~1,590 lines of documentation**
