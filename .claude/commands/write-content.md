---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
argument-hint: <asset-type> <topic, angle, or brief>
description: Draft a single marketing asset through the full editorial QA gates without running the whole campaign pipeline
---

# /write-content — Single Asset Through the Gates

Produce one publish-ready asset — a blog post, email, social batch, ad set, landing page, press release, or video script — with the same quality gates as the full pipeline, minus the campaign scaffolding.

## Usage

```
/write-content blog-post how we cut onboarding time in half
/write-content email spring promo announcement to active customers
/write-content landing-page the new analytics add-on
/write-content social-batch repurpose content/blog/onboarding-time.md
```

`$ARGUMENTS` = `<asset-type> <topic/angle/brief>`. Asset types come from `pipeline.config.json → assetTypes`. If the type is missing or ambiguous, ask.

## Steps

### 1. Preconditions

- Read `pipeline.config.json`; resolve the assetType (owner agent, draft skill, QA checks, readability target)
- Verify `brand-guidelines.json` exists. If not: **stop and offer `/setup-brand`** — drafting without the lockfile is how brand drift starts
- Check `content-calendar.json` for a matching planned entry; if found, attach to it (status → `drafting`)

### 2. Mini-Brief

Confirm in one exchange (skip what's already clear):
- Audience (persona if available), goal/CTA, key message
- Claims to make — with their sources (unsourced claims won't survive QA)
- Where it will run (affects tone, length, and channel checks)

### 3. Draft

Dispatch to the asset type's owner agent / draft skill (e.g., blog-writer for blog-post, email-sequence skill for sequences, landing-page-copy for pages). Output goes under `content/<type>/<slug>.md` (or the skill's canonical path).

### 4. Editorial QA Loop

Invoke the `editorial-qa` skill: brand-voice lint, readability vs the type's target, fact-check on every claim, channel checks per type. Bounded by `editorialLoop.maxRevisions`; escalate on exhaustion.

### 5. Deliver

- Present the final asset with its QA summary (checks passed, iterations used, claim-source list)
- Update the calendar entry (`in-qa` → ready) if attached
- **Remind: publishing/sending/scheduling this externally requires the human approval gate** — offer to assemble the approval note

## Exit Codes (conceptual)

- Asset delivered with QA evidence → done
- QA loop exhausted → escalation report with remaining findings; user decides

## Related

- `/build-campaign` — the full multi-asset pipeline
- `/create-blog-article` — blog-specialized variant with SEO workflow
- `/verify-all` — re-run the mechanical checks across all content
