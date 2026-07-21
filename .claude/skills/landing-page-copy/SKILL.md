---
name: landing-page-copy
description: Conversion-focused landing page copy — full page structure from hero to final CTA with message match, objection handling, proof placement, and QA gates built in. Keywords: landing page, page copy, hero copy, conversion copy, message match, CTA
---

# Landing Page Copy — The Conversion Argument

## Purpose

Write landing pages as a single persuasive argument: promise → proof → objections → action. Output is a structured copy document a designer or page builder can implement directly — every block labeled, message-matched to its traffic sources, and passed through the QA gates.

## When to Use

- Landing page assets in `/build-campaign`
- `/write-content` requests for pages, offers, or squeeze pages
- Conversion-optimizer test variants (new hero/angle hypotheses)

## Inputs

- **Required:** The offer, the audience (persona ref), and the ONE conversion goal
- **Required:** `brand-guidelines.json`; approved claims with sources
- **Optional:** Traffic sources with their ad/email copy (message match), objection list from persona research, existing page (rewrite mode)

## Process

### Step 1: Establish the Argument

```
1. One goal: the single conversion action (two goals = two pages)
2. Awareness stage of arriving traffic (problem-aware reads differently
   than comparison-shopping)
3. Message match: collect the EXACT promises in the ads/emails sending
   traffic — the hero must continue that sentence
4. The objection list: from persona verbatims, ranked by frequency
```

### Step 2: Structure the Page

```
1. HERO           — headline (the promise, specific), subhead (how/for whom),
                    primary CTA, proof snippet (real number/logo)
2. PROBLEM/STAKES — the pain in the customer's words (verbatim bank)
3. HOW IT WORKS   — 3 steps max; concreteness beats completeness
4. BENEFITS       — outcomes over features, each with its proof
5. PROOF BLOCK    — testimonials (real, permissioned), numbers (sourced), logos
6. OBJECTIONS     — answer the top 3-5 at the moment of doubt (FAQ or inline)
7. RISK REVERSAL  — trial/guarantee terms (only what's actually offered)
8. FINAL CTA      — restate promise + action; nothing new introduced here
Cut any section the argument doesn't need — short pages beat padded ones.
```

### Step 3: Write the Copy Document

```markdown
// content/landing-pages/<slug>.md
# LP: [slug] — [offer]
**Goal:** [conversion action]  **Persona:** [ref]  **Sources matched:** [ad refs]

## HERO
- Headline: "…"                      [matches ad promise: "…"]
- Subhead: "…"
- CTA-primary: "[verb + payoff]"     → [destination/action]
- Proof snippet: "4.8/5 from 312 reviews" [source]

## PROBLEM
"…" [persona verbatim basis]

## HOW IT WORKS
1-2-3 …

## BENEFITS
- [Outcome] — [proof + source]

## PROOF
- Testimonial: "…" — Name, Role [permission ref]
- Stat: […] [source]

## OBJECTIONS
- "[objection verbatim]" → [answer copy]

## FINAL CTA
…

## IMPLEMENTATION NOTES
- Visual hierarchy: what must be seen first/second/third (for art-director)
- Mobile: hero must survive 375px without scrolling past the CTA
- Forms: fields to request (fewer = more) — with conversion-optimizer
```

### Step 4: Run the Gates

- Message-match check: hero vs every traffic source's promise (with conversion-optimizer)
- `editorial-qa`: brand lint, readability (landing-page target: Flesch ≥ 65), every claim/testimonial sourced and permissioned
- `seo-check.js` if the page targets organic intent (title/meta/headings)
- Honest-persuasion audit: no fake scarcity, no invented social proof, risk-reversal terms real

### Step 5: Hand Off

Deliver the copy document plus implementation notes. Page publication — like everything external — passes the human approval gate. For test variants, attach the hypothesis and pre-registration per conversion-optimizer's standards.

## Output

**Primary:** `content/landing-pages/<slug>.md` (structured copy document)
**Secondary:** Message-match report; asset briefs for art-director

## Error Handling

- **Two conversion goals requested:** Split into two pages or force the priority call — a hedged page converts nobody
- **No proof available for the key claim:** Reframe to what's provable or flag the gap upward; never decorate with invented numbers
- **Traffic sources unknown:** Write to the persona's dominant awareness stage; flag that message match is unverified
- **Offer terms fuzzy** (trial length, guarantee): Get exact terms before writing risk-reversal copy — wrong terms are legal exposure

## Integration

- **Consumed by:** `/build-campaign`, `/write-content`, conversion-optimizer tests
- **Uses:** copywriter agent, conversion-optimizer agent, persona verbatims, `editorial-qa`, brand-guidelines.json
