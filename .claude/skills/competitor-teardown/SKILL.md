---
name: competitor-teardown
description: Systematic competitor teardown — positioning, pricing, funnel, content, SEO footprint, and review mining — producing a sourced, dated teardown report with exploitable gaps and battlecard inputs. Keywords: competitor teardown, competitive analysis, battlecard, competitor research, gap analysis
---

# Competitor Teardown — Evidence Over Vibes

## Purpose

Deconstruct a competitor systematically from public sources and turn observation into decisions: where to differentiate, what to counter, what to ignore. Every finding is sourced and dated; inference is labeled as inference. Output feeds battlecards, positioning, and campaign whitespace.

## When to Use

- `/competitor-teardown <name-or-url>` end to end
- Weeks 1-2 competitive input for `/build-campaign`
- Battlecard refreshes when a competitor moves

## Inputs

- **Required:** Competitor name or URL
- **Optional:** Specific focus (pricing, content, ads), prior teardown (delta mode), win/loss notes

## Process

### Step 1: Scope and Snapshot

```
1. Confirm the competitor and the question this teardown should answer
2. Snapshot basics with capture dates: homepage, pricing, product pages
3. Delta mode: if a prior teardown exists, diff against it — what changed
   since [date] is often the most valuable finding
```

### Step 2: The Teardown Grid (WebSearch + WebFetch)

```
POSITIONING
- Who they say they're for; the frame they choose; their "unlike" claim
- Message house reverse-engineered from homepage → pricing → product pages

PRICING & PACKAGING
- Tiers, anchors, what's gated where, free/trial mechanics
- Capture EXACT prices with dates (prices change; undated intel misleads)

FUNNEL
- CTA paths, signup friction, demo vs self-serve, follow-up behavior
  (public paths only — no fake trials under false identity)

CONTENT & SEO FOOTPRINT
- Content pillars and cadence; what they rank for (SERP checks on
  category head terms); gaps in their coverage

SOCIAL & ADS
- Active channels, posting cadence, engagement quality
- Ad library review (Meta/Google transparency tools): angles, offers, longevity
  (long-running ads ≈ working ads)

PROOF & REPUTATION
- Case studies, logos, review-site presence
- REVIEW MINING (the gap map): G2/Capterra/app-store reviews —
  recurring complaints (their weakness), recurring praise (their moat),
  verbatim language worth answering in our copy
```

### Step 3: Synthesize

```
1. Their strategy in one paragraph (labeled inference)
2. Real strengths — honest, evidenced; sandbagging helps no one
3. Exploitable gaps — each with the evidence and the move it enables
4. Landmines — their claims that attack us; our claims they'll attack
5. Materiality filter: what here changes OUR positioning, pricing, or plan?
```

### Step 4: Write the Teardown Report

```markdown
// .claude/research/competitors/<name>-teardown-<date>.md
# Teardown: [Competitor] — [date]
**Question:** [what this answers]  **Sources:** [n, all linked+dated]

## Executive Summary (3 bullets + the recommended move)
## Positioning & Messaging  [evidence]
## Pricing & Packaging      [exact, dated]
## Funnel Notes             [public-path observations]
## Content & SEO Footprint  [pillars, rankings checked, gaps]
## Ads & Social             [angles, longevity signals]
## Review Mining            [complaint themes n≥3, praise themes, verbatims]
## Strengths (honest) / Exploitable Gaps (evidenced)
## Landmines
## Recommended Actions      [each: action → owner agent → evidence ref]
## Confidence & Gaps        [what we couldn't verify; freshness limits]
```

### Step 5: Feed the System

- Battlecard inputs → competitive-analyst's battlecard template
- Differentiation evidence → positioning-messaging
- Content gaps → content-strategist and seo-keyword-research
- Whitespace angles → the campaign brief

## Output

**Primary:** `.claude/research/competitors/<name>-teardown-<date>.md`
**Secondary:** Battlecard updates; gap list routed to owning agents

## Error Handling

- **Thin public footprint:** Report what's checkable; label the rest unknown — never pad with speculation
- **Conflicting information:** Present both with dates; recency wins for facts, both survive for claims
- **Tempting non-public source:** Decline — public sources only, no pretexting, no NDA'd material
- **Findings implicate legal territory** (their trademarks in our copy, comparative claims): flag legal-compliance-checker before anything ships

## Integration

- **Consumed by:** `/competitor-teardown`, `/build-campaign` (Weeks 1-2), competitive-analyst battlecards
- **Uses:** WebSearch, WebFetch, competitive-analyst agent, prior teardowns (delta mode)
