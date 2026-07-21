# Skills Catalog

**Last Updated:** 2026-07-21
**Total Skills:** 13
**Location:** `.claude/skills/`

Skills are documentation-based workflows that trigger automatically when relevant keywords appear in conversation. They provide systematic guidance, not tool integrations.

---

## Skills Index

### Campaign Pipeline Skills

These skills power the `/build-campaign` autonomous pipeline. They run in sequence (Phase 1 through Phase 9) but can also be invoked independently.

#### 1. campaign-brief-intake (Phase 1)
- **Purpose:** Structured interview that auto-discovers brand context, past performance, and existing assets, asks 3-5 targeted questions, and produces a `campaign-brief.json`
- **Triggers:** Phase 1 of `/build-campaign`, or any campaign-goal conversation
- **Output:** `.claude/plans/campaign-brief.json`

#### 2. brand-voice-lock (Phase 2)
- **Purpose:** Extracts voice, tone, lexicon, claims policy, and visual identity into the versioned `brand-guidelines.json` lockfile — the single source of truth every asset is checked against
- **Triggers:** Phase 2 of `/build-campaign`, `/setup-brand`, "brand guidelines", "tone of voice"
- **Output:** `brand-guidelines.json`, `docs/brand-setup/brand-voice.md`

#### 3. content-calendar (Phase 4)
- **Purpose:** Generates and maintains `content-calendar.json` — dated, channel-mapped, status-tracked slots with QA/approval lead times built in, validated by `validate-content-calendar.js`
- **Triggers:** Phase 4 of `/build-campaign`, `/plan-content-calendar`, "content calendar"
- **Output:** `content-calendar.json`

#### 4. editorial-qa (Phase 6)
- **Purpose:** Bounded revision loop (max 5 iterations) running brand-voice lint, readability scoring, and fact-check verification on every asset before the approval gate. The analog of the old pixel-diff loop.
- **Triggers:** Phase 6 of `/build-campaign`, `/write-content`, "review this content", "fact check"
- **Output:** Per-asset findings reports, `editorial-qa-report.md`, PASS/REVISE/ESCALATED verdicts

#### 5. parallel-orchestration (Phases 4-9)
- **Purpose:** Concurrent phase runner dispatching independent phases and per-asset lanes in parallel, respecting the dependency graph and resource constraints in `pipeline.config.json`. Hard barrier at the approval gate.
- **Triggers:** Invoked by `/build-campaign` after Phase 3 (strategy gate)
- **Works with:** all drafting and QA phases; falls back to sequential when disabled

### Research Skills

#### 6. seo-keyword-research
- **Purpose:** Seed expansion, live-SERP intent classification, honest prioritization, and cluster mapping into a `keyword-plan.json`. Never fabricates search volumes.
- **Triggers:** "keyword research", "what should we rank for", Weeks 1-2 of SEO-led campaigns, `/seo-audit`
- **Output:** `.claude/plans/keyword-plan.json`

#### 7. competitor-teardown
- **Purpose:** Systematic teardown — positioning, pricing, funnel, content/SEO footprint, ads, review mining — into a sourced, dated report with exploitable gaps
- **Triggers:** `/competitor-teardown`, "analyze competitor", "battlecard"
- **Output:** `.claude/research/competitors/<name>-teardown-<date>.md`

#### 8. persona-research
- **Purpose:** Evidence-based personas with every attribute labeled validated or assumed, plus the verbatim language bank that feeds copy
- **Triggers:** "build personas", "audience research", missing personas at brief time
- **Output:** `.claude/research/personas/<slug>.md`

### Production Skills

#### 9. email-sequence
- **Purpose:** Multi-step email sequences (welcome, nurture, launch, abandonment, winback) as a structured spec plus per-email drafts; staged OFF pending approval
- **Triggers:** `/build-email-sequence`, "drip campaign", "welcome flow"
- **Output:** `.claude/plans/email-sequences/<slug>.json` + drafts

#### 10. social-content-batching
- **Purpose:** One idea → a coordinated batch of platform-native posts with per-platform adaptation, scheduling map, and set-level QA
- **Triggers:** Social components of `/build-campaign`, "social batch", "repurpose this post"
- **Output:** `.claude/plans/social-batches/<slug>.json`

#### 11. ad-copy-variants
- **Purpose:** Designed test matrices — one variable per test, tracking-ready naming, hypothesis per variant, per-platform limits
- **Triggers:** Paid components of `/build-campaign`, "ad variants", "creative test"
- **Output:** `.claude/plans/ad-variants/<slug>.json`

#### 12. landing-page-copy
- **Purpose:** Full-page conversion copy — hero to final CTA — with message match, objection handling, and proof placement; implementation-ready copy document
- **Triggers:** "landing page", "page copy", conversion-optimizer test variants
- **Output:** `content/landing-pages/<slug>.md`

### Reporting Skills

#### 13. analytics-report
- **Purpose:** Standardized performance reports from provided data — scorecard, funnel, channels, recommendations with owners. Missing data is a reported gap, never a filled-in guess.
- **Triggers:** `/analyze-performance`, Phase 9 of `/build-campaign`, "performance report"
- **Output:** `.claude/campaigns/<slug>/report-<date>.md` (or `.claude/reports/`)

---

## Pipeline Flow

```
Campaign goal ("launch the new feature")
    |
    v
[Phase 0] brand sync — drift check vs brand-guidelines.json (if it exists)
    |
    v
[Phase 1] campaign-brief-intake → campaign-brief.json
    |
    v
[Phase 2] brand-voice-lock → brand-guidelines.json   (HARD GATE: no lockfile, no drafting)
    |
    v
[Phase 3] STRATEGY GATE — human approves objective, audience, channels, budget
    |
    v  (parallel-orchestration takes over — per-asset lanes)
[Phase 4] content-calendar → content-calendar.json
    |
[Phase 5] drafts — blog-writer / email-sequence / social-content-batching /
    |              ad-copy-variants / landing-page-copy per asset plan
    v
[Phase 6] editorial-qa → brand voice + readability + fact-check loop (max 5)
    |
[Phase 7] channel checks — seo-check, platform limits (non-blocking)
    |
    v
[Phase 8] HUMAN APPROVAL GATE — per-asset sign-off; nothing publishes,
    |      sends, or spends without it. No timeout, no default-approve.
    v
[Phase 9] analytics-report → campaign-report.md + measurement plan

Supporting skills (used throughout):
  - seo-keyword-research (Weeks 1-2, SEO-led campaigns)
  - competitor-teardown (Weeks 1-2, competitive context)
  - persona-research (Weeks 1-2, when personas are missing or stale)
```

## Skills vs Agents vs Plugins

| Type | Purpose | Invocation |
|------|---------|------------|
| **Skills** | Systematic workflows and best practices | Automatic keyword detection |
| **Agents** | Specialized task execution | Task tool (auto or explicit) |
| **Plugins** | Tool integrations and commands | Manual `/` commands |

## Skill File Structure

```yaml
---
name: skill-name
description: Use when [triggers]. Keywords: term1, term2
---

# Skill Name
## Purpose
## When to Use
## Inputs
## Process
## Output
## Error Handling
## Integration
```
