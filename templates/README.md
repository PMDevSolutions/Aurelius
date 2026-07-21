# Templates Reference

**Last Updated:** 2026-07-21

Starter artifacts for the campaign pipeline. Copy a template, strip the
`<placeholders>`, and the validators will keep you honest from there.

| Template | Copies to | Validated by |
|----------|-----------|--------------|
| `brand/brand-guidelines.template.json` | `brand-guidelines.json` (project root) | `node scripts/brand-voice-lint.js --self-test` |
| `campaign/campaign-brief.template.json` | `.claude/plans/campaign-brief.json` | campaign-brief-intake skill (Step 4 shape) |
| `calendar/content-calendar.template.json` | `content-calendar.json` (project root) | `node scripts/validate-content-calendar.js` |
| `email/email-sequence.template.json` | `.claude/plans/email-sequences/<slug>.json` | email-sequence skill (Step 3 shape) |
| `content/blog-post.template.md` | `content/blog/<slug>.md` | editorial QA (`brand-voice-lint`, `readability-score`, `seo-check`) |
| `content/press-release.template.md` | `content/press/<slug>.md` | editorial QA + quote verification |

## Usage

The pipeline creates these artifacts for you (`/setup-brand`, `/build-campaign`,
`/plan-content-calendar`) — the templates exist for manual starts, examples,
and tests. Prefer the commands: they interview, validate, and wire artifacts
together; the templates are just the shapes.

## Conventions

- JSON templates carry a `version` — bump it on structural changes and update
  the consuming skill's documentation in the same commit.
- Markdown templates keep the QA footnote blocks (`*Sources: …*`, `*Gate
  notes: …*`) until the corresponding gate passes, then delete them.
- Placeholders use `<angle brackets>`; anything left in angle brackets fails
  review by inspection.
