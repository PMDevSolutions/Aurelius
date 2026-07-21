---
name: parallel-orchestration
description: Concurrent phase runner that dispatches independent campaign pipeline phases and per-asset lanes in parallel, respecting dependency graphs and resource constraints. Keywords: parallel orchestration, concurrent phases, dependency graph, asset lanes, pipeline speedup
globs:
  - ".claude/pipeline.config.json"
  - ".claude/commands/build-campaign.md"
---

# Parallel Orchestration — Concurrent Phase Runner

## Overview

A concurrent phase scheduler that dispatches independent campaign pipeline phases in parallel using background agents. It reads the phase dependency graph and resource constraints from `pipeline.config.json`, determines which phases can safely run concurrently, and schedules them up to the configured `maxConcurrent` limit. The unit of parallelism is the **asset lane**: each asset flows draft → editorial QA → channel checks independently, with a hard barrier at the human approval gate.

The scheduler produces real-time streaming output as phases start and finish, and a final batch summary with wall-clock timing, estimated sequential time, and speedup factor.

## When to Use

- **Pipeline invocation:** Called by `/build-campaign` after the sequential phases (0-3: brand-sync, brief-intake, brand-voice-lock, strategy-gate) complete. Phases 4+ are handed to this skill for parallel dispatch.
- **Standalone:** Any multi-asset production batch where assets are independent (e.g., calendar fills plus multiple `/write-content` runs).

## Input

1. **Phase IDs** — ordered list of phase IDs to execute (e.g., `["calendar", "drafts", "editorial-qa", "channel-checks", "approval-gate", "report"]`)
2. **Prior context** — artifacts from earlier sequential phases:
   - `campaign-brief.json` (objective, asset plan, approvals)
   - `brand-guidelines.json` (locked brand rules)
   - Strategy-gate approval record
3. **Pipeline config** — `.claude/pipeline.config.json`, specifically the `orchestration` section
4. **Asset plan** — `campaign-brief.json → assetPlan` (defines the lanes)

## Scheduling Model

### Phase-Level Graph

```
calendar         depends: [strategy-gate]   blocking: true
drafts           depends: [calendar]        blocking: true   (fans out per asset)
editorial-qa     depends: [drafts]*         blocking: true   (per-asset bounded loop)
channel-checks   depends: [drafts]*         blocking: false
approval-gate    depends: [editorial-qa, channel-checks]  blocking: true  (HUMAN)
report           depends: [approval-gate]   blocking: true

* per-asset: an asset enters editorial-qa as soon as ITS draft completes —
  no barrier waiting for all drafts (pipeline, not lockstep)
```

### Asset Lanes

```
Asset blog-01:  draft ──► editorial-qa (loop ≤5) ──► channel-checks ─┐
Asset email-01: draft ──► editorial-qa (loop ≤5) ──► channel-checks ─┼─► APPROVAL ─► report
Asset social-01:      draft ──► editorial-qa ──► channel-checks ─────┘     GATE
```

Lanes run concurrently up to `maxConcurrent`. The approval gate is the one true barrier: it waits for every lane, then presents the complete package to the human. Nothing overtakes the gate.

### Resource Tags

Phases declare resources to prevent write conflicts:

- `filesystem:calendar` — content-calendar.json writes (exclusive; calendar updates serialize)
- `filesystem:content` — asset files (per-asset paths, so lanes don't conflict)
- `filesystem:brief` — campaign-brief.json status updates (exclusive)
- `agent:<name>` — an owning agent drafting two assets works them sequentially within its lane capacity

Exclusive resources serialize; shared resources fan out. Two lanes writing different asset files proceed in parallel; two updates to the calendar queue.

### Dispatch Table

| Phase | Dispatch |
|-------|----------|
| `calendar` | content-calendar skill → `validate-content-calendar.js` |
| `drafts` | Per asset: the `ownerAgent` from the asset plan via its drafting skill (blog-writer, email-sequence, social-content-batching, ad-copy-variants, landing-page-copy) |
| `editorial-qa` | editorial-qa skill per asset — bounded loop (max from `editorialLoop.maxRevisions`) |
| `channel-checks` | `seo-check.js` / platform-limit checks per assetType (non-blocking WARNs) |
| `approval-gate` | STOP. Assemble the package (assets + QA reports + spend plan) and present to the human. Nothing proceeds until explicit approval per asset. |
| `report` | analytics-report skill → campaign-report.md (measurement plan + wrap) |

## Execution Rules

1. **Start order:** any phase whose `depends` are all complete (or pre-satisfied by the sequential block) starts immediately, up to `maxConcurrent`
2. **Per-asset progression:** within `drafts` → `editorial-qa` → `channel-checks`, assets advance independently the moment their previous stage completes
3. **Blocking phases** that fail stop their dependents; **non-blocking** phases report WARN and let dependents proceed
4. **The revision loop** counts per asset; an asset exhausting its loop escalates (per editorial-qa) without stalling other lanes
5. **The approval gate never auto-passes** — no timeout, no default-approve, no partial skip. Un-approved assets are withheld; approved ones proceed
6. **Failure isolation:** one asset's failure never cancels sibling lanes; the report lists per-lane outcomes

## Streaming Progress Format

Report each completion as it happens, then the batch summary:

```
 0s   [############] calendar             8s  PASS (12 entries validated)
 8s   [########]     draft:blog-01       41s  PASS
 8s   [######]       draft:email-01      29s  PASS
37s   [####]         qa:email-01         18s  PASS (iteration 2/5)
49s   [######]       qa:blog-01          22s  REVISE→PASS (iteration 3/5)
71s   [--]           channel:blog-01      4s  WARN (meta description long)
      ────────────────────────────────────────
      APPROVAL GATE: 4 assets ready — awaiting human review
      package: .claude/campaigns/<slug>/approval-package.md

Batch: 6 phases, 4 lanes · wall 75s vs 168s sequential (2.2× speedup)
```

## Error Handling

- **Circular dependency in config:** Abort with the cycle path; fix pipeline.config.json
- **Phase with unknown dispatch target:** Skip with ERROR in summary; never guess a dispatcher
- **Lane hung >5 minutes:** Warn, keep others flowing; warn again at 10 minutes (QA loops can be legitimately long)
- **Approval gate reached with zero passing assets:** Report the full failure set — the human decides next steps; the pipeline never fabricates a passing state
- **maxConcurrent misconfigured (<1):** Fall back to sequential execution and say so

## Handoff Example

```
Phase 0: brand-sync        -> completed (no drift)
Phase 1: brief-intake      -> completed (campaign-brief.json written)
Phase 2: brand-voice-lock  -> completed (brand-guidelines.json v1.2)
Phase 3: strategy-gate     -> APPROVED by user 2026-07-22

Handing off to parallel-orchestration:
  ["calendar", "drafts", "editorial-qa", "channel-checks",
   "approval-gate", "report"]
Asset lanes: blog-01, blog-02, email-01, social-01, ads-01
```

## Integration

- **Consumed by:** `/build-campaign` (Phases 4-9)
- **Uses:** `pipeline.config.json → orchestration`, campaign-brief.json assetPlan, all drafting skills, editorial-qa
- **Fallback:** `orchestration.enabled: false` → run the same phases sequentially in dependency order
