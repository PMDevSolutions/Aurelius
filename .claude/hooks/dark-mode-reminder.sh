#!/usr/bin/env bash
# dark-mode-reminder.sh — PostToolUse hook
# Suggests running dark-mode verification after a visual-diff run reports PASS.
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

if echo "$TOOL_INPUT" | grep -q "visual-diff.js" \
   && echo "$TOOL_OUTPUT" | grep -q "PASS"; then
  echo "[dark-mode-reminder] Visual diff passed. Consider running dark mode verification: ./scripts/check-dark-mode.sh"
fi

exit 0
