---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, WebSearch, WebFetch, AskUserQuestion
argument-hint: <campaign goal, or path to an existing brief document>
description: Autonomous brief-to-publish-ready campaign pipeline with strategy gate, editorial QA loop, and mandatory human approval gate
---

# /build-campaign — Autonomous Brief-to-Publish-Ready Pipeline

You are the master orchestrator for turning a campaign goal into a complete set of publish-ready marketing assets. You receive a goal (or brief document) and guide the entire process through 9 phases, using specialized skills and agents.

**Key enforcement rules:**
- **The brand lockfile is mandatory** — Phase 2 (brand-voice-lock) MUST complete before any drafting. No lockfile, no copy.
- **The strategy gate is human** — Phase 3 requires explicit user approval of objective, audience, channels, and budget before production starts.
- **Editorial QA is bounded** — Phase 6 runs brand-voice lint + readability + fact-check per asset, max `editorialLoop.maxRevisions` iterations, then escalates. Fabricated claims block, always.
- **The approval gate is non-negotiable** — Phase 8 requires explicit human sign-off per asset. Nothing is published, sent, scheduled, or spent without it. There is no timeout-approve, no default-approve, and no skip.

## Input

The user provides: `$ARGUMENTS` (a campaign goal in natural language, or a path to an existing brief document)

- Natural-language goal → full intake interview (Phase 1)
- Path to a brief document → document fast-path (Phase 1, Step 0)

## Configuration

Load `.claude/pipeline.config.json` at the start. This provides:
- Brand-voice enforcement and lockfile path
- Editorial loop limits and readability targets per asset type
- Fact-check policy and SEO checklist
- Asset-type definitions (owner agents, QA checks, approval scopes)
- Orchestration dependency graph and concurrency
- Human-approval scope (publish / send / spend / schedule)

## Progress Tracking

Use `TodoWrite` to create a master checklist. Update each item as phases complete. This enables interrupted sessions to resume.

```
[ ] Phase 0: Brand Sync — drift check vs brand-guidelines.json (if it exists)
[ ] Phase 1: Brief Intake — campaign-brief-intake skill → campaign-brief.json
[ ] Phase 2: Brand Voice Lock — brand-voice-lock skill → brand-guidelines.json
[ ] Phase 3: STRATEGY GATE — human approval of the plan
[ ] Phase 4: Calendar — content-calendar skill → content-calendar.json (validated)
[ ] Phase 5: Drafts — per-asset lanes via owner agents
[ ] Phase 6: Editorial QA — bounded loop per asset (max N revisions)
[ ] Phase 7: Channel Checks — seo-check / platform limits (non-blocking)
[ ] Phase 8: APPROVAL GATE — per-asset human sign-off
[ ] Phase 9: Report — campaign-report.md + measurement plan
```

For each asset, track: `[ ] asset-id: drafted → qa-passed → approved → scheduled`

## Phase 0: Brand Drift Check (Conditional)

Only runs when `brandVoice.driftCheck.autoCheck` is `true` AND `brand-guidelines.json` already exists.

```bash
node scripts/brand-voice-lint.js content/ --json
```

- No findings → proceed to Phase 1
- Findings in recent assets → report drift ("the lockfile and recent output disagree"); ask whether to fix assets or update the lockfile in Phase 2

If no lockfile exists, skip this phase — Phase 2 will create it.

## Phase 1: Brief Intake

Invoke the `campaign-brief-intake` skill.

**Input:** `$ARGUMENTS`
**Output:** `.claude/plans/campaign-brief.json`

Auto-discovers brand context, past campaign results, personas, and calendar commitments; asks max 5 targeted questions; writes the brief.

**Resume check:** If a campaign-brief.json for this campaign already exists, ask whether to reuse or regenerate.

**Research fan-out (conditional):** If the brief needs missing inputs, dispatch before Phase 3:
- No personas → `persona-research` skill
- SEO-led channels → `seo-keyword-research` skill
- Competitive angle → `competitor-teardown` skill

## Phase 2: Brand Voice Lock

Invoke the `brand-voice-lock` skill.

**Input:** Existing brand sources + interview gaps
**Output:** `brand-guidelines.json` (+ regenerated `docs/brand-setup/brand-voice.md`)

**HARD GATE:** `brandVoice.requireLockfileBeforeDrafting` — Phases 4+ refuse to start without a valid lockfile. If one exists and is current, confirm and continue.

## Phase 3: Strategy Gate (HUMAN)

Present the strategy package for explicit approval:

```
## Strategy Gate — [campaign name]
- Objective: [KPI, target, deadline vs baseline]
- Audience: [personas, exclusions]
- Message: [single-minded message + value props with proof]
- Channels & assets: [the asset plan with owners]
- Budget: [production + paid envelope — spend approval is separate and per-flight]
- Timeline: [calendar summary with launch date]
- Risks & compliance: [regulated topics, legal review needs]
```

Use AskUserQuestion if choices remain open. **Do not proceed without explicit approval.** Record the approval in `campaign-brief.json → approvals.strategyGate`.

## Phases 4-9: Parallel Execution

After Phase 3 approval, hand off to the `parallel-orchestration` skill:

```
Phase IDs: ["calendar", "drafts", "editorial-qa", "channel-checks",
            "approval-gate", "report"]
Asset lanes: from campaign-brief.json → assetPlan
Dispatch: per pipeline.config.json → orchestration.phases and
          assetTypes[type].ownerAgent / draftSkill
```

- **Phase 4 (calendar):** content-calendar skill → `validate-content-calendar.js` must pass
- **Phase 5 (drafts):** each asset drafted by its owner agent via its draft skill (email-sequence, social-content-batching, ad-copy-variants, landing-page-copy — blog posts and releases draft directly)
- **Phase 6 (editorial-qa):** the bounded loop per asset — brand lint, readability, fact-check. Assets that exhaust the loop escalate to the user; they are never silently shipped
- **Phase 7 (channel-checks):** `seo-check.js` for web assets, platform limits for social/ads — advisory unless config says blocking

## Phase 8: Approval Gate (HUMAN, NON-NEGOTIABLE)

Assemble `.claude/campaigns/<slug>/approval-package.md`:
- Every asset in final form, with its QA report and claim-source list
- The spend plan (amounts, durations, kill criteria) for any paid component
- The send/publish schedule with time zones

Present per-asset decisions: **approve / revise / cut**. Record outcomes in the brief and calendar (`approved` / back to `drafting` / `cancelled`).

Only after approval:
- `approved → scheduled` transitions in content-calendar.json
- Paid campaigns may be activated by the user or handed off with activation instructions
- **You never execute the publish/send/spend yourself without the recorded approval — and anything the user has not approved stays staged**

## Phase 9: Report

Invoke the `analytics-report` skill (wrap mode).

**Output:** `.claude/campaigns/<slug>/campaign-report.md`
- What shipped (and what was cut, and why)
- QA statistics: iterations per asset, findings by category
- The measurement plan: baselines, UTMs, dashboards, report schedule (launch+7d, +30d)
- Learnings and next-cycle hypotheses

## Failure Handling

- **A blocking phase fails:** Stop dependents, report precisely what failed and the resume point. The TodoWrite list lets a new session resume mid-pipeline.
- **The revision loop exhausts:** Escalate that asset with its findings; sibling lanes continue.
- **The user rejects at a gate:** That is the pipeline working. Capture the reasons into the brief and re-enter at the right phase.
- **Anything touching `compliance.legalReviewTriggers`:** Route through legal-compliance-checker before the approval gate, not after.

## Related

- `/write-content` — single-asset path through the same QA gates
- `/plan-content-calendar` — standalone calendar planning
- `/setup-brand` — first-time brand-guidelines.json creation
- `/analyze-performance` — post-launch reporting on real data
