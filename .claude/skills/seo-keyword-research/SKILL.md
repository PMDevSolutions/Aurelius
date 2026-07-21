---
name: seo-keyword-research
description: Systematic keyword research — seed expansion, intent classification, difficulty/value prioritization, and cluster mapping — producing a keyword-plan.json that feeds content briefs and the calendar. Keywords: keyword research, search intent, keyword clusters, SERP analysis, content gap, keyword plan
---

# SEO Keyword Research — Intent-First Targeting

## Purpose

Replace "let's rank for [big obvious term]" with a prioritized, intent-classified keyword plan the content team can actually win. Output is a `keyword-plan.json` mapping clusters → intents → target pages, consumed by content briefs, the calendar, and the seo-content-writer.

## When to Use

- Weeks 1-2 of a campaign with an organic-search component
- `/seo-audit` keyword-opportunity section
- Before briefing any SEO-led content

## Inputs

- **Required:** Topic territory or seed terms; the site/product context
- **Optional:** Existing rankings data, competitor domains, keyword-tool exports (CSV)

## Process

### Step 1: Seed Expansion

```
1. Start from seeds: product terms, problem language (from personas),
   category terms, competitor-associated terms
2. Expand via WebSearch:
   - Autocomplete patterns ("[seed] for", "[seed] vs", "how to [seed]")
   - People Also Ask questions per seed
   - Related searches at page bottom
   - Community phrasing (Reddit/forum threads in results)
3. Harvest competitor coverage: what do ranking competitors have that we lack?
4. Merge user-provided tool exports if available (volumes, difficulties)
```

### Step 2: Intent Classification

Classify every candidate by reading the live SERP, not guessing from the words:

```
- informational: guides/explainers rank → maps to blog/guide content
- commercial:    comparisons/roundups rank → maps to comparison pages
- transactional: product/pricing pages rank → maps to landing pages
- navigational:  brand results → usually skip (or defend brand SERP)
Mixed SERPs → note the dominant format and the wedge opportunity
```

### Step 3: Score and Prioritize

For each keyword, score honestly:

```
value:       Will ranking here plausibly produce customers, not just traffic? (1-5)
winnability: Can THIS site win — given current authority and the SERP's
             incumbents? (1-5; be brutal)
volume:      Demand signal (exact numbers only if tool data provided;
             otherwise relative High/Med/Low from SERP and autocomplete signals
             — NEVER invent precise volumes)
priority:    value × winnability, tie-broken by volume
```

### Step 4: Cluster Mapping

Group keywords into clusters, one intent per target page:

```
1. Cluster = one pillar + its long-tail variants and questions
2. Check against existing content: map to existing URLs (refresh/strengthen)
   or mark net-new
3. Cannibalization check: no two target pages share an intent
   (flag conflicts to seo-specialist)
```

### Step 5: Write keyword-plan.json

```jsonc
// .claude/plans/keyword-plan.json
{
  "version": "1.0.0",
  "generatedAt": "2026-07-21",
  "topic": "workflow automation",
  "dataSources": ["SERP analysis", "autocomplete", "user CSV (Ahrefs, 2026-07)"],
  "clusters": [
    {
      "cluster": "automation-roi",
      "pillar": {
        "keyword": "workflow automation ROI",
        "intent": "commercial",
        "volume": "Medium",              // exact number only if tool data provided
        "priority": 20,                   // value 5 × winnability 4
        "targetPage": "net-new",
        "serpNotes": "Listicles + 2 vendor pages; gap: no calculator"
      },
      "supporting": [
        { "keyword": "how to measure automation savings", "intent": "informational", "priority": 12 }
      ],
      "assetPlanRef": "blog-01"          // links into campaign-brief assetPlan
    }
  ],
  "skipped": [
    { "keyword": "automation", "reason": "unwinnable head term; navigational-mixed SERP" }
  ]
}
```

### Step 6: Feed the Pipeline

- Top clusters → content briefs (keyword, intent, format, SERP notes per brief)
- Asset plan and calendar entries reference cluster IDs
- Baseline current rankings for target keywords so post-launch movement is measurable

## Output

**Primary:** `.claude/plans/keyword-plan.json`
**Secondary:** Prioritized summary table + skipped-terms rationale

## Error Handling

- **No tool data provided:** Proceed with relative volume classes from SERP signals; label every volume "estimated-relative" — never fabricate precise numbers
- **SERP dominated by giants:** Report the cluster as unwinnable now; propose the long-tail wedge instead
- **Ambiguous intent:** Target the dominant format; note the secondary intent for a separate asset

## Integration

- **Consumed by:** content-strategist (briefs), seo-content-writer (drafting), content-calendar (scheduling), `/seo-audit`
- **Uses:** WebSearch, WebFetch, Read (exports), seo-specialist agent
