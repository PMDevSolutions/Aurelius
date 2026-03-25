# Parallel Agent Orchestration Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a parallel orchestration layer that runs independent pipeline phases concurrently, reducing total pipeline wall-clock time by 2-3x.

**Architecture:** A declarative dependency graph in `pipeline.config.json` defines phase ordering, resource constraints, and concurrency limits. A new `parallel-orchestration` skill reads the graph and dispatches phases as background agents, respecting dependencies and resource contention. Pipeline commands (`build-from-figma`, etc.) delegate post-build phases to this skill instead of running them sequentially.

**Tech Stack:** Claude Code Agent tool (background execution), pipeline.config.json (declarative config), SKILL.md (orchestration logic)

---

## Design Decisions

### Dependency Graph (Declarative, in pipeline.config.json)

Each phase declares:
- `depends` — phase IDs that must complete first
- `resources` — tagged mutex keys (string = exclusive, object with `mode: "shared"` = concurrent reads OK)
- `blocking` — whether failure halts dependents (default: true)

### Concurrent Runner (Skill)

Algorithm:
1. Parse orchestration config
2. Build DAG from dependencies
3. Loop until all phases resolved:
   a. Find phases with all dependencies satisfied
   b. Filter by resource availability
   c. Respect `maxConcurrent` limit
   d. Dispatch eligible phases as background agents
   e. On completion: release resources, report result, re-evaluate ready phases
4. Produce batch summary

### Resource Contention

Lightweight tag-based model:
- Exclusive resources (default): only one phase at a time
- Shared resources (`mode: "shared"`): concurrent access OK (e.g., reading from dev server)
- Empty resources `[]`: read-only, always runs freely

### Concurrency Pool

Configurable `maxConcurrent` (default: 3). Phases queue when pool is full.

### Reporting

- Streaming: each phase reports as it completes
- Batch summary: wall time vs sequential estimate, speedup factor
- Integrates into existing build-report.md

## Parallelization Opportunities

After `component-build` completes, this graph fans out:

```
                    component-build
                   /    |    |    \     \        \
            storybook  visual  dark  cross   quality   responsive
              (nb)     -diff   mode  browser  -gate     (nb)
                         |     (nb)   (nb)      |
                       e2e                    report
                         \                   /
                          -----> report <----
```

(nb) = non-blocking

Quality gate itself parallelizes internally:
```
quality-gate → [coverage, typecheck, build, token-verify, lighthouse] → aggregate
```

## Estimated Speedup

Sequential (current): ~71s for phases 4.5-8.5
Parallel (maxConcurrent=3): ~23s estimated (bounded by slowest critical path: visual-diff → e2e)
Speedup: ~3.1x

---

## Implementation Plan

### Task 1: Add orchestration config to pipeline.config.json

**Files:**
- Modify: `.claude/pipeline.config.json`

**Step 1: Read the current config**

Verify the file structure and find the insertion point (after the last top-level key).

**Step 2: Add the orchestration key**

Add this new top-level key to `pipeline.config.json`:

```json
"orchestration": {
  "enabled": true,
  "maxConcurrent": 3,
  "phases": {
    "token-sync": {
      "depends": [],
      "resources": ["filesystem:tokens"],
      "blocking": true,
      "description": "Check for token drift against lockfile"
    },
    "intake": {
      "depends": ["token-sync"],
      "resources": ["filesystem:build-spec"],
      "blocking": true,
      "description": "Discover design structure and create build spec"
    },
    "token-lock": {
      "depends": ["intake"],
      "resources": ["filesystem:tokens"],
      "blocking": true,
      "description": "Extract and lock design tokens"
    },
    "tdd-scaffold": {
      "depends": ["token-lock"],
      "resources": ["filesystem:src", "filesystem:tests"],
      "blocking": true,
      "description": "Write failing tests for all components (RED phase)"
    },
    "component-build": {
      "depends": ["tdd-scaffold"],
      "resources": ["filesystem:src", { "name": "port:dev-server", "mode": "shared" }],
      "blocking": true,
      "description": "Build components to pass tests (GREEN phase)"
    },
    "storybook": {
      "depends": ["component-build"],
      "resources": ["filesystem:stories"],
      "blocking": false,
      "description": "Auto-generate Storybook stories"
    },
    "visual-diff": {
      "depends": ["component-build"],
      "resources": [{ "name": "port:dev-server", "mode": "shared" }],
      "blocking": true,
      "description": "Pixel-diff visual verification loop"
    },
    "dark-mode": {
      "depends": ["component-build"],
      "resources": [{ "name": "port:dev-server", "mode": "shared" }],
      "blocking": false,
      "description": "Dark mode screenshot comparison"
    },
    "e2e-tests": {
      "depends": ["visual-diff"],
      "resources": [{ "name": "port:dev-server", "mode": "shared" }],
      "blocking": true,
      "description": "Generate and run Playwright E2E tests"
    },
    "cross-browser": {
      "depends": ["component-build"],
      "resources": [],
      "blocking": false,
      "description": "Firefox and WebKit screenshot comparison"
    },
    "quality-gate": {
      "depends": ["component-build"],
      "resources": [],
      "blocking": true,
      "description": "Coverage, types, build, tokens, Lighthouse checks"
    },
    "responsive": {
      "depends": ["component-build"],
      "resources": [],
      "blocking": false,
      "description": "Responsive screenshots at 5 breakpoints"
    },
    "report": {
      "depends": ["quality-gate", "e2e-tests"],
      "resources": ["filesystem:report"],
      "blocking": true,
      "description": "Generate build report with all results"
    }
  },
  "qualityGateSubtasks": {
    "coverage": {
      "resources": [],
      "description": "Run vitest with coverage, check 80% threshold"
    },
    "typecheck": {
      "resources": [],
      "description": "Run tsc --noEmit"
    },
    "build": {
      "resources": [{ "name": "port:build", "mode": "shared" }],
      "description": "Run pnpm build"
    },
    "token-verify": {
      "resources": ["filesystem:tokens"],
      "description": "Run verify-tokens.sh"
    },
    "lighthouse": {
      "resources": [{ "name": "port:dev-server", "mode": "shared" }],
      "description": "Run Lighthouse audit per page"
    }
  },
  "reporting": {
    "showStreamingResults": true,
    "showBatchSummary": true,
    "showSpeedupEstimate": true,
    "includeTimeline": true
  }
}
```

**Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/pipeline.config.json','utf8')); console.log('Valid JSON')"`
Expected: "Valid JSON"

**Step 4: Commit**

```bash
git add .claude/pipeline.config.json
git commit -m "feat: add orchestration dependency graph to pipeline config"
```

---

### Task 2: Create the parallel-orchestration skill

**Files:**
- Create: `.claude/skills/parallel-orchestration/SKILL.md`

**Step 1: Create the skill directory**

```bash
mkdir -p .claude/skills/parallel-orchestration
```

**Step 2: Write the skill file**

Create `.claude/skills/parallel-orchestration/SKILL.md` with the full orchestration logic:

```markdown
---
name: parallel-orchestration
description: Concurrent phase runner that dispatches independent pipeline phases in parallel, respecting dependency graphs and resource constraints
globs:
  - ".claude/pipeline.config.json"
  - ".claude/commands/build-from-*.md"
---

# Parallel Orchestration

## Overview

You are a concurrent phase scheduler. Given a set of phases to execute, their dependency graph, and resource constraints from `pipeline.config.json`, you dispatch independent phases in parallel using background agents while respecting ordering and concurrency limits.

## When to Use

This skill is invoked by pipeline commands (`/build-from-figma`, `/build-from-canva`, `/build-from-screenshot`) after the sequential early phases (0-3) complete. It handles phases 4 onward where the dependency graph fans out.

It can also be invoked standalone for any set of independent tasks.

## Input

You receive:
- A list of phase IDs to execute (e.g., `["component-build", "storybook", "visual-diff", ...]`)
- Context from earlier phases (build-spec.json, lockfile, test files)
- The pipeline config at `.claude/pipeline.config.json`

## Algorithm

### 1. Load Configuration

Read `.claude/pipeline.config.json` and extract the `orchestration` section:
- `maxConcurrent` — max simultaneous agents (default: 3)
- `phases` — dependency graph with resources and blocking flags
- `qualityGateSubtasks` — sub-phases within quality-gate
- `reporting` — output preferences

### 2. Build Execution State

Initialize a state tracker for all requested phases:

```
For each phase in requested phases:
  state[phase] = {
    status: "pending",      // pending | running | completed | failed | skipped
    startTime: null,
    endTime: null,
    result: null,
    agentId: null
  }
```

### 3. Scheduling Loop

```
WHILE any phase has status "pending" or "running":

  // Find ready phases
  ready = phases WHERE:
    - status == "pending"
    - ALL dependencies have status "completed"
    - NO resource conflict with currently "running" phases
      (resource conflict = both phases use same exclusive resource)

  // Respect concurrency limit
  running_count = count of phases with status "running"
  available_slots = maxConcurrent - running_count
  to_dispatch = ready[0..available_slots]

  // Dispatch phases
  FOR EACH phase IN to_dispatch:
    agent = dispatch_phase_agent(phase)
    state[phase].status = "running"
    state[phase].startTime = now()
    state[phase].agentId = agent.id

  // Wait for any running phase to complete
  // (Claude Code notifies when background agents finish)
  completed_phase = wait_for_next_completion()

  // Process completion
  state[completed_phase].endTime = now()
  IF agent returned success:
    state[completed_phase].status = "completed"
    state[completed_phase].result = agent.result
    REPORT: "[PASS] {phase} ({duration}s)"
  ELSE:
    state[completed_phase].status = "failed"
    state[completed_phase].result = agent.error
    IF phase.blocking:
      REPORT: "[FAIL] {phase} ({duration}s) — BLOCKING"
      // Mark all transitive dependents as "skipped"
      FOR dep IN transitive_dependents(phase):
        state[dep].status = "skipped"
        REPORT: "[SKIP] {dep} — dependency {phase} failed"
    ELSE:
      REPORT: "[WARN] {phase} ({duration}s) — non-blocking, continuing"
```

### 4. Resource Conflict Check

Two phases conflict if they share any exclusive resource:

```
conflicts(phase_a, phase_b):
  resources_a = get_exclusive_resources(phase_a)
  resources_b = get_exclusive_resources(phase_b)
  RETURN intersection(resources_a, resources_b) is not empty

get_exclusive_resources(phase):
  RETURN [r for r in phase.resources
          WHERE r is string                    // string = exclusive
          OR (r is object AND r.mode != "shared")]
```

Shared resources (objects with `mode: "shared"`) never conflict.

### 5. Phase Dispatch

Each phase maps to a specific agent or script invocation. Use the Agent tool with `run_in_background: true` for parallel execution:

| Phase | Dispatch |
|-------|----------|
| component-build | Agent: figma-to-react-workflow skill (or framework-specific converter) |
| storybook | Bash: `./scripts/generate-stories.sh` |
| visual-diff | Agent: visual-qa-verification skill with pixel-diff loop |
| dark-mode | Bash: `./scripts/check-dark-mode.sh http://localhost:3000` |
| e2e-tests | Agent: e2e-test-generator skill |
| cross-browser | Bash: `./scripts/cross-browser-test.sh firefox && ./scripts/cross-browser-test.sh webkit` |
| quality-gate | Parallel sub-dispatch (see below) |
| responsive | Bash: `./scripts/check-responsive.sh` |
| report | Agent: generate build-report.md from all collected results |

### 6. Quality Gate Sub-Parallelization

When the `quality-gate` phase is dispatched, it internally parallelizes its subtasks using the same algorithm:

```
Subtasks (all independent, from qualityGateSubtasks config):
  - coverage:     pnpm vitest run --coverage
  - typecheck:    pnpm tsc --noEmit
  - build:        pnpm build
  - token-verify: ./scripts/verify-tokens.sh
  - lighthouse:   Chrome DevTools MCP lighthouse_audit

Dispatch up to maxConcurrent subtasks in parallel.
Aggregate: ALL must pass for quality-gate to pass.
```

### 7. Batch Summary

After all phases resolve, output:

```
── Parallel Execution Summary ────────────────────
  Phases: N total, X passed, Y failed, Z skipped
  Wall time: Xs
  Estimated sequential time: Ys
  Speedup: Z.Zx

  Timeline:
  0s   [====component-build====]
  12s       [==storybook==] [===visual-diff===] [=dark-mode=]
  15s       [==cross-browser==] [===quality-gate===]
  20s                           [==e2e-tests==]
  25s                                              [=report=]

  Failures:
  - [WARN] dark-mode: no dark styles detected (non-blocking)
──────────────────────────────────────────────────
```

## Standalone Usage

This skill can be invoked directly for ad-hoc parallel work:

```
Run these tasks in parallel (max 3 concurrent):
1. pnpm vitest run --coverage
2. pnpm tsc --noEmit
3. ./scripts/verify-tokens.sh
4. ./scripts/check-accessibility.sh
```

The skill will dispatch each as a background agent, respect the concurrency limit, and report results as they complete.

## Error Handling

- **Agent crash:** Mark phase as failed. If blocking, skip dependents.
- **Timeout:** If a phase runs longer than 5 minutes with no output, log a warning. Do not auto-kill — some phases (visual-diff loop) legitimately take time.
- **Resource deadlock:** Cannot occur because resources are only held while a phase runs, and the DAG is acyclic.
- **All phases skipped:** If a blocking failure causes all remaining phases to skip, report the root cause prominently.

## Integration with Pipeline Commands

Pipeline commands invoke this skill like:

```
After completing phases 0-3 sequentially:

Invoke the parallel-orchestration skill with:
- Phases to run: ["component-build", "storybook", "visual-diff", "dark-mode",
                   "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]
- Context: build-spec.json path, lockfile path, test file locations
- Pipeline source: "figma" | "canva" | "screenshot"
```

The skill handles all scheduling, dispatching, result collection, and reporting.
```

**Step 3: Commit**

```bash
git add .claude/skills/parallel-orchestration/SKILL.md
git commit -m "feat: add parallel-orchestration skill for concurrent phase execution"
```

---

### Task 3: Update build-from-figma command

**Files:**
- Modify: `.claude/commands/build-from-figma.md`

**Step 1: Read the current command file**

Identify the section after Phase 3 where sequential execution begins.

**Step 2: Add parallel orchestration section**

After Phase 3 (TDD Scaffold), replace the sequential phases 4-9 with a parallel orchestration handoff. Keep the existing phase descriptions as documentation but add a new section:

Insert after Phase 3 section, before Phase 4:

```markdown
## Phases 4-9: Parallel Execution

After Phase 3 completes (TDD scaffold with failing tests confirmed), hand off remaining phases to the parallel orchestration skill.

**Invoke the `parallel-orchestration` skill with:**
- Phases to run: `["component-build", "storybook", "visual-diff", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.tsx`
  - Pipeline source: `"figma"`
  - Figma screenshots: `.claude/visual-qa/screenshots/figma/`
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Start `component-build` first (all other phases depend on it)
2. After build completes, fan out independent phases in parallel (max 3 concurrent)
3. Run `e2e-tests` after `visual-diff` completes
4. Run `report` after both `quality-gate` and `e2e-tests` complete
5. Stream results as each phase completes
6. Produce a batch summary with speedup metrics

**Fallback:** If `orchestration.enabled` is `false` in pipeline.config.json, execute phases 4-9 sequentially as documented below.

The individual phase descriptions below serve as reference for what each phase does. The parallel orchestration skill dispatches the same agents, skills, and scripts — it only changes the execution order.
```

**Step 3: Commit**

```bash
git add .claude/commands/build-from-figma.md
git commit -m "feat: integrate parallel orchestration into build-from-figma pipeline"
```

---

### Task 4: Update build-from-canva command

**Files:**
- Modify: `.claude/commands/build-from-canva.md`

**Step 1: Read the current command file**

**Step 2: Add the same parallel orchestration section after Phase 3**

Insert after Phase 3, before Phase 4. Same structure as Task 3 but with Canva-specific context:

```markdown
## Phases 4-9: Parallel Execution

After Phase 3 completes (TDD scaffold with failing tests confirmed), hand off remaining phases to the parallel orchestration skill.

**Invoke the `parallel-orchestration` skill with:**
- Phases to run: `["component-build", "storybook", "visual-diff", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.tsx`
  - Pipeline source: `"canva"`
  - Reference screenshots: `.claude/visual-qa/screenshots/canva/`
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Start `component-build` first (dispatches `canva-react-converter` agent)
2. After build completes, fan out independent phases in parallel (max 3 concurrent)
3. Run `e2e-tests` after `visual-diff` completes
4. Run `report` after both `quality-gate` and `e2e-tests` complete
5. Stream results as each phase completes
6. Produce a batch summary with speedup metrics

**Fallback:** If `orchestration.enabled` is `false` in pipeline.config.json, execute phases 4-9 sequentially as documented below.

The individual phase descriptions below serve as reference for what each phase does. The parallel orchestration skill dispatches the same agents, skills, and scripts — it only changes the execution order.
```

**Step 3: Commit**

```bash
git add .claude/commands/build-from-canva.md
git commit -m "feat: integrate parallel orchestration into build-from-canva pipeline"
```

---

### Task 5: Update build-from-screenshot command

**Files:**
- Modify: `.claude/commands/build-from-screenshot.md`

**Step 1: Read the current command file**

**Step 2: Add the same parallel orchestration section after Phase 3**

Insert after Phase 3, before Phase 4. Same structure but with screenshot-specific context and output-target awareness:

```markdown
## Phases 4-9: Parallel Execution

After Phase 3 completes (TDD scaffold with failing tests confirmed), hand off remaining phases to the parallel orchestration skill.

**Read `build-spec.json` to determine `outputTarget` before dispatching.**

**Invoke the `parallel-orchestration` skill with:**
- Phases to run: `["component-build", "storybook", "visual-diff", "dark-mode", "e2e-tests", "cross-browser", "quality-gate", "responsive", "report"]`
  - For `react-native` outputTarget: exclude `visual-diff`, `dark-mode`, `cross-browser`, `responsive`
  - For `chrome-extension` appType: exclude `cross-browser`
- Context:
  - Build spec: `.claude/plans/build-spec.json`
  - Lockfile: `src/styles/design-tokens.lock.json`
  - Test files: `src/components/**/*.test.*`
  - Pipeline source: `"screenshot"`
  - Output target: from `build-spec.json.outputTarget`
  - Reference screenshots: `.claude/visual-qa/screenshots/source/`
- Config: `.claude/pipeline.config.json` → `orchestration` section

The parallel orchestration skill will:
1. Start `component-build` first (dispatches the correct converter agent per outputTarget)
2. After build completes, fan out independent phases in parallel (max 3 concurrent)
3. Run `e2e-tests` after `visual-diff` completes (or after `component-build` if visual-diff excluded)
4. Run `report` after both `quality-gate` and `e2e-tests` complete
5. Stream results as each phase completes
6. Produce a batch summary with speedup metrics

**Fallback:** If `orchestration.enabled` is `false` in pipeline.config.json, execute phases 4-9 sequentially as documented below.

The individual phase descriptions below serve as reference for what each phase does. The parallel orchestration skill dispatches the same agents, skills, and scripts — it only changes the execution order.
```

**Step 3: Commit**

```bash
git add .claude/commands/build-from-screenshot.md
git commit -m "feat: integrate parallel orchestration into build-from-screenshot pipeline"
```

---

### Task 6: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Read current CLAUDE.md**

Find the pipeline section and skills table.

**Step 2: Update the skills table**

Add the new skill to the skills table:

```markdown
| parallel-orchestration | Concurrent phase runner for pipeline parallelization | Invoked by pipeline commands after Phase 3 |
```

Update the skill count from 18 to 19.

**Step 3: Update the pipeline diagram**

Replace the sequential phase listing with the parallel execution diagram:

```
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

**Step 4: Add orchestration section to Architecture & Configuration**

Add a new subsection:

```markdown
### Parallel Orchestration

Pipeline phases 4-9 run concurrently via the `parallel-orchestration` skill:
- **Dependency graph** defined in `pipeline.config.json` → `orchestration.phases`
- **Concurrency pool** with configurable `maxConcurrent` (default: 3)
- **Resource tagging** prevents write conflicts between phases
- **Streaming results** report each phase as it completes
- **Batch summary** with wall time, speedup factor, and execution timeline
- **Fallback** to sequential execution when `orchestration.enabled` is `false`

Quality gate subtasks (coverage, typecheck, build, token-verify, lighthouse) also run in parallel.
```

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document parallel orchestration in CLAUDE.md"
```

---

### Task 7: Final validation and summary commit

**Step 1: Validate all JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/pipeline.config.json','utf8')); console.log('pipeline.config.json: Valid')"
```

**Step 2: Verify file structure**

```bash
ls -la .claude/skills/parallel-orchestration/SKILL.md
```

**Step 3: Verify all files are committed**

```bash
git status
git log --oneline -10
```

Expected: clean working tree with 6 commits for this feature.
