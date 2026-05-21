#!/usr/bin/env bash
# post-build-qa.sh — PostToolUse hook
# Reminds the agent to run the quality gate after a successful pnpm build.
#
# Args:
#   $1  TOOL_INPUT   The Bash command Claude just ran.
#   $2  TOOL_OUTPUT  The stdout/stderr returned by that command.
#
# Exit: always 0. Hook output goes to stdout; absence of output means no reminder.

set -u
TOOL_INPUT="${1:-}"
TOOL_OUTPUT="${2:-}"

# Tolerate any unexpected runtime error — hooks must never break the parent call.
trap 'exit 0' ERR

if echo "$TOOL_INPUT" | grep -q "pnpm build" \
   && echo "$TOOL_OUTPUT" | grep -q "built in"; then
  echo "[post-build-qa] Build succeeded. Run quality gate: pnpm vitest run && pnpm tsc --noEmit && ./scripts/verify-tokens.sh"
fi

exit 0
