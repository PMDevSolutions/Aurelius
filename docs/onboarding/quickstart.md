# Quickstart Guide

Get from zero to your first gated campaign in under 10 minutes.

## Prerequisites

- [Claude Code](https://claude.com/claude-code) installed
- Node.js 20+ and pnpm (`corepack enable`)
- Git

## 1. Clone and Install (2 min)

```bash
git clone <repository-url>
cd maecenas
pnpm install
```

Verify the framework is healthy:

```bash
./scripts/verify-all.sh
```

Expected on a fresh clone: `pipeline-config` and `doc-counts` pass; brand-voice, readability, seo, and calendar **skip** (their subjects don't exist yet — that's correct).

## 2. Create Your Brand Lockfile (3 min)

```bash
claude
> /setup-brand
```

The interview asks at most 5 questions (personality, banned/beloved words, tone under pressure, claims rules, disclaimers). If you have existing brand material, pass it:

```
> /setup-brand docs/old-brand-book.pdf https://yoursite.com
```

Output:
- `brand-guidelines.json` — the lockfile everything is checked against
- `docs/brand-setup/brand-voice.md` — the generated one-page reference

Sanity-check it:

```bash
node scripts/brand-voice-lint.js --self-test
```

## 3. Run Your First Campaign (5 min to start; the pipeline does the rest)

```
> /build-campaign grow newsletter signups to 500/month by the end of Q3
```

What happens:

1. **Brief intake** — a short interview produces `campaign-brief.json`
2. **Strategy gate** — you approve objective, audience, channels, and budget *before* anything is drafted
3. **Calendar + drafts + editorial QA** — parallel per-asset lanes; every draft passes brand lint, readability, and fact-check (max 5 revisions each)
4. **Approval gate** — you review the approval package and sign off per asset
5. **Report** — `campaign-report.md` with the measurement plan

Nothing is published, sent, scheduled, or spent unless you approve it. That is not a setting you can accidentally turn off — the schema pins the gate to `required: true`.

## 4. Smaller Entry Points

Not ready for a full campaign?

```
> /write-content blog-post how our customers cut onboarding time
> /create-blog-article dunning emails that save failed payments
> /plan-content-calendar next 6 weeks, blog and newsletter
> /competitor-teardown competitor.com
> /analyze-performance exports/last-month.csv
```

Every path runs the same QA gates.

## 5. Daily Verification

```bash
./scripts/verify-all.sh          # before asking for approval on anything
pnpm test                        # if you changed framework scripts
```

## Where to Go Next

- [Architecture](architecture.md) — how the pieces fit
- [Campaign Pipeline Guide](../campaign-pipeline/README.md) — every phase in detail
- [Brand Setup Guide](../brand-setup/README.md) — evolving the lockfile safely
- [Troubleshooting](troubleshooting.md) — when something looks wrong
