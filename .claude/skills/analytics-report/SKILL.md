---
name: analytics-report
description: Generates standardized marketing performance reports from provided data — executive summary, funnel and channel breakdowns, honest-statistics rules, and recommendations with owners. Never fabricates a number; gaps are findings. Keywords: analytics report, performance report, marketing metrics, campaign report, funnel analysis
---

# Analytics Report — Numbers Into Decisions

## Purpose

Turn raw marketing data into a report someone can act on in two minutes: what happened, why, and what to do next — on a consistent template, with honest statistics. The iron rule: **every number traces to provided data; missing data is reported as a gap, never filled in.**

## When to Use

- `/analyze-performance` end to end
- Phase 9 campaign report of `/build-campaign` (launch +7d, +30d)
- Recurring weekly/monthly performance reporting

## Inputs

- **Required:** The data — CSV/JSON exports, platform report pastes, analytics summaries, or numbers in conversation
- **Required:** The question or decision the report serves
- **Optional:** campaign-brief.json (targets/baselines), prior reports (trends), budget actuals

## Process

### Step 1: Frame the Question

```
1. What decision does this report inform? (scale/cut/fix/continue)
2. Load targets and baselines from campaign-brief.json where present
3. Define the comparison window (period-over-period, vs baseline, vs target)
```

### Step 2: Ingest and Audit the Data

```
1. Parse provided exports; inventory what's actually present
2. Data quality audit BEFORE analysis:
   - Missing days/channels? Tracking gaps? Bot-suspicious spikes?
   - Platform-vs-analytics discrepancies → note the double-counting tax
3. Build the gap list — it ships in the report's appendix
4. NEVER extrapolate, estimate, or "reasonable-guess" a missing number.
   "email CTR: not provided" is a valid cell.
```

### Step 3: Analyze

```
FUNNEL: stage-to-stage conversion; where the biggest leak is; segment splits
CHANNELS: consistent metrics side by side (CAC/ROAS where cost data exists);
          flag any channel comparison built on platform-attributed numbers
CONTENT/CREATIVE: performance by asset, angle, and variant (tie to the
          test hypotheses from the ad-variants/experiment specs)
TREND: vs baseline and prior period; seasonality noted before credit assigned
STATISTICS: significance checked before "winner" is written; small samples
          labeled ("n=31 — directional only")
```

### Step 4: Write the Report

```markdown
// .claude/campaigns/<slug>/report-<date>.md  (or .claude/reports/ standalone)
# [Campaign/Period] Performance Report — [date]
**Question:** [the decision this informs]

## Executive Summary
- [3 bullets: wins, concerns, the headline number vs target]
- **Recommended decision:** [one sentence]

## Scorecard
| Metric | Target | Actual | vs Baseline | Verdict |
(primary KPI first; guardrails included; "not provided" where true)

## Funnel
[stage table + the one biggest leak, with evidence]

## Channels
[side-by-side + attribution caveats from the attribution-analyst lens]

## Content & Creative
[what worked by angle/variant; hypothesis outcomes]

## Insights & Recommendations
1. [Insight] → [Action] → [Owner agent] → [Expected effect]
(3-5, ranked; every recommendation traces to a finding above)

## Next-Cycle Hypotheses
[tests this data suggests, for experiment-tracker]

## Appendix: Data Quality & Gaps
[sources with dates; gaps list; double-counting notes; definitions]
```

### Step 5: Route the Outputs

- Recommendations → owning agents (budget shifts → budget-planner, always through approval)
- Hypotheses → experiment-tracker backlog
- Baselines updated for the next brief
- Visualizations (if requested) → dataviz-skill-compliant charts, honest axes

## Output

**Primary:** The report markdown at the canonical path
**Secondary:** Updated baselines; hypothesis backlog entries

## Error Handling

- **No data provided:** Produce the measurement checklist of what to export from where — not a speculative report
- **Data contradicts itself:** Show both numbers with sources; do not average contradictions
- **Sample too small for claimed conclusion:** Say "directional"; downgrade the recommendation confidence
- **Asked to "fill in reasonable numbers":** Decline and explain — fabricated metrics poison every decision downstream

## Integration

- **Consumed by:** `/analyze-performance`, `/build-campaign` Phase 9, recurring reporting
- **Uses:** marketing-analytics-reporter agent, attribution-analyst agent (channel truth), dataviz skill (charts), campaign-brief.json (targets)
