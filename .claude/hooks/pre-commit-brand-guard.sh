#!/usr/bin/env bash
# pre-commit-brand-guard.sh — PostToolUse hook (Bash matcher).
#
# When a `git commit` is detected and brand-guidelines.json exists, lint the
# staged content files against the brand lockfile and surface violations as a
# warning. Informational only — never blocks (always exits 0); the hard
# enforcement lives in editorial QA and the husky pre-commit.
#
# Args: $1 = TOOL_INPUT (the Bash command), $2 = TOOL_OUTPUT
set -u
trap 'exit 0' ERR

TOOL_INPUT="${1:-}"

case "$TOOL_INPUT" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

[ -f "brand-guidelines.json" ] || exit 0
[ -f "scripts/brand-voice-lint.js" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

# Lint only staged Markdown under content/ — fast and commit-relevant.
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '^content/.*\.(md|mdx)$' || true)
[ -n "$STAGED" ] || exit 0

# shellcheck disable=SC2086
if ! node scripts/brand-voice-lint.js $STAGED >/dev/null 2>&1; then
  echo "⚠ Brand guard: staged content has brand-voice violations."
  echo "  Run: node scripts/brand-voice-lint.js $(echo "$STAGED" | tr '\n' ' ')"
  echo "  (Violations block at editorial QA — fixing them now is cheaper.)"
fi

exit 0
