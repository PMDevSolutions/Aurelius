---
allowed-tools: Bash, Read
description: Run every local marketing quality check in sequence with a pass/fail summary
---

# /verify-all — Run All Local Quality Checks

Runs every local quality check in sequence and reports a pass/fail summary. Wraps `./scripts/verify-all.sh` so you do not have to remember each individual script.

## Usage

```
/verify-all
/verify-all --skip readability,seo
/verify-all --include brand-voice,calendar
```

Optional flags forward to the underlying script:
- `--skip <a,b,c>` — skip named checks (comma-separated)
- `--include <a,b>` — run only the named checks
- `--list` — list available check names and exit
- `--ci` — machine-readable JSON output, non-zero exit on failure (for automation)

## What runs

The orchestrator runs these checks in order. Each is independent — a failure in one does not stop the others.

| # | Check | Backing script | What it does |
|---|-------|----------------|--------------|
| 1 | `brand-voice` | `brand-voice-lint.js content/` | Banned words, naming, disclaimers vs brand-guidelines.json |
| 2 | `readability` | `readability-score.js content/ --check` | Flesch targets per asset type from pipeline config |
| 3 | `seo` | `seo-check.js content/` | Title/meta lengths, headings, links, sources (web content) |
| 4 | `calendar` | `validate-content-calendar.js` | Date ordering, cadence caps, approval lead times (skips if no calendar) |
| 5 | `pipeline-config` | `validate-pipeline-config.sh` | pipeline.config.json vs its JSON Schema + graph checks |
| 6 | `doc-counts` | `check-doc-counts.sh` | Documented agent/skill counts vs disk |
| 7 | `agent-plugins` | `verify-agent-plugins.sh` | Agent plugin validation (skips if none installed) |

## Steps

### 1. Run the orchestrator

```bash
./scripts/verify-all.sh $ARGUMENTS
```

The script prints per-check progress and a summary table at the end:

```
=== Summary ===
Check            Status Duration   Reason
-----            ------ --------   ------
brand-voice      pass   412ms
readability      pass   287ms
seo              pass   301ms
calendar         skip   0ms        no content-calendar.json
pipeline-config  pass   933ms
doc-counts       pass   118ms
agent-plugins    skip   0ms        no plugins installed

Totals: 5 passed, 0 failed, 2 skipped

✓ All checks passed.
```

### 2. If any check fails

The summary lists the exact command to reproduce each failure with full output. Re-run that one script to see the underlying findings:

```bash
node scripts/brand-voice-lint.js content/
```

Once the failing check is fixed, re-run `/verify-all` to confirm.

## Exit codes

- `0` — every check passed (or was skipped intentionally)
- `1` — one or more checks failed

## Related

- `/build-campaign` — runs the same checks inside the editorial QA loop
- `/setup-brand` — create brand-guidelines.json if the brand-voice check has nothing to enforce
