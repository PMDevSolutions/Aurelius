#!/usr/bin/env bash
# regression-reminder.sh — PostToolUse hook
# Suggests running visual regression tests after a successful build, but only
# when baseline screenshots already exist (otherwise there's nothing to diff).
#
# Args:
#   $1  TOOL_INPUT
#   $2  TOOL_OUTPUT
#
# Exit: always 0.

set -u
TOOL_INPUT="${1:-}"
TOOL_OUTPUT="${2:-}"
trap 'exit 0' ERR

if ! echo "$TOOL_INPUT" | grep -q "pnpm build"; then
  exit 0
fi
if ! echo "$TOOL_OUTPUT" | grep -qE "Build|build.*complete|Successfully compiled|built in"; then
  exit 0
fi

if [ ! -d .claude/visual-qa/baselines ]; then
  exit 0
fi

BASELINE_COUNT="$(find .claude/visual-qa/baselines -name "*.png" 2>/dev/null | wc -l | tr -d ' ')"
if [ -z "$BASELINE_COUNT" ] || [ "$BASELINE_COUNT" = "0" ]; then
  exit 0
fi

echo "[regression-reminder] $BASELINE_COUNT baselines exist. Run ./scripts/regression-test.sh to check for visual regressions."

exit 0
