#!/usr/bin/env bash
# mutation-test-reminder.sh — PostToolUse hook
# Suggests running Stryker mutation tests after a fully-passing vitest run,
# but only when pipeline.config.json -> mutationTesting.reminder is true.
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

if ! echo "$TOOL_INPUT" | grep -q "vitest"; then
  exit 0
fi
if ! echo "$TOOL_OUTPUT" | grep -qE "Tests\s+[0-9]+ passed"; then
  exit 0
fi

if [ ! -f .claude/pipeline.config.json ] || ! command -v node >/dev/null 2>&1; then
  exit 0
fi

REMINDER="$(node -e 'const c=require("./.claude/pipeline.config.json"); console.log(c.mutationTesting?.reminder ?? false);' 2>/dev/null)" || REMINDER="false"

if [ "$REMINDER" = "true" ]; then
  echo "[mutation-test] All tests passed. Consider running mutation tests to validate test quality: npx stryker run"
fi

exit 0
