---
allowed-tools: Skill, Agent, Bash, Read, Write, Glob, Grep, WebSearch, WebFetch
argument-hint: <competitor name or URL> [focus: pricing|content|ads|full]
description: Systematic competitor teardown from public sources — sourced, dated, with exploitable gaps and battlecard updates
---

# /competitor-teardown — Evidence-Based Competitive Analysis

Deconstruct a competitor from public sources into a sourced, dated teardown report with exploitable gaps, landmines, and recommended actions.

## Usage

```
/competitor-teardown acme.com
/competitor-teardown "Acme Corp" pricing
/competitor-teardown acme.com full
```

Default focus is `full`; a named focus scopes the teardown grid to that section plus the executive summary.

## Steps

### 1. Invoke the competitor-teardown Skill

The skill runs the full grid: positioning, pricing (exact + dated), funnel, content/SEO footprint, ads library review, and review mining. Delta mode automatically engages if a prior teardown exists in `.claude/research/competitors/`.

### 2. Ground Rules (enforced)

- Public sources only — no pretexting, no fake trials, no NDA'd material
- Every finding sourced and dated; inference labeled as inference
- Honest strengths — sandbagged assessments produce losing strategies

### 3. Deliver

- **Report:** `.claude/research/competitors/<name>-teardown-<date>.md`
- **Battlecard update:** via the competitive-analyst agent
- **Routed outputs:** differentiation evidence → positioning-messaging; content gaps → content-strategist / keyword plan; anything legally sensitive (trademark use, comparative claims) → legal-compliance-checker

## Related

- `/build-campaign` — consumes teardowns in Weeks 1-2
- competitive-analyst agent — battlecards and ongoing monitoring
