---
name: persona-research
description: Evidence-based persona research — mines reviews, communities, and provided customer data into personas with every attribute labeled validated or assumed, plus the verbatim language bank copy is built from. Keywords: persona research, customer research, audience research, jobs to be done, voice of customer, verbatims
---

# Persona Research — Personas With Receipts

## Purpose

Build personas from evidence, not imagination. Mines every available voice-of-customer source into persona documents where each attribute is labeled **validated** (sourced) or **assumed** (needs testing), plus a verbatim language bank that feeds copy. The output makes targeting, messaging, and channel decisions — a persona that changes no decision is trivia.

## When to Use

- Weeks 1-2 of `/build-campaign` when personas are missing or stale
- Standalone audience research requests
- Refreshing personas after campaign results contradict them

## Inputs

- **Required:** The product/offer context and the decision the personas must inform
- **Optional (more = better):** Review-site URLs, community links, survey exports, support-ticket themes, interview notes/transcripts, analytics summaries

## Process

### Step 1: Inventory the Evidence

```
1. Provided data: surveys, interviews, support themes, CRM notes (read fully)
2. Public voice-of-customer (WebSearch/WebFetch):
   - Review sites: G2/Capterra/app stores for us AND category competitors
   - Communities: Reddit/forums where the audience talks about the problem
   - Social: how people describe the problem in their own posts
3. Existing personas: .claude/research/personas/ — refresh, don't duplicate
4. Log every source with date — the evidence trail is part of the output
```

### Step 2: Mine for the Load-Bearing Elements

```
Extract and tally (theme counts, not anecdote-as-truth):
- TRIGGERS: the events that start the search ("we hit 20 employees and…")
- JOBS: what they're hiring the product to do (functional + emotional)
- OBJECTIONS: what almost stops the purchase (price framing, trust, switching)
- ALTERNATIVES: what they actually compare against (often "spreadsheet" or "nothing")
- WATERING HOLES: where they learn and who they trust
- VERBATIMS: exact phrases for the language bank (with sources)
Themes need n≥3 independent occurrences to count as validated.
```

### Step 3: Draft Personas (2-4, Not 8)

Segment by **behavior and need**, not demographics. Every attribute carries its label:

```markdown
// .claude/research/personas/<slug>.md
# Persona: Ops-Manager Olivia
**Decision this informs:** [targeting/messaging/channel choice]
**Evidence base:** 47 reviews, 3 community threads, 12 support tickets [links, dates]

## Job-to-be-Done
Hiring [product] to [job]. [VALIDATED — 14 review mentions]

## Triggers
- Team crossed ~20 people; manual process broke [VALIDATED — n=6]
- New compliance requirement [ASSUMED — 1 mention, needs testing]

## Objections
- "Another tool nobody will adopt" [VALIDATED — n=9, strongest theme]

## Alternatives Considered
Spreadsheets (dominant), [Competitor X] [VALIDATED]

## Watering Holes
r/ops, two named newsletters, peer recommendations [VALIDATED/ASSUMED per item]

## Buying Role
Champion who needs finance sign-off [ASSUMED — test in next 5 interviews]

## Verbatim Bank
- "I just want to stop being the human cron job" [G2 review, 2026-05]
- [8-15 more, each sourced]

## What Would Change This Persona
[The evidence that would revise or retire it]
```

### Step 4: Pressure-Test

```
1. Distinctness: would these personas receive DIFFERENT messages/channels?
   If two personas make identical decisions, merge them.
2. Coverage: does the set cover the campaign's target segments?
3. Assumption audit: list every ASSUMED attribute → becomes the research
   backlog (interview questions, message tests)
```

### Step 5: Wire Into the Pipeline

- Personas referenced by slug in campaign-brief.json `audience.personas`
- Verbatim bank delivered to copywriter and positioning-messaging
- Objection list delivered to landing-page-copy and ad-copy-variants
- Assumption backlog delivered to experiment-tracker

## Output

**Primary:** `.claude/research/personas/<slug>.md` (2-4 personas)
**Secondary:** Verbatim language bank; assumption backlog; source log

## Error Handling

- **Evidence too thin for validation:** Ship personas anyway with most attributes ASSUMED and say so loudly — a labeled hypothesis beats fake confidence
- **Sources contradict:** Segment difference in disguise? Split before averaging into mush
- **Only internal opinions available:** Build the "team hypothesis persona", label every attribute ASSUMED, and attach the validation plan
- **Never:** invent quotes, statistics, or "research says" — an unsourced verbatim is fiction

## Integration

- **Consumed by:** customer-persona-builder agent, campaign-brief-intake, copywriter, positioning-messaging, paid-ads-specialist (targeting)
- **Uses:** WebSearch, WebFetch, Read (provided data), market-researcher agent
