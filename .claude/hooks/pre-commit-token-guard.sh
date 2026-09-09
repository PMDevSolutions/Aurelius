#!/usr/bin/env bash
# pre-commit-token-guard.sh — PostToolUse hook
# When the agent runs `git commit`, runs verify-tokens.sh and surfaces any
# token-violation summary so the agent can fix them before the commit is
# considered done. Does not block the commit — Claude's tool call has already
# completed by the time this fires.
#
# Args:
#   $1  TOOL_INPUT
#   $2  TOOL_OUTPUT (unused; the commit's own output isn't relevant here)
#
# Exit: always 0.

set -u
TOOL_INPUT="${1:-}"
trap 'exit 0' ERR

if ! echo "$TOOL_INPUT" | grep -q "git commit"; then
  exit 0
fi

if [ ! -f src/styles/design-tokens.lock.json ] || [ ! -d src ]; then
  exit 0
fi

if [ ! -x ./scripts/verify-tokens.sh ]; then
  exit 0
fi

RESULT="$(./scripts/verify-tokens.sh 2>&1)" || EXIT=$?
EXIT="${EXIT:-0}"

if [ "$EXIT" -ne 0 ]; then
  echo "[pre-commit-guard] Token violations found. Fix before committing:"
  echo "$RESULT" | tail -5
fi

exit 0
