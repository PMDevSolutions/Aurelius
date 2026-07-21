---
name: editorial-qa
description: Automated editorial QA with a bounded revision loop — brand-voice compliance, readability scoring, and fact-check verification on every asset before the human approval gate. The marketing analog of pixel-diff visual QA. Keywords: editorial QA, fact check, brand voice check, readability, revision loop, content review, quality gate
---

# Editorial QA — Bounded Revision Loop

## Purpose

Catch what deadline pressure misses: off-voice copy, unreadable prose, and — worst of all — unsourced or fabricated claims. Every asset passes three checks (brand voice, readability, fact-check) plus channel-specific checks, iterating through a **bounded revision loop** (max iterations from `pipeline.config.json → editorialLoop.maxRevisions`) until it passes or escalates. Nothing reaches the human approval gate unchecked.

## When to Use

- Phase 6 of the `/build-campaign` pipeline (after drafts)
- `/write-content` and `/create-blog-article` before delivery
- Any time an asset needs review before external use

## Inputs

- **Required:** The draft asset(s) — markdown, copy blocks, scripts, or email drafts
- **Required:** `brand-guidelines.json` (hard prerequisite — abort if missing)
- **Optional:** `campaign-brief.json` (for message-fidelity checks), asset type (for channel checks)

## Process

### Step 1: Determine Asset Profile

```
1. Identify assetType (blog-post, email, social-batch, ad-campaign,
   landing-page, press-release) from the brief or file location
2. Load pipeline.config.json:
   - editorialLoop.maxRevisions (default 5)
   - readability targets for this assetType
   - factCheck policy
   - assetTypes[type].qaChecks (channel-specific additions)
```

### Step 2: Run the Three Core Checks

**Check 1 — Brand voice (mechanical + editorial):**

```bash
node scripts/brand-voice-lint.js <file> --json
```

- Banned words, product naming, capitalization, required disclaimers → **BLOCK** on any hit
- Then editorial review against voice attributes and tone context → **WARN** on drift
- Performed with the brand-compliance-checker agent's verdict levels (PASS/WARN/BLOCK)

**Check 2 — Readability (mechanical):**

```bash
node scripts/readability-score.js <file> --json
```

- Flesch Reading Ease vs the assetType target (e.g., blog ≥ 60, email ≥ 65, social ≥ 70, ads ≥ 75)
- Sentence-length and passive-voice ratios reported
- Below target → **WARN** by default; `readability.blocking: true` makes it **BLOCK**

**Check 3 — Fact-check (editorial, non-negotiable):**

```
1. Extract every factual claim: statistics, comparisons, superlatives,
   testimonials, product capabilities, dates, names
2. For each claim, verify:
   - Statistic → has a source (link/citation with date)? Source actually says this?
   - Superlative → substantiation on file per claims policy?
   - Testimonial → real and permissioned?
   - Product claim → true of the current product?
3. Verdicts per claim: SOURCED / NEEDS-SOURCE / UNSUPPORTED / FABRICATED
4. NEEDS-SOURCE and UNSUPPORTED → BLOCK until sourced, reworded as opinion,
   or cut. FABRICATED → BLOCK, always, no waiver at this level.
```

### Step 3: Channel-Specific Checks (per assetType)

```
blog-post / landing-page:  node scripts/seo-check.js <file> --json
                           (title/meta lengths, heading structure, links)
email:                     compliance elements present (unsubscribe, address,
                           sender identity); subject+preview pair reviewed
social-batch:              per-platform length/format limits; disclosure tags
ad-campaign:               platform character limits; policy-sensitive wording
press-release:             inverted pyramid; quotes verified with their speakers
```

Channel checks are **WARN** unless the config marks them blocking for the assetType.

### Step 4: The Bounded Revision Loop

```
iteration = 1
while iteration <= editorialLoop.maxRevisions:
    run checks (Steps 2-3)
    if no BLOCK findings and WARNs acceptable → PASS, exit loop
    else:
        produce the findings report (Step 5 format)
        route targeted fixes to the owning agent/skill
        - Fix ONLY the findings; no drive-by rewrites
        - Preserve the asset's approved angle and structure
        iteration += 1

if still failing after maxRevisions:
    ESCALATE to the user with the final findings report:
    - remaining findings and why they persist
    - options: accept-with-waiver (logged) / cut the asset / extend the loop
    Never silently ship a failing asset; never loop forever.
```

`stopOnFirstPass` (config) ends the loop the first time everything passes — no gold-plating iterations.

### Step 5: Findings Report Format

Per asset, per iteration:

```markdown
## Editorial QA — [asset id] — iteration [n]/[max]

**Verdict:** PASS | REVISE (blockers: N) | ESCALATED

### Blockers
1. [FACT] "73% of teams…" — no source found. Fix: cite or cut.
2. [VOICE] "game-changing" — banned word (lexicon.banned). Fix: replace.

### Warnings
1. [READ] Flesch 54 vs target 60 — long sentences in §2 (avg 31 words).
2. [SEO] Meta description 178 chars (max 155).

### Passed
- Brand voice attributes, product naming, disclaimers, link check
```

Write the consolidated run to `.claude/campaigns/<slug>/editorial-qa-report.md`.

### Step 6: Hand Off to the Approval Gate

Assets that PASS (or carry logged waivers) proceed to the human approval gate with their QA reports attached. The gate reviews the work **and** its QA evidence — approvals are informed, not rubber-stamped.

## Output

| Artifact | Purpose |
|----------|---------|
| Per-asset findings reports | What failed, why, and the specific fix |
| `editorial-qa-report.md` | Consolidated run record for the campaign |
| PASS/REVISE/ESCALATED verdicts | Pipeline flow control |

## Error Handling

- **brand-guidelines.json missing:** Abort with instructions to run `/setup-brand` — QA without a lockfile is opinion, not enforcement
- **Scripts unavailable:** Fall back to editorial-only checks; mark mechanical checks SKIPPED in the report (never silently)
- **Claim unverifiable in available time:** That's a finding (NEEDS-SOURCE), not a pass
- **Two agents disagree on a WARN:** The asset owner decides; BLOCKs are not negotiable below the approval gate

## Integration

- **Consumed by:** `/build-campaign` (Phase 6), `/write-content`, `/create-blog-article`
- **Uses:** `brand-voice-lint.js`, `readability-score.js`, `seo-check.js`, brand-compliance-checker agent, legal-compliance-checker agent (escalations)
- **Config:** `pipeline.config.json → editorialLoop, readability, factCheck, assetTypes[].qaChecks`
