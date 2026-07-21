---
name: campaign-brief-intake
description: Structured interview that auto-discovers brand context, past campaign performance, and existing assets, then asks 3-5 targeted questions to produce a campaign-brief.json. Entry point for the autonomous campaign pipeline. Keywords: campaign brief, brief intake, campaign discovery, marketing interview, campaign plan
---

# Campaign Brief Intake — Structured Discovery

## Purpose

Gather everything needed to run a campaign in a single structured pass. Auto-discovers what it can (brand lockfile, past reports, content inventory), asks the user only what it must, and outputs a machine-readable `campaign-brief.json` that downstream skills consume without re-asking questions.

## When to Use

- First phase of the `/build-campaign` pipeline
- Any time a user describes a campaign goal and wants it executed
- When you need a structured brief before content or channel work begins

## Inputs

- **Required:** A campaign goal, however rough ("launch the new feature", "grow the newsletter")
- **Optional:** An existing brief document, past campaign references, budget constraints

## Process

### Step 0: Document Fast-Path (Skip the Interview)

If the user provides an existing brief document (or `.claude/plans/campaign-brief.json` already exists for this campaign), do **not** re-interview:

```
1. Parse the provided document into the campaign-brief.json structure below.
2. Report which required fields are missing; ask ONLY about those.
3. Preserve "source": "document" for provenance.
4. Proceed to Step 4 validation and Step 5 confirmation.
```

### Step 1: Auto-Discovery (No User Input)

Scan the project for context automatically:

```
1. Brand lockfile:
   - Read brand-guidelines.json (voice, lexicon, claims policy, visual identity)
   - Missing → flag: Phase 2 (brand-voice-lock) must create it before drafting

2. Past campaign intelligence:
   - Glob: .claude/campaigns/*/campaign-report.md → prior results, baselines
   - Read latest content-calendar.json → active commitments, open slots

3. Content inventory:
   - Glob: content/**/*.md → existing assets by topic and type
   - Identify reusable or refreshable assets for this campaign

4. Audience assets:
   - Glob: .claude/research/personas/*.md → existing personas
   - Missing personas → note that persona-research may be a prerequisite

5. Pipeline config:
   - Read .claude/pipeline.config.json → assetTypes, gates, readability targets
   - Use assetTypes[type] defaults for the asset plan
```

### Step 2: Compile Discovery Summary

Present findings before asking anything:

```
## Campaign Context
- Brand lockfile: [found vX.Y / MISSING — will be created in Phase 2]
- Personas on file: [list or "none"]
- Past campaigns: [count, with last primary-KPI results if available]
- Active calendar commitments: [count in the campaign window]
- Reusable content: [count of related existing assets]
```

### Step 3: Ask Targeted Questions (Max 5)

Only ask what discovery could not answer. Skip any question already answered by the user's request or the fast-path document.

**Question 1 — Objective & KPI:**
> What should this campaign achieve, and how will we know it worked?
> (One primary KPI with a target number and date. "Awareness" needs a metric too.)

**Question 2 — Audience:**
> Who is this for? [Offer existing personas if found]
> And who is it deliberately NOT for?

**Question 3 — Channels & Scope:**
> Which channels should this run on? [Suggest based on assetTypes and past performance]
> (Default: the channels with proven performance in past reports)

**Question 4 — Budget & Constraints:**
> Is there paid spend involved? What's the envelope?
> Any hard constraints — launch dates, embargoes, claims we can't make, regions?

**Question 5 — Approvals:**
> Who approves strategy and final assets? (Default: you, at both gates)
> Anything here need legal review? (health/finance/legal claims, sweepstakes, endorsements)

### Step 4: Generate campaign-brief.json

Write the brief that all downstream phases consume:

```jsonc
// .claude/plans/campaign-brief.json
{
  "version": "1.0.0",
  "source": "interview",            // "interview" | "document"
  "createdAt": "2026-07-21T12:00:00Z",
  "campaign": {
    "name": "Spring Feature Launch",
    "slug": "2026-q3-feature-launch",   // used in UTMs and file naming
    "type": "launch",                    // "launch" | "evergreen" | "promo" | "nurture" | "rebrand"
    "description": "One-paragraph summary of the campaign"
  },
  "objective": {
    "primary": "Drive signups for the new feature",
    "kpi": { "metric": "signups", "target": 500, "baseline": 120, "deadline": "2026-09-01" },
    "secondary": ["newsletter growth", "feature-page traffic"]
  },
  "audience": {
    "personas": ["ops-manager-olivia"],     // refs to .claude/research/personas/
    "segments": ["trial users", "newsletter subscribers"],
    "exclusions": ["current enterprise customers"]
  },
  "positioning": {
    "singleMindedMessage": "The one thing every asset must communicate",
    "valueProps": ["...", "...", "..."],
    "proofPoints": [
      { "claim": "Saves 5 hours/week", "source": "2026 customer survey, n=142" }
    ]
  },
  "channels": [
    { "channel": "blog",   "assetType": "blog-post",     "count": 2, "ownerAgent": "blog-writer" },
    { "channel": "email",  "assetType": "email-sequence", "count": 1, "ownerAgent": "email-marketer" },
    { "channel": "social", "assetType": "social-batch",   "count": 1, "ownerAgent": "social-media-manager" },
    { "channel": "paid",   "assetType": "ad-campaign",    "count": 1, "ownerAgent": "paid-ads-specialist" }
  ],
  "budget": {
    "currency": "EUR",
    "paidMedia": 2000,               // null if organic-only
    "production": null,
    "approvalRequired": true          // always true — spend passes the approval gate
  },
  "timeline": {
    "cycleStart": "2026-07-21",
    "launchDate": "2026-08-25",
    "cycleWeeks": 6
  },
  "assetPlan": [
    {
      "id": "blog-01",
      "assetType": "blog-post",
      "title": "Working title",
      "channel": "blog",
      "ownerAgent": "blog-writer",
      "briefNotes": "Angle, keyword, CTA",
      "dueWeek": 4,
      "status": "planned"            // planned | drafting | in-qa | approved | scheduled | published
    }
  ],
  "measurement": {
    "utmCampaign": "2026-q3-feature-launch",
    "trackingOwner": "attribution-analyst",
    "reportSchedule": "launch +7d, +30d"
  },
  "compliance": {
    "regulatedTopics": [],            // e.g. ["health", "finance"] — triggers legal review
    "legalReviewRequired": false
  },
  "approvals": {
    "strategyGate": { "required": true, "approver": "user", "approvedAt": null },
    "publishGate":  { "required": true, "perAsset": true }
  }
}
```

### Step 5: Confirm and Proceed

Present a summary of the campaign plan:

```
## Campaign Plan Summary
- Objective: 500 signups by Sep 1 (baseline 120)
- Audience: ops-manager-olivia; excluding enterprise customers
- Channels: blog (2), email sequence (1), social batch (1), paid (€2,000 pending approval)
- Launch: Aug 25 · Cycle: 6 weeks
- Gates: strategy approval before drafting; per-asset approval before anything publishes

Proceed to brand voice lock? (This starts the autonomous pipeline)
```

Wait for user confirmation before the pipeline continues.

## Output

**Primary:** `.claude/plans/campaign-brief.json`
**Secondary:** Campaign plan summary displayed to user

## Error Handling

- **No measurable KPI given:** Push once for a number; if declined, record the KPI as `"metric": "unmeasured"` and flag it prominently in the strategy gate
- **No brand lockfile:** Continue — Phase 2 (brand-voice-lock) creates it; drafting cannot start without it
- **Conflicting calendar commitments:** Surface the collision and ask which yields
- **Regulated topic detected in the goal:** Set `legalReviewRequired: true` automatically and say so

## Integration

- **Consumed by:** `brand-voice-lock`, `content-calendar`, `editorial-qa`, all drafting skills, `/build-campaign`
- **Fast-path trigger:** an existing brief document or campaign-brief.json — see Step 0
- **Uses:** Read, Glob, Grep, pipeline.config.json
