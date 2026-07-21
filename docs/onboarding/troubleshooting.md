# Troubleshooting FAQ

Common issues, error messages, and solutions when working with the Maecenas framework.

## Pipeline & Gates

**"Drafting refused: no brand-guidelines.json"**
Working as designed — `brandVoice.requireLockfileBeforeDrafting` is on. Run `/setup-brand`. If you have a lockfile elsewhere, copy it to the project root and run `node scripts/brand-voice-lint.js --self-test`.

**"The editorial QA loop escalated my asset after 5 revisions"**
Also working as designed. Read the final findings report: either the asset has an unfixable problem at its current angle (usually an unsourceable claim), or two rules conflict. Your options at escalation: accept-with-waiver (logged), cut the asset, or extend the loop for one more pass. Never edit the findings away by hand — fix the asset or waive knowingly.

**"Why can't the pipeline just publish it? I trust it."**
The approval gate is schema-pinned (`humanApproval.required: const true`). Editing the config to bypass it fails `validate-pipeline-config.sh` and CI. This is the framework's central safety property; the fast path is reviewing the approval package promptly, not removing the gate.

**"The strategy gate keeps asking me questions I already answered"**
Check `.claude/plans/campaign-brief.json` — if intake wrote your answers there, the gate presents them for confirmation only. If a brief exists but is stale, delete it or tell the pipeline to regenerate at the resume prompt.

## Scripts & Checks

**`brand-voice-lint.js` exits 2**
Exit 2 means "no/invalid lockfile" (nothing to enforce), not "violations found" (that's exit 1). Run `/setup-brand` or fix the JSON parse error it printed.

**`verify-all.sh` shows checks as `skip`**
Conditional checks skip when their subject is absent: no `content/` → readability/seo skip; no `content-calendar.json` → calendar skips; no lockfile → brand-voice skips. Skips are honest, not failures.

**`check-doc-counts.sh` fails after I added an agent**
The guard found a documented count that no longer matches disk. Search the reported files for the old number and update it — `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/onboarding/`, `.claude/AGENT-NAMING-GUIDE.md` are the usual places.

**`readability-score.js` flags expert content as too hard**
Check the inferred asset type first (`[blog-post]` in the output) — a landing page living under `content/blog/` gets blog targets. Use `--type` to override, or adjust `readability.targets` in the config if your audience genuinely reads at a different level. Don't dumb down the ideas; shorten the sentences.

**`validate-content-calendar.js`: "approval lead time 0d < required 1d"**
An entry's `approvalDue` and `publish` are too close. Move one — the minimum exists so approvals never become a formality at publish time.

## Hooks & Git

**A hook printed a warning but the command succeeded**
Correct — all three hooks are informational and always exit 0. Hard enforcement lives in the pipeline gates and the husky pre-commit, not the PostToolUse hooks.

**`husky pre-commit` blocked my commit on brand-voice violations**
The commit contains `content/` files that violate the lockfile. Fix them (`node scripts/brand-voice-lint.js content/` shows exactly what and where) or — if the lockfile rule is wrong — update the lockfile deliberately with a version bump.

**Pre-commit fails with a bash error on macOS**
The scripts target bash 3.2 (macOS default). If you see `bad substitution` or `mapfile: command not found`, you're on an old checkout — those were fixed; pull latest.

## Data & Reporting

**"/analyze-performance says it can't answer without data"**
It won't invent numbers. Export the actual data (CSV/JSON from your analytics and ad platforms) and pass the paths. If you can't export yet, it produces a measurement checklist instead — that's the correct behavior, not a bug.

**Channel numbers don't add up across platforms**
They never do — platforms self-attribute generously. See the attribution-analyst agent's triangulation approach; the monthly double-counting audit quantifies the gap.

## MCP & Connectors

**Canva tools unavailable**
The Canva AI Connector is optional. Authorize it in your claude.ai connector settings (or `claude mcp` for CLI setups). The framework works fully without it; art-director briefs then target manual production.

## Still Stuck?

- Re-run with `--json` on any script for machine-readable detail
- `./scripts/verify-all.sh` for the whole-framework picture
- Check `.claude/campaigns/<slug>/` artifacts — the pipeline's state is all on disk
- Open an issue with the failing command and its full output
