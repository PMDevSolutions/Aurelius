---
paths:
  - "scripts/**"
  - ".claude/hooks/**"
  - ".husky/**"
---

# Scripts and hooks

- Bash runs on the macOS system bash 3.2 as well as Linux bash 5 in CI. Avoid `${var,,}` and `${var^^}`, `mapfile`/`readarray`, associative arrays and `&>>`; use `shopt -s nocasematch` or `tr` for case and read loops for arrays. With `set -u`, guard empty-array expansions.
- Shared helpers: `scripts/lib/common.sh` (`common_project_root`, `say_*` output helpers) and `scripts/lib/colors.sh`; Node helpers are ES modules in `scripts/lib/`.
- Exit codes: 0 pass, 1 check failed, 2 usage or input error. A script that other tooling reads takes `--json`.
- Every script has a vitest file in `scripts/__tests__/`. Run them with `pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/`; they share state files, so the config runs them one file at a time.
- Prettier (printWidth 100) and ESLint cover `scripts/`; `.claude/` is excluded from both.
- A new check is registered in `scripts/verify-all.sh` (a `.js` check runs with node) and its test, and listed in `scripts/README.md` and CLAUDE.md.
