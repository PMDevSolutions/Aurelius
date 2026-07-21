---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
argument-hint: <topic, working title, or path to a content brief>
description: Create an SEO-optimized blog article end to end — keyword validation, outline, draft, editorial QA loop, publish-ready markdown
---

# /create-blog-article — SEO Blog Article, Gate-Checked

Produce a complete, publish-ready blog article: keyword-validated, outlined against the live SERP, drafted by the blog-writer, and passed through the full editorial QA loop. Output is clean markdown with front matter — ready for any CMS after the approval gate.

## Input

`$ARGUMENTS` = a topic ("how to reduce churn with dunning emails"), a working title, or a path to an existing content brief.

## Steps

### 1. Preconditions

- Verify `brand-guidelines.json` exists (else offer `/setup-brand`)
- Load `pipeline.config.json`: `readability.targets.blog-post`, `seoChecklist`, `editorialLoop`
- Check `content-calendar.json` for a matching planned entry; attach if found (status → `drafting`)
- Check `.claude/plans/keyword-plan.json` for an assigned cluster

### 2. Keyword & Intent Validation

If no keyword is assigned, run a scoped pass of the `seo-keyword-research` skill on the topic:
- Confirm the target keyword and its intent against the live SERP
- Check for cannibalization against existing content (one intent, one page)
- If the SERP says this topic is unwinnable as framed, say so and propose the long-tail angle **before** writing 2,000 words at a wall

### 3. Brief & Outline

Produce a mini-brief (audience/persona, thesis, target keyword + intent, CTA, internal-link targets) and an outline:
- H2/H3 structure answering the SERP's sub-questions
- Evidence plan: which claims need which sources — gathered now, not after drafting
- Snippet block planned (40-60 word direct answer near the top)

Show the outline for a quick confirmation if the angle involved judgment calls.

### 4. Draft (blog-writer agent)

Draft per the outline with the three-pass self-edit (structure → evidence → line). Front matter included:

```markdown
---
title: "…"                # ≤ 60 chars, keyword included
description: "…"          # ≤ 155 chars, the click reason
keyword: "…"
date: 2026-07-21
status: draft
---
```

Save to `content/blog/<slug>.md`.

### 5. Editorial QA Loop

Invoke the `editorial-qa` skill (assetType `blog-post`):
- `brand-voice-lint.js` — voice, banned words, naming
- `readability-score.js` — Flesch ≥ 60 target
- Fact-check — every statistic sourced, linked, dated; unsourced claims reworded or cut
- `seo-check.js` — title/meta lengths, keyword placement, heading hierarchy, ≥2 internal links, ≥1 cited source

Bounded loop per `editorialLoop.maxRevisions`; escalate on exhaustion.

### 6. Deliver

- Final markdown with QA summary (iterations used, checks passed, claim-source list)
- Update the calendar entry if attached
- Suggest the derivative chain (newsletter version, social batch via `social-content-batching`)
- **Publishing is a human decision:** the article ships to the CMS only after the approval gate

## Success Message

```
✅ Blog article ready for approval

📄 content/blog/<slug>.md
🔍 QA: passed in <n>/<max> iterations · <k> claims, all sourced
🎯 Keyword: "<keyword>" (<intent>) · title 54ch · meta 149ch · links 3
📅 Calendar: <entry-id> → ready for approval

Next: review and approve to publish, or /write-content social-batch to repurpose.
```

## Related

- `/write-content` — other asset types through the same gates
- `/seo-audit` — audit existing articles
- seo-content-writer agent — for SEO-led refreshes of existing posts
