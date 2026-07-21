# Architecture Overview

This document explains how Maecenas is structured and how its components work together: agents, skills, commands, the campaign pipeline, scripts, hooks, templates, and MCP servers.

## The Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Slash Commands (.claude/commands/)                          │
│   /build-campaign  /write-content  /setup-brand  /seo-audit │
│   — orchestrators: parse input, sequence phases, hold gates │
├─────────────────────────────────────────────────────────────┤
│ Skills (.claude/skills/ — 13)                               │
│   campaign-brief-intake · brand-voice-lock · editorial-qa   │
│   — systematic workflows with defined inputs and artifacts  │
├─────────────────────────────────────────────────────────────┤
│ Agents (.claude/agents/ — 42)                               │
│   copywriter · seo-specialist · brand-compliance-checker …  │
│   — specialized personas that do the actual domain work     │
├─────────────────────────────────────────────────────────────┤
│ Scripts (scripts/)                                          │
│   brand-voice-lint · readability-score · seo-check ·        │
│   validate-content-calendar · verify-all                    │
│   — mechanical, deterministic enforcement                   │
├─────────────────────────────────────────────────────────────┤
│ Artifacts (the state layer)                                 │
│   brand-guidelines.json · campaign-brief.json ·             │
│   content-calendar.json · .claude/campaigns/<slug>/*        │
│   — versioned JSON/markdown; every phase reads and writes   │
│     these, never ad-hoc memory                              │
└─────────────────────────────────────────────────────────────┘
Configuration: .claude/pipeline.config.json (validated by JSON Schema)
Safety: 3 hooks (.claude/hooks/) + the human approval gate
```

## How a Campaign Flows

1. `/build-campaign <goal>` loads `pipeline.config.json` and starts a TodoWrite checklist (resumability).
2. **campaign-brief-intake** (skill) auto-discovers context, interviews you (max 5 questions), writes `campaign-brief.json`.
3. **brand-voice-lock** (skill) creates or confirms `brand-guidelines.json`. Hard gate: no lockfile → no drafting.
4. **Strategy gate** — a human decision point, recorded in the brief.
5. **parallel-orchestration** (skill) takes over with the dependency graph from config: calendar → per-asset lanes (draft → editorial-qa → channel-checks) → approval gate → report.
6. Each lane's drafting is done by the asset type's **owner agent** (from `assetTypes` config), possibly via a drafting skill (email-sequence, social-content-batching, ad-copy-variants, landing-page-copy).
7. **editorial-qa** (skill) runs the three checks per asset — `brand-voice-lint.js` (mechanical), `readability-score.js` (mechanical), fact-check (editorial, with brand-compliance-checker) — looping at most `editorialLoop.maxRevisions` times.
8. The **approval gate** assembles `approval-package.md` and stops. Humans approve per asset; outcomes are recorded.
9. **analytics-report** (skill) writes the wrap report and measurement plan.

## Agents (42)

Ten categories: Strategy & Research (5), Content (7), Channel (9), Lifecycle & Growth (4), Analytics & Operations (5), Creative Direction (2), Insights & Planning (4), Operations & Support (2), Meta (2), Bonus (2).

Design rules:
- Each agent is one persona with Core Responsibilities, Expertise Areas, frameworks, campaign-cadence integration, and Key Metrics
- Agents that touch external actions (publish/send/spend) explicitly defer to the approval gate
- Research agents (market-researcher, competitive-analyst) are bound by sourcing rules: no fabrication, inference labeled as inference

Catalog: [`.claude/CUSTOM-AGENTS-GUIDE.md`](../../.claude/CUSTOM-AGENTS-GUIDE.md)

## Skills (13)

Skills are documentation-driven workflows with declared inputs, processes, and artifacts. The three structural pillars:

| Skill | Analog in Aurelius | Job |
|-------|--------------------|-----|
| campaign-brief-intake | figma-intake | Interview → machine-readable plan |
| brand-voice-lock | design-token-lock | Rules → enforceable lockfile |
| editorial-qa | visual-qa-verification | Bounded fix loop before the gate |

Catalog: [`.claude/skills/README.md`](../../.claude/skills/README.md)

## The Artifact Contract

Every phase communicates through files, not conversation memory:

| Artifact | Written by | Read by |
|----------|-----------|---------|
| `brand-guidelines.json` | brand-voice-lock, /setup-brand | brand-voice-lint.js, editorial-qa, every drafting agent |
| `.claude/plans/campaign-brief.json` | campaign-brief-intake | calendar, drafts, QA, approval gate, report |
| `content-calendar.json` | content-calendar skill | validate-content-calendar.js, campaign-producer |
| `.claude/plans/keyword-plan.json` | seo-keyword-research | content briefs, seo-content-writer |
| `.claude/campaigns/<slug>/…` | QA loop, approval gate, report | humans, the next campaign's baseline |

This is what makes the pipeline resumable: a new session reads the artifacts and continues.

## Enforcement: Three Levels

1. **Schema level** — `pipeline.config.schema.json` pins the approval gate (`required`/`blocking` are `const: true`) and `factCheck.fabricationPolicy` (`const: "block"`). An edited config that weakens them fails validation.
2. **Mechanical level** — the lint/score/check scripts exit non-zero on violations; `verify-all.sh` aggregates them; CI runs them.
3. **Editorial level** — editorial-qa and brand-compliance-checker apply the judgment the scripts can't (tone drift, claim substance, fact-check verdicts).

## Hooks (3) and Safety

PostToolUse hooks on the Bash matcher: `pre-commit-brand-guard.sh` (lint staged content on commit), `editorial-qa-reminder.sh` (after a clean lint, remind about the other gates), `approval-gate-guard.sh` (warn when a command looks like an external publish/send/spend). All informational, always exit 0 — the hard stops live in the pipeline gates, not the hooks.

## MCP Servers

Only the **Canva AI Connector** is integrated (creative production; optional). Distribution connectors (Gmail, etc.) may be used *behind the approval gate* if the user connects them. Nothing in the framework requires an MCP server.

## Configuration

Everything tunable lives in `.claude/pipeline.config.json`, explained field by field in [pipeline-configuration.md](pipeline-configuration.md) and validated by `scripts/validate-pipeline-config.js` (schema + orchestration-graph checks).
