---
name: content-calendar
description: Generates and maintains content-calendar.json — dated, channel-mapped, status-tracked content slots validated by validate-content-calendar.js. The scheduling backbone of the campaign pipeline. Keywords: content calendar, editorial calendar, publishing schedule, content planning, cadence
---

# Content Calendar — The Scheduling Backbone

## Purpose

Turn strategy into a dated, validated production schedule. `content-calendar.json` tracks every planned asset — channel, owner, status, dependencies — and `scripts/validate-content-calendar.js` keeps it structurally honest (no orphan dates, no status jumps, no overloaded days). The calendar is a promise to the audience: this skill keeps it keepable.

## When to Use

- Phase 4 of `/build-campaign` (after the strategy gate)
- `/plan-content-calendar` for standalone or quarterly planning
- Whenever the schedule changes (additions, slips, cancellations)

## Inputs

- **Required:** `campaign-brief.json` assetPlan (pipeline mode) or planning parameters (standalone: range, channels, cadence)
- **Optional:** Existing `content-calendar.json` (update mode), team capacity notes

## Process

### Step 1: Gather Scheduling Constraints

```
1. From the brief: assetPlan entries, launchDate, cycleWeeks
2. From the existing calendar: committed slots in the window
3. Cadence rules (config or defaults):
   - sustainable per-channel cadence (e.g., blog 1-2/wk, newsletter 1/wk)
   - maxPerDay per channel; quiet days (weekends unless data says otherwise)
4. External timing: launches, seasonal moments, embargo dates
5. Production reality: QA loop + approval gate lead time before every
   publish date (default: publish minus 5 business days = draft due)
```

### Step 2: Place Entries

```
1. Anchor launch-critical assets to launchDate (work backwards through
   QA and approval lead times)
2. Sequence pillar before derivatives (dependencies)
3. Fill evergreen slots around campaign spikes
4. Respect cadence caps — resize scope rather than overload days
5. Every entry gets: owner agent, due dates (draft/QA/approve/publish), status
```

### Step 3: Write content-calendar.json

```jsonc
{
  "version": "1.0.0",
  "generatedAt": "2026-07-21T12:00:00Z",
  "range": { "start": "2026-07-21", "end": "2026-09-05" },
  "cadence": {
    "blog": { "perWeek": 2, "maxPerDay": 1 },
    "email": { "perWeek": 1, "maxPerDay": 1 },
    "social": { "perWeek": 5, "maxPerDay": 2 }
  },
  "entries": [
    {
      "id": "blog-01",
      "title": "Working title",
      "assetType": "blog-post",
      "channel": "blog",
      "campaign": "2026-q3-feature-launch",   // or "evergreen"
      "pillar": "automation-roi",
      "ownerAgent": "blog-writer",
      "status": "planned",   // planned → drafting → in-qa → approved → scheduled → published (or cancelled)
      "dates": {
        "draftDue": "2026-08-11",
        "qaDue": "2026-08-15",
        "approvalDue": "2026-08-19",
        "publish": "2026-08-25"
      },
      "dependencies": [],      // entry IDs that must publish first
      "briefRef": ".claude/plans/campaign-brief.json#assetPlan.blog-01"
    }
  ]
}
```

**Status flow is one-way** (except back to `drafting` from `in-qa` during the revision loop, and any → `cancelled`). `approved → scheduled → published` transitions require the human approval gate — the calendar records reality; it never grants permission.

### Step 4: Validate

```bash
node scripts/validate-content-calendar.js --json
```

Checks: schema validity, date ordering (draft < qa < approval < publish), dependency existence and ordering, cadence-cap violations, entries publishing without approval lead time, stale statuses (in-qa for >10 days). Fix findings before presenting.

### Step 5: Present the Calendar

```
## Content Calendar — Jul 21 → Sep 5
Week 4  Aug 11  blog-01 draft due          (blog-writer)
Week 5  Aug 19  ALL launch assets approval gate
Week 6  Aug 25  LAUNCH: blog-01 + email-01 + social-01
...
Cadence check: blog 2/wk ✓ · email 1/wk ✓ · no overloaded days ✓
```

## Output

**Primary:** `content-calendar.json` (project root)
**Secondary:** Validation report + human-readable schedule summary

## Error Handling

- **Overcommitted window:** Present the collision and resize options (cut scope, slip dates, add capacity) — never silently overload
- **Publish date without approval lead time:** BLOCK the entry placement; approvals are not compressible below one business day
- **Validator unavailable:** Perform the same checks manually; note SKIPPED-mechanical in the summary

## Integration

- **Consumed by:** `/build-campaign` (Phase 4), `/plan-content-calendar`, campaign-producer, social-content-batching, all drafting skills
- **Uses:** `validate-content-calendar.js`, campaign-brief.json, content-strategist agent
