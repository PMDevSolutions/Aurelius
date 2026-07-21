---
name: brand-voice-lock
description: Extracts the brand's voice, tone, lexicon, claims policy, and visual identity into a versioned brand-guidelines.json lockfile — the single source of truth every asset is checked against. Generates a human-readable style guide from the lockfile. Keywords: brand voice, brand guidelines, lockfile, tone of voice, banned words, claims policy, voice drift
---

# Brand Voice Lock — Single Source of Truth

## Purpose

Solve the #1 recurring pain point in marketing production: **brand drift**. This skill extracts every brand rule — voice, tone, lexicon, claims policy, visual identity, required disclaimers — into a versioned lockfile (`brand-guidelines.json`). The lockfile becomes the single source of truth: `scripts/brand-voice-lint.js` enforces it mechanically, the brand-compliance-checker agent enforces it editorially, and the editorial QA loop blocks on violations.

## When to Use

- Phase 2 of the `/build-campaign` pipeline (after `campaign-brief-intake`)
- First-time brand setup via `/setup-brand`
- Any time brand rules change and the lockfile needs a versioned update

## Inputs

- **Required:** At least one source of brand truth — existing brand docs, the live website's copy, past approved assets, or the user's answers
- **Optional:** Existing `brand-guidelines.json` (update mode), visual identity files

## Process

### Step 1: Extract Brand Signals

Gather brand evidence from every available source:

```
1. Existing documentation:
   - Glob: **/brand*.{md,pdf,json}, **/style-guide*, **/tone*
   - Read anything the team already wrote down

2. Live copy corpus:
   - Homepage, about page, pricing page, recent posts (user-provided or fetched)
   - Extract: recurring phrases, sentence rhythm, formality level, POV

3. Approved-asset corpus:
   - content/**/*.md marked approved; past campaign assets
   - These show the voice as practiced, not just as aspired

4. The user interview (only for gaps — max 5 questions):
   - Three adjectives for the brand's personality — and one it must never be
   - Words/phrases that are banned or beloved
   - How the brand handles bad news (tone under pressure)
   - Claims rules: what may never be promised
   - Required disclaimers and regulated topics
```

### Step 2: Derive the Rule Set

Turn observations into checkable rules. Every rule must be enforceable — by script (lexicon, disclaimers) or by review (tone, personality):

- **Voice attributes:** 3-4 personality traits, each with a do/don't example pair
- **Tone contexts:** how the voice modulates for launch, support, crisis, legal
- **Lexicon:** preferred terms with their rejected alternatives; banned words (hard blocks); product naming and capitalization rules
- **Claims policy:** source requirements for statistics, superlative rules, testimonial rules, prohibited promises
- **Visual identity:** locked palette (hex), typography, logo rules, imagery direction
- **Compliance:** required disclaimers per asset type, regulated topics, disclosure rules

### Step 3: Write Lockfile

Write `brand-guidelines.json` at the project root:

```jsonc
{
  "version": "1.0.0",
  "generatedAt": "2026-07-21T12:00:00Z",
  "sources": ["docs/brand-book-2025.pdf", "site copy corpus", "user interview"],

  "brand": {
    "name": "Acme",
    "tagline": "Ship happier",
    "boilerplate": "Acme is the ... (approved 50-word company description)"
  },

  "voice": {
    "personality": ["confident", "warm", "plainspoken"],
    "neverBe": ["smug", "breathless", "corporate"],
    "attributes": [
      {
        "trait": "plainspoken",
        "do": "Say what the product does in words a customer would use",
        "dont": "Hide behind jargon: 'leverage synergies to unlock value'"
      }
    ],
    "pointOfView": "first-person plural (we) to customer (you)",
    "examplePhrases": ["Here's how it works.", "No surprises in the bill."]
  },

  "tone": {
    "contexts": {
      "launch":  "Energetic but concrete — excitement backed by specifics",
      "support": "Calm, accountable, solution-first",
      "crisis":  "Honest, human, no defensiveness, no humor",
      "legal":   "Precise and unembellished"
    }
  },

  "lexicon": {
    "preferred": [
      { "use": "customers", "insteadOf": ["users", "end-users"] },
      { "use": "sign up",   "insteadOf": ["signup (as verb)", "register"] }
    ],
    "banned": ["synergy", "world-class", "revolutionary", "game-changing", "best-in-class"],
    "productNames": [
      { "correct": "Acme Flow", "incorrect": ["AcmeFlow", "acme flow", "Flow by Acme"] }
    ],
    "capitalization": ["Sentence case for headlines", "No ALL CAPS except legal"]
  },

  "claims": {
    "requireSourceForStatistics": true,
    "superlativesRequireSubstantiation": true,
    "testimonialPolicy": "real, permissioned, unedited in substance; permission documented",
    "prohibited": ["guarantee", "#1", "the only", "risk-free"],
    "comparativeClaims": "must be current, accurate, and substantiated; legal review for named competitors"
  },

  "visual": {
    "colors": {
      "primary":   { "hex": "#2563eb", "name": "Acme Blue" },
      "secondary": { "hex": "#0f172a", "name": "Ink" },
      "accent":    { "hex": "#f59e0b", "name": "Signal" }
    },
    "typography": {
      "heading": { "family": "Plus Jakarta Sans", "weights": [600, 700] },
      "body":    { "family": "Inter", "weights": [400, 500] }
    },
    "logo": {
      "clearSpace": "1x logo height on all sides",
      "minSizePx": 24,
      "donts": ["stretch", "recolor", "place on busy imagery"]
    },
    "imagery": {
      "style": "Real people, natural light, honest contexts",
      "avoid": ["stocky handshakes", "fake laptops-and-lattes", "misleading before/afters"]
    }
  },

  "compliance": {
    "disclaimers": [
      { "assetType": "email",       "text": "Unsubscribe link + physical address", "required": true },
      { "assetType": "ad-campaign", "text": "Results vary. See terms.",            "required": false }
    ],
    "regulatedTopics": [],
    "disclosureRules": ["Sponsored/affiliate content labeled per FTC guidance"]
  }
}
```

### Step 4: Generate the Human Style Guide

Generate `docs/brand-setup/brand-voice.md` from the lockfile — a one-page quick reference (personality, five most-broken rules, example do/don't pairs). Auto-generated; header notes "do not edit — edit brand-guidelines.json".

### Step 5: Validate Lockfile

1. **Enforceability:** every lexicon/claims/compliance rule is concrete enough for `brand-voice-lint.js` to check or a reviewer to verdict
2. **No contradictions:** banned words don't appear in examplePhrases or boilerplate
3. **Completeness:** every assetType in pipeline.config.json has disclaimer coverage decided (even if "none required")
4. **Round-trip:** run `node scripts/brand-voice-lint.js --self-test` to confirm the lockfile parses

Report gaps to the user before proceeding.

## Output

| File | Purpose |
|------|---------|
| `brand-guidelines.json` | Versioned lockfile — single source of truth |
| `docs/brand-setup/brand-voice.md` | Human-readable quick reference (generated) |

## Lockfile Update Flow

When the brand evolves:
1. Re-run this skill (or edit deliberately)
2. Bump `version` and `generatedAt`; never silent-edit
3. Diff against the previous version; show changes for approval
4. Regenerate the style guide
5. Re-lint recent assets: `node scripts/brand-voice-lint.js content/` to find newly-drifted work

## Error Handling

- **No sources at all:** Run the full `/setup-brand` interview; mark every derived rule `"confidence": "unvalidated"` and recommend a corpus review later
- **Sources conflict:** Present both readings, let the user pick; record the decision in `sources`
- **Voice attributes too generic** ("innovative, passionate"): Push back once with sharper options observed in the corpus
- **User wants a rule that can't be checked:** Keep it, but flag it as review-only so nobody expects the linter to catch it

## Integration

- **Produces:** `brand-guidelines.json`, `docs/brand-setup/brand-voice.md`
- **Consumed by:** `editorial-qa` (blocking checks), `brand-voice-lint.js` (mechanical enforcement), brand-compliance-checker agent (editorial enforcement), every drafting skill and agent
- **Uses:** Read, Glob, Grep, user interview
