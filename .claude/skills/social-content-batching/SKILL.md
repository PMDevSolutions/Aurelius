---
name: social-content-batching
description: Batch production of platform-native social content — turns one campaign idea or pillar asset into a full multi-platform batch with per-platform adaptation, scheduling map, and QA. Keywords: social batch, social content, repurposing, platform-native, social calendar, post variants
---

# Social Content Batching — One Idea, Many Natives

## Purpose

Produce social content in efficient batches without the copy-paste smell. One campaign idea or pillar asset becomes a coordinated batch of platform-native posts — each re-conceived for its platform's format and culture, mapped to calendar slots, and passed through QA as a set.

## When to Use

- Social components of `/build-campaign` (drafting phase)
- Repurposing a pillar asset (blog post, report, video) into social
- Weekly/monthly evergreen batch production

## Inputs

- **Required:** The source idea or pillar asset + target platforms
- **Required:** `brand-guidelines.json`; platform strategy from social-media-manager
- **Optional:** content-calendar.json slots to fill, past post performance

## Process

### Step 1: Extract the Angle Bank

```
From the source asset, extract every postable angle:
- Claims and statistics (with their sources — they travel WITH the post)
- Contrarian or surprising points
- Step-by-step fragments (thread/carousel material)
- Quotable lines and verbatim customer language
- Questions the piece answers (engagement prompts)
Target: 8-15 angles from one pillar asset
```

### Step 2: Map Angles to Platforms

Assign each angle to the platform(s) where its format fits — with the per-platform agents advising:

```
X/Twitter (twitter-engager):     threads from step-by-steps; hot-take singles
Instagram (instagram-curator):   carousels from lists; Reels hooks from tension
TikTok (tiktok-strategist):      video hooks from surprising angles (→ video-script-writer)
Reddit (reddit-community-builder): genuine discussion starters (community rules first)
LinkedIn:                        data angles, lessons-learned narratives
Not every angle fits every platform. Forced fits get cut, not shipped.
```

### Step 3: Draft the Batch

Per post, platform-native:

```
- Format limits respected (lengths, image counts, hashtag norms per platform)
- Hook first line — feeds truncate; the first 8 words are the whole pitch
- One idea per post; one CTA maximum (many posts: none)
- Hashtags per platform norms, not sprayed everywhere
- Disclosure tags where required (#ad, partnership labels)
- Link + UTM per the attribution taxonomy where links belong
```

### Step 4: Write the Batch Spec

```jsonc
// .claude/plans/social-batches/<slug>.json
{
  "version": "1.0.0",
  "batch": "2026-q3-feature-launch-wave1",
  "source": "content/blog/automation-roi.md",
  "posts": [
    {
      "id": "x-01",
      "platform": "x",
      "format": "thread",             // single | thread | carousel | reel-script | text+image
      "angle": "5-step ROI calculation",
      "copy": ["Tweet 1…", "Tweet 2…"],
      "assets": ["carousel-roi-1.png (art-director brief ref)"],
      "link": { "url": "…", "utm": "…" },
      "claimsSources": [{ "claim": "5 hrs/week saved", "source": "2026 survey n=142" }],
      "calendarRef": "social-wave1-x-01",
      "scheduledFor": "2026-08-25T14:00:00+02:00",
      "status": "draft"               // draft | in-qa | approved | scheduled | published
    }
  ]
}
```

### Step 5: QA the Batch as a Set

Route through `editorial-qa` with batch-level checks added:
- Per-post: brand lint, readability (social target: Flesch ≥ 70), claims sourced, format limits
- Batch-level: variety check (not five identical posts), cadence fit vs calendar caps, cross-platform consistency of facts and offer terms

### Step 6: Stage for Approval and Scheduling

Present the full batch — copy, assets, timing map — at the human approval gate. Approved posts move to `scheduled` in the calendar. **Nothing is published or queued in a scheduling tool without the gate.** Reactive-slot templates get pre-approved tone bounds; anything outside those bounds returns to the gate.

## Output

| Artifact | Purpose |
|----------|---------|
| `.claude/plans/social-batches/<slug>.json` | Batch spec with copy, timing, sources |
| Asset briefs for art-director | Visuals the batch needs |
| Updated calendar entries | Scheduling map |

## Error Handling

- **Angle bank comes up thin (<5):** The source asset is weak for social — report that honestly and propose alternatives, don't pad with filler
- **Platform strategy missing:** Get platform selection from social-media-manager before drafting; don't default to "everywhere"
- **A statistic loses its source in shortening:** The source travels with the post or the statistic comes out — no orphaned claims on social
- **Community platform (Reddit):** Check subreddit rules explicitly; when promotion is unwelcome, recommend genuine participation instead — or nothing

## Integration

- **Consumed by:** `/build-campaign` social components, social-media-manager's calendar
- **Uses:** per-platform agents, content-creator agent, `editorial-qa`, content-calendar.json, art-director (visuals)
