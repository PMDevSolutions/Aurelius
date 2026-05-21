---
allowed-tools: Bash, Read
---

# /ci — CI-Optimized Verification

Runs the same checks as `/verify-all` but in non-interactive, machine-readable mode. Designed for CI pipelines, pre-merge gates, and automation: no prompts, JSON output, exit code reflects overall pass/fail.

## Usage

```
/ci
/ci --skip dead-code,security
/ci --include lint-and-format,types,tests
```

The slash command wraps `./scripts/verify-all.sh --ci`. The `--ci` flag implies `--json` and sets non-interactive behavior. Pass `--skip` or `--include` to filter checks.

## What runs

Same eight checks as `/verify-all`, in the same order:

```
lint-and-format → types → tests → accessibility → tokens → dead-code → security → bundle-size
```

`bundle-size` is automatically skipped when no build artifact (`dist/`, `.next/`, `build/`, `out/`) is present. No other check requires a dev server, so all of them run in CI without extra setup.

## Output

JSON written to stdout:

```json
{
  "ok": false,
  "summary": { "pass": 6, "fail": 1, "skip": 1, "total": 8 },
  "checks": [
    { "name": "lint-and-format", "status": "pass", "exitCode": 0, "durationMs": 2618, "reason": "" },
    { "name": "types",           "status": "fail", "exitCode": 1, "durationMs": 1843, "reason": "exit 1" },
    { "name": "tests",           "status": "pass", "exitCode": 0, "durationMs": 4205, "reason": "" },
    ...
    { "name": "bundle-size",     "status": "skip", "exitCode": 0, "durationMs": 0,    "reason": "no build artifact (dist/.next/build/out)" }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `ok` | `true` only when every check passed or was skipped intentionally |
| `summary.pass` / `fail` / `skip` / `total` | Counts across all checks |
| `checks[].status` | `pass` \| `fail` \| `skip` |
| `checks[].exitCode` | The exit code returned by the underlying check script |
| `checks[].durationMs` | Wall-clock duration |
| `checks[].reason` | Empty on pass; short reason on fail/skip |

## Steps

### 1. Run the orchestrator in CI mode

```bash
./scripts/verify-all.sh --ci $ARGUMENTS
```

### 2. Surface results to the user

Parse the JSON and report the summary in plain text:

```
6 passed, 1 failed, 1 skipped
Failing: types (exit 1, 1843ms)
```

When invoked from a CI pipeline, pipe the JSON straight to a downstream step or store it as a build artifact.

## Exit codes

- `0` — every check passed or was skipped
- `1` — one or more checks failed

The exit code is what CI runners pivot on, so do not swallow it.

## Differences vs `/verify-all`

| Aspect | `/verify-all` | `/ci` |
|--------|---------------|-------|
| Output | Human-readable summary table | JSON to stdout |
| Interactivity | Allowed (no prompts today, but reserved) | Forbidden |
| Use case | Local development | CI pipelines, automation, scripts |
| Exit code on failure | 1 | 1 |

## Related

- `/verify-all` — human-readable version of the same checks
- `./scripts/verify-all.sh --help` — full flag documentation
