# Brand Setup Guide

`brand-guidelines.json` is the single source of truth for how the brand sounds, what it may claim, and how it looks. Every draft is checked against it — mechanically by `scripts/brand-voice-lint.js`, editorially by the brand-compliance-checker agent inside the editorial QA loop. This guide covers creating it, evolving it, and keeping it honest.

## Creating the Lockfile

```bash
claude
> /setup-brand                                   # interview-only
> /setup-brand docs/brand-book.pdf https://site  # extract from sources first
> /setup-brand content/approved/                 # learn from an approved corpus
```

The `brand-voice-lock` skill extracts what it can from your sources and interviews you only for the gaps (max 5 questions):

1. Three personality traits — and one the brand must never be
2. Banned words and beloved phrases
3. How the brand handles bad news (tone under pressure)
4. Claims rules: what may never be promised
5. Required disclaimers and regulated topics

Outputs:
- `brand-guidelines.json` at the project root (versioned)
- `docs/brand-setup/brand-voice.md` — a generated one-page quick reference (do not edit it; edit the lockfile and regenerate)

Validate immediately:

```bash
node scripts/brand-voice-lint.js --self-test
```

## What Each Section Does

| Section | Enforced by | Effect |
|---------|-------------|--------|
| `voice` | editorial review | Personality attributes with do/don't pairs; example phrases |
| `tone.contexts` | editorial review | How the voice modulates: launch, support, crisis, legal |
| `lexicon.banned` | **lint (BLOCK)** | Words that never ship |
| `lexicon.preferred` | lint (warn) | "customers, not users" mappings |
| `lexicon.productNames` | **lint (BLOCK)** | Correct casing/spacing; incorrect forms flagged with the fix |
| `claims` | **fact-check (BLOCK)** | Source requirements, prohibited promises, testimonial policy |
| `visual` | editorial review | Locked palette, typography, logo rules, imagery direction |
| `compliance.disclaimers` | **lint (BLOCK if required)** | Per-asset-type required text |

Rules should be *checkable*: "never smug" needs a do/don't example pair a reviewer can apply; "banned: synergy" is machine-checkable as-is. The skill flags rules that are neither.

## Evolving the Brand (without drift)

The lockfile changes deliberately, never silently:

1. Edit via the `brand-voice-lock` skill (or by hand, carefully)
2. **Bump `version`** and update `generatedAt`; note the rationale in `sources`
3. Re-run the self-test
4. Re-lint existing content: `node scripts/brand-voice-lint.js content/` — decide whether old assets get fixed or grandfathered
5. Commit the lockfile change in its own commit so brand history is auditable

Drift detection runs automatically: Phase 0 of every campaign lints recent content against the current lockfile, and the pre-commit hook lints staged content.

## Working With the Gates

- **Editorial QA**: lint findings of severity *error* block an asset; *warnings* ride along to the approval gate where a human may waive them (logged)
- **Fabricated claims are not a brand decision** — they block unconditionally regardless of what the lockfile says
- **Conflicts**: when a brand rule collides with a legal requirement, legal wins; log the conflict and update the lockfile

## Starting From Nothing

No brand material at all? Run the interview anyway. The skill marks derived rules `"confidence": "unvalidated"` — honest scaffolding. After two or three campaigns, revisit: the approved corpus is now a source, and the unvalidated rules either earned their place or get replaced by what actually shipped.

## Template

`templates/brand/brand-guidelines.template.json` shows the full shape with placeholder values — useful for manual starts and for seeing every available field.
