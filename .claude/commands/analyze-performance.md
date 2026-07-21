---
allowed-tools: Skill, Agent, Bash, Read, Write, Glob, Grep, AskUserQuestion
argument-hint: [data file paths and/or the question to answer]
description: Turn provided marketing data into a standardized performance report with recommendations — never fabricates a number
---

# /analyze-performance — Data In, Decisions Out

Generate a standardized performance report from provided data: scorecard vs targets, funnel and channel breakdowns, honest statistics, and recommendations with owners.

## Usage

```
/analyze-performance exports/ga4-june.csv exports/meta-june.csv
/analyze-performance .claude/campaigns/2026-q3-feature-launch/ "did the launch hit target?"
/analyze-performance            (prompts for data; without data, produces the measurement checklist instead)
```

## Steps

### 1. Frame

- Identify the decision the report serves (scale/cut/fix/continue)
- Load targets and baselines from the campaign brief if one applies

### 2. Invoke the analytics-report Skill

The skill audits data quality first (gaps, double counting, bot-suspicious spikes), then analyzes funnel, channels, content/creative, and trend — with the attribution-analyst lens on any cross-channel comparison.

**Iron rule enforced:** every number traces to provided data. Missing data ships as a reported gap. If asked to "fill in reasonable estimates," decline and explain.

### 3. Deliver

- Report at `.claude/campaigns/<slug>/report-<date>.md` (or `.claude/reports/` standalone)
- Recommendations routed to owning agents (budget changes → budget-planner, through the approval gate)
- Hypotheses → experiment-tracker backlog; baselines updated for the next brief

## Related

- `/build-campaign` Phase 9 — the campaign wrap report uses the same skill
- marketing-analytics-reporter / attribution-analyst agents
- dataviz skill — when charts are requested
