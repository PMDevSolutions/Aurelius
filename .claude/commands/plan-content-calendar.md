---
allowed-tools: Skill, Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: [date range and/or channels, e.g. "next 8 weeks, blog + newsletter"]
description: Generate or update a validated content calendar outside the campaign pipeline
---

# /plan-content-calendar — Standalone Calendar Planning

Build or update `content-calendar.json` for a planning window: evergreen cadence, campaign slots, and refresh work — validated and honest about capacity.

## Usage

```
/plan-content-calendar next 8 weeks, blog and newsletter
/plan-content-calendar Q4, all channels
/plan-content-calendar                 (defaults: 6 weeks, channels with cadence defaults)
```

## Steps

### 1. Gather Inputs

- Existing `content-calendar.json` (extend, don't clobber) and active campaign briefs
- `pipeline.config.json → calendar` (cadence defaults, lead times, maxPerDay)
- Content pillars and refresh queue if a content audit exists
- Ask (max 3): window, channels + target cadence, known events/launches in the window

### 2. Plan with the content-calendar Skill

Invoke `content-calendar`: place campaign-committed slots first, then evergreen cadence, then refresh slots. Every entry gets owner agent, lead-time-derived due dates (draft → QA → approval → publish), and `planned` status. Resize scope rather than overload days.

### 3. Validate

```bash
node scripts/validate-content-calendar.js --json
```

Fix every finding (date ordering, cadence caps, missing approval lead time) before presenting.

### 4. Present

Show the week-by-week schedule, per-channel cadence check, and open slots. Flag capacity risks explicitly ("this cadence requires N assets/week through QA — current throughput is M").

## Notes

- The calendar records intent; the approval gate grants permission. `approved → scheduled → published` transitions only happen through the gate.
- Re-run this command whenever dates slip — a stale calendar is worse than none.

## Related

- `/build-campaign` — populates the calendar from a campaign brief (Phase 4)
- `/write-content` — executes individual entries
