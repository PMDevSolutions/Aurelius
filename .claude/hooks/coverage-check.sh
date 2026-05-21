#!/usr/bin/env bash
# coverage-check.sh — PostToolUse hook
# Reminds the agent to check the configured coverage threshold after running
# `vitest` with coverage output.
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

if echo "$TOOL_INPUT" | grep -q "vitest" \
   && echo "$TOOL_OUTPUT" | grep -qE "[Cc]overage"; then
  THRESHOLD=80
  if [ -f .claude/pipeline.config.json ] && command -v node >/dev/null 2>&1; then
    PARSED="$(node -e 'const c=require("./.claude/pipeline.config.json"); console.log(c.tdd?.coverageThreshold ?? 80);' 2>/dev/null)" || PARSED=""
    if [ -n "$PARSED" ]; then
      THRESHOLD="$PARSED"
    fi
  fi
  echo "[coverage-check] Review coverage output above. Ensure it meets the ${THRESHOLD}% threshold from pipeline.config.json."
fi

exit 0
