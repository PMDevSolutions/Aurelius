---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, WebFetch, AskUserQuestion
argument-hint: [paths or URLs to existing brand material, if any]
description: First-run brand setup — create brand-guidelines.json, the lockfile every asset is checked against
---

# /setup-brand — Create the Brand Lockfile

First-time (or from-scratch) creation of `brand-guidelines.json` — the versioned single source of truth for voice, tone, lexicon, claims policy, visual identity, and compliance rules. Until this exists, the pipeline refuses to draft.

## Usage

```
/setup-brand
/setup-brand docs/old-brand-book.pdf https://example.com
/setup-brand content/approved/       (learn the voice from an approved corpus)
```

## Steps

### 1. Invoke the brand-voice-lock Skill

Full extraction flow: existing docs → live copy corpus → approved assets → interview for the gaps (max 5 questions: personality + never-be, banned/beloved words, tone under pressure, claims rules, disclaimers).

With **zero** existing sources, the skill runs the full interview and marks derived rules `"confidence": "unvalidated"` — honest scaffolding to refine against real output.

### 2. Validate

- `node scripts/brand-voice-lint.js --self-test` (lockfile parses and rules are checkable)
- Contradiction check (banned words absent from examples/boilerplate)
- Disclaimer coverage decided for every assetType in pipeline.config.json

### 3. Deliver

- `brand-guidelines.json` at the project root (versioned; future edits bump `version`)
- `docs/brand-setup/brand-voice.md` — the generated one-page quick reference
- A 3-example demonstration: one on-voice paragraph, one violating paragraph with the lint findings it triggers, one borderline case with the WARN it earns

## After Setup

- Every draft is checked against this lockfile in editorial QA
- The pre-commit hook lints staged content against it
- Update it deliberately via the brand-voice-lock skill — silent edits are drift with commit access

## Related

- brand-voice-lock skill — the machinery this command drives
- brand-compliance-checker agent — editorial enforcement
- `/verify-all` — includes the brand lint across all content
