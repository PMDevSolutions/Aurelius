# Pipeline Configuration Guide

All pipeline behavior is controlled by `.claude/pipeline.config.json`. This document explains every section, what the defaults are, and how to customize them. Every field documented here traces to a property in `pipeline.config.schema.json`, and every default shown is the value in the live config. Validate any edit with:

```bash
./scripts/validate-pipeline-config.sh
```

## brandVoice

Brand lockfile enforcement — the analog of design-token verification.

| Field | Default | Meaning |
|-------|---------|---------|
| `enforced` | `true` | Master switch for brand checks in editorial QA |
| `lockfile` | `brand-guidelines.json` | Path to the single source of truth |
| `requireLockfileBeforeDrafting` | `true` | Hard gate: drafting phases refuse to start without a lockfile |
| `lintBlocking` | `true` | `brand-voice-lint.js` findings block (vs warn) |
| `bannedWordsPolicy` | `"block"` | Banned-word hits are hard blockers |
| `driftCheck.autoCheck` | `true` | Phase 0 lints recent content against the lockfile |

## readability

Per-asset-type targets checked by `readability-score.js`.

| Asset type | fleschMin | maxAvgSentenceWords | maxPassiveVoicePct |
|-----------|-----------|---------------------|--------------------|
| blog-post | 60 | 22 | 12 |
| email / email-sequence | 65 | 18 | 10 |
| social-batch | 70 | 14 | 8 |
| ad-campaign | 75 | 12 | 5 |
| landing-page | 65 | 16 | 8 |
| press-release | 55 | 24 | 15 |
| video-script | 70 | 14 | 8 |

`blocking` (default `false`) controls whether a miss blocks or warns. Raise/lower targets per your audience — B2B technical audiences may justify lower Flesch floors.

## editorialLoop

The bounded revision loop — the analog of the old visual-diff iteration loop.

| Field | Default | Meaning |
|-------|---------|---------|
| `maxRevisions` | `5` | QA→revise iterations per asset before escalation |
| `maxFixAttemptsPerFinding` | `2` | Fix attempts per finding within one iteration |
| `stopOnFirstPass` | `true` | Stop as soon as everything passes |
| `escalateOnExhaustion` | `true` | Exhausted loop escalates to the user — never silent shipping |

## factCheck

Claim verification policy. **`fabricationPolicy` is schema-pinned to `"block"` — a config that weakens it fails validation.**

| Field | Default | Meaning |
|-------|---------|---------|
| `citationRequiredForStatistics` | `true` | Every statistic carries a dated, linked source |
| `superlativesRequireSubstantiation` | `true` | "Best/#1/guaranteed" need evidence on file |
| `testimonialPolicy` | `real-permissioned-documented` | The only kind of testimonial that ships |
| `unverifiableClaimPolicy` | `"reword-or-cut"` | Unverifiable ≠ shippable |

## seoChecklist

On-page checks applied by `seo-check.js` to web-bound assets: `titleMaxChars` 60, `metaDescriptionMaxChars` 155, keyword required in title and H1, `minInternalLinks` 2, `minCitedSources` 1, heading-hierarchy enforcement. `blocking` defaults to `false` (advisory).

## humanApproval

The hard gate. **`required`, `blocking`, and `nonNegotiable` are schema-pinned to `true`, and `autoApprove` to `false` — they cannot be schema-validly disabled.**

| Field | Default | Meaning |
|-------|---------|---------|
| `perAsset` | `true` | Approval granted per asset, not per batch |
| `scope` | `["publish","send","spend","schedule"]` | The actions that require sign-off |
| `waiverLogging` | `true` | WARN-level waivers granted at the gate are logged |
| `packageFile` | `approval-package.md` | The assembled review document |

## assetTypes

The analog of the old `appTypes`. Each entry defines: `description`, `ownerAgent` (who drafts), `draftSkill` (workflow used, if any), `qaChecks` (what editorial-qa runs), `approvalScope` (which gated actions going live performs), plus type-specific blocks (`complianceElements` for email, `spendGovernance` for ads, `embargoIntegrity` for press releases).

Add a new asset type by adding an entry here + a readability target + (optionally) a drafting skill. The calendar validator warns on entries whose `assetType` is undefined.

## calendar

Scheduling rules enforced by `validate-content-calendar.js`: `leadTimes` (draft→QA 3d, QA→approval 2d, **approval→publish 2d, minimum 1 — approvals are not compressible to zero**), per-channel `cadenceDefaults` (blog 2/wk, email 1/wk, social 5/wk with maxPerDay caps), `staleStatusDays` 10.

## measurement

`utmRequired` true, naming patterns for `utm_campaign` and `utm_content`, `baselineRequired` true (no campaign launches unmeasured), `reportSchedule` `["launch+7d","launch+30d"]`, monthly `doubleCountingAudit`.

## compliance

`regulatedTopics` (health, finance, legal, employment, housing) and `legalReviewTriggers` (named-competitor comparisons, sweepstakes, testimonials/endorsements, personal data) route work to legal-compliance-checker **before** the approval gate. `disclosureRules` covers FTC labeling.

## campaignCadence

The 6-week rhythm agents integrate with: weeks 1-2 research & strategy, weeks 3-4 production & QA, week 5 approvals & launch prep, week 6 launch & measurement.

## orchestration

The phase dependency graph consumed by parallel-orchestration. Each phase declares `depends`, `resources` (exclusive by default; write conflicts serialize), `blocking`, and optionally `humanGate` (scheduler never auto-passes) and `perAsset` (fans out into lanes). `maxConcurrent` defaults to 3. The validator rejects unknown dependencies and cycles.

Set `enabled: false` to run the same phases sequentially.

## reporting

Campaign outputs land in `.claude/campaigns/<slug>/`: `campaign-report.md`, `editorial-qa-report.md`, `approval-package.md`, with QA evidence included.
