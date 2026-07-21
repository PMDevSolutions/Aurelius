---
name: ad-copy-variants
description: Structured ad copy variant generation — an angle × hook × CTA test matrix with per-platform format limits, tracking-ready naming, and a hypothesis attached to every variant. Keywords: ad copy, ad variants, creative testing, test matrix, headline variants, ad angles
---

# Ad Copy Variants — Structured Creative Testing

## Purpose

Replace "write me 10 ads" with a designed test matrix: variants that differ on ONE variable each, named for tracking, sized for their platforms, and carrying an explicit hypothesis. The output plugs directly into the paid-ads-specialist's campaign builds and makes results interpretable.

## When to Use

- Paid components of `/build-campaign` (drafting phase)
- Creative refreshes when fatigue signals appear
- Landing page / email subject testing (same matrix logic)

## Inputs

- **Required:** Offer + audience (from campaign-brief.json), target platforms/placements
- **Required:** `brand-guidelines.json`; approved claims with sources
- **Optional:** Past ad performance (winning/losing angles), landing page URL

## Process

### Step 1: Define the Test Variables

```
Test in order of impact (fix everything else while testing one):
1. ANGLE — the persuasive frame:
   pain-relief | outcome/aspiration | proof/social | speed/ease |
   cost/value | fear-of-missing-real-deadline (only if real)
2. HOOK — the opening execution of the angle (question, claim, statistic, story)
3. CTA — the ask framing ("Start free" vs "See how it works" vs "Get the report")
One matrix tests ONE variable dimension; note which is under test.
```

### Step 2: Build the Matrix

```
Example: angle test, 4 angles × 2 hooks each = 8 variants
- Same offer, same CTA, same landing page across all 8
- Each variant: hypothesis ("pain-relief will beat aspiration for
  this ops audience because persona objections center on wasted time")
- Sample/budget note per variant from paid-ads-specialist's test standards
```

### Step 3: Write Variants Per Platform Limits

```
Google RSA:   15 headlines ≤30 chars, 4 descriptions ≤90 chars
              (headlines must combine coherently in any order)
Meta:         primary text (125 chars visible), headline ≤40, description ≤30
LinkedIn:     intro ≤150 visible, headline ≤70
TikTok:       ad text ≤100; hook is the video's first line (→ video-script-writer)
Rules:
- Claims identical across variants (only the variable changes)
- Every statistic carries its source in the spec (platforms may require substantiation)
- Brand voice holds even in 30 characters — banned words are still banned
```

### Step 4: Name for Tracking

Per the attribution taxonomy:

```
[campaign]-[platform]-[test]-[variable]-[variant]
2026q3launch-meta-angletest-pain-v1
utm_content mirrors the variant name — results tie back without archaeology
```

### Step 5: Write the Variant Spec

```jsonc
// .claude/plans/ad-variants/<slug>.json
{
  "version": "1.0.0",
  "test": "2026q3launch-meta-angletest",
  "variableUnderTest": "angle",
  "constants": { "offer": "14-day trial", "cta": "Start free", "landingPage": "/launch" },
  "variants": [
    {
      "id": "pain-v1",
      "angle": "pain-relief",
      "hypothesis": "Ops managers respond to time-waste framing (persona objection data)",
      "copy": {
        "primaryText": "…",
        "headline": "…",
        "description": "…"
      },
      "claimsSources": [{ "claim": "…", "source": "…" }],
      "utmContent": "2026q3launch-meta-angletest-pain-v1"
    }
  ],
  "decisionCriteria": "pre-registered with paid-ads-specialist: min spend/variant, runtime, primary metric = CPA"
}
```

### Step 6: QA and Hand Off

- `editorial-qa` on the full set: brand lint, claims sourced, readability (ads target: Flesch ≥ 75), platform policy red flags (restricted-category wording → legal-compliance-checker)
- Message-match check against the landing page (with conversion-optimizer)
- Hand the spec to paid-ads-specialist for campaign build — **builds stage paused; spend activates only through the human approval gate**

## Output

**Primary:** `.claude/plans/ad-variants/<slug>.json`
**Secondary:** Per-platform paste-ready copy sheets; asset briefs for art-director

## Error Handling

- **More than one variable varies:** Fix the matrix before writing — untestable sets don't ship
- **A claim lacks substantiation:** Variant is written around it or the claim is dropped; platform ad review will catch what QA doesn't
- **Character limits force claim distortion** ("up to 40%" → "40%"): Truncation never inflates claims; find a shorter true framing
- **No past performance data:** Say so; hypotheses lean on persona evidence and are labeled lower-confidence

## Integration

- **Consumed by:** paid-ads-specialist (campaign builds), conversion-optimizer (message match), `/build-campaign`
- **Uses:** copywriter agent, `editorial-qa`, attribution-analyst naming taxonomy, brand-guidelines.json
