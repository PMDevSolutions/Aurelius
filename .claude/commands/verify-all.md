---
allowed-tools: Bash, Read
---

# /verify-all — Run All Local Quality Checks

Runs every local quality check in sequence and reports a pass/fail summary. Wraps `./scripts/verify-all.sh` so you do not have to remember each individual script.

## Usage

```
/verify-all
/verify-all --skip dead-code,security
/verify-all --include lint-and-format,types,tests
```

Optional flags forward to the underlying script:
- `--skip <a,b,c>` — skip named checks (comma-separated)
- `--include <a,b>` — run only the named checks
- `--list` — list available check names and exit

For machine-readable output and CI-style behavior, use `/ci` instead.

## What runs

The orchestrator runs these checks in order. Each is independent — a failure in one does not stop the others.

| # | Check | Backing script | What it does |
|---|-------|----------------|--------------|
| 1 | `lint-and-format` | `lint-and-format.sh --check` | ESLint + Prettier (no auto-fix) |
| 2 | `types` | `check-types.sh` | `tsc --noEmit` |
| 3 | `tests` | `run-tests.sh` | Vitest with coverage |
| 4 | `accessibility` | `check-accessibility.sh` | ESLint with `jsx-a11y` rules |
| 5 | `tokens` | `verify-tokens.sh` | Hardcoded-value scan vs lockfile |
| 6 | `dead-code` | `check-dead-code.sh` | Knip: unused exports/files/deps |
| 7 | `security` | `check-security.sh` | Dependency audit + anti-pattern scan |
| 8 | `bundle-size` | `check-bundle-size.sh` | Bundle analysis (skipped if no build artifact) |

## Steps

### 1. Run the orchestrator

```bash
./scripts/verify-all.sh $ARGUMENTS
```

The script prints per-check progress and a summary table at the end:

```
=== Summary ===
Check              Status Duration   Reason
-----              ------ --------   ------
lint-and-format    pass   2618ms
types              pass   1843ms
tests              pass   4205ms
accessibility      pass   1102ms
tokens             pass   320ms
dead-code          pass   2980ms
security           pass   4111ms
bundle-size        skip   0ms        no build artifact (dist/.next/build/out)

Totals: 7 passed, 0 failed, 1 skipped

✓ All checks passed.
```

### 2. If any check fails

The summary lists the exact command to reproduce each failure with full output. Re-run that one script to see the underlying errors:

```bash
./scripts/lint-and-format.sh --check
```

Once the failing check is fixed, re-run `/verify-all` to confirm.

## Exit codes

- `0` — every check passed (or was skipped intentionally)
- `1` — one or more checks failed

## Related

- `/ci` — same checks, JSON output, non-interactive (for automation / CI)
- `/lint` — lint and format only
- `/test` — tests only
