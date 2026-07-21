---
allowed-tools: Skill, Agent, Bash, Read, Write, Glob, Grep, WebSearch, WebFetch
argument-hint: [content path or site URL, e.g. content/ or https://example.com]
description: Audit content or a site for SEO health — on-page checks, intent match, cannibalization, and prioritized fixes
---

# /seo-audit — SEO Health Check with Prioritized Fixes

Run a structured SEO audit over local content (default: `content/`) or a live site, producing findings scored by impact × effort — never a wall of undifferentiated warnings.

## Usage

```
/seo-audit                       (audits content/)
/seo-audit content/blog/
/seo-audit https://example.com   (public-page review via WebFetch)
```

## Steps

### 1. Mechanical Pass (local content)

```bash
node scripts/seo-check.js <path> --json
```

Per file: title/meta lengths, keyword placement, heading hierarchy, internal links, cited sources — thresholds from `pipeline.config.json → seoChecklist`.

### 2. Strategic Pass (seo-specialist agent)

- **Intent match:** for each target keyword, does the live SERP agree the page format is right?
- **Cannibalization map:** flag multiple pages targeting one intent
- **Coverage gaps:** run `seo-keyword-research` in gap mode against the pillar map
- **Decay queue:** pages worth refreshing vs pages worth pruning
- For URLs: crawlability signals visible from fetched pages (canonicals, robots hints, schema presence) — labeled as external-view-only

### 3. Report

Write `.claude/reports/seo-audit-<date>.md`:

```
## SEO Audit — <scope> — <date>
### Scorecard (files checked, pass/warn/fail counts)
### Prioritized Findings (impact × effort, top 10)
   1. [P0] <finding> — <specific fix> — <files>
### Cannibalization Map
### Gap Opportunities (→ keyword-plan.json refs)
### Refresh/Prune Queue
### Methodology & Limits (what this audit could not see)
```

Every finding names its fix and its files. No fabricated metrics: without provided analytics/rankings data, impact estimates are labeled as estimates.

## Related

- `seo-keyword-research` skill — feeds the gap analysis
- `/write-content` / `/create-blog-article` — execute the fixes
- seo-specialist agent — owns the audit framework
