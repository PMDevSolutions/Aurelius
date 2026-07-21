---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: <sequence goal, e.g. "welcome flow for trial signups">
description: Design and draft a complete email sequence — spec, per-email drafts, QA, and approval staging (never auto-activated)
---

# /build-email-sequence — Journey Design to Approval-Ready

Produce a complete email sequence: the machine-readable spec (triggers, timing, branches, exits), every email drafted, QA'd as a set, and staged for the human approval gate.

## Usage

```
/build-email-sequence welcome flow for trial signups
/build-email-sequence cart abandonment recovery
/build-email-sequence winback for 90-day-inactive subscribers
```

## Steps

### 1. Preconditions

- Verify `brand-guidelines.json` exists (else offer `/setup-brand`)
- Load `pipeline.config.json → assetTypes.email-sequence` (QA checks, compliance elements)
- Inventory existing flows in `.claude/plans/email-sequences/` for collision checks

### 2. Invoke the email-sequence Skill

The skill runs the full process: sequence contract (job, triggers, exits, suppressions), arc design (as few emails as the job allows), spec authoring, and per-email drafting. Broadcast-flavored sequences involve the email-marketer agent; lifecycle flows the lifecycle-email agent.

### 3. QA the Set

`editorial-qa` on the whole sequence: brand lint, readability (Flesch ≥ 65), fact-check, compliance elements (unsubscribe, physical address, sender identity), plus arc coherence and the cumulative ask:give ratio.

### 4. Stage for Approval

Present at the human approval gate:
- The flow diagram (entry, timing, branches, exits)
- Every draft with subject + preview pairs
- Audience definition, estimated counts, suppression list
- Collision analysis with existing flows and broadcasts

**The sequence is delivered OFF/paused. Activation happens only after explicit approval — GDPR/CASL contexts route through legal-compliance-checker first.**

## Related

- lifecycle-email agent — flow architecture and optimization
- email-marketer agent — broadcasts and list health
- `/build-campaign` — sequences as campaign components
