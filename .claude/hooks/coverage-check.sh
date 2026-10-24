#!/usr/bin/env bash
# coverage-check.sh — PostToolUse hook (matcher: Bash, if: "Bash(*vitest*)").
#
# After a vitest run that printed coverage in an Aurelius project, compare
# statement coverage with pipeline.config.json → tdd.coverageThreshold:
#   • below the threshold → a reminder naming both numbers;
#   • at or above it → silent;
#   • no "All files" row to read → a reminder to check the report by hand.
#
# Input: the hook event as JSON on stdin. Output: JSON on stdout, or nothing.
# Always exits 0.
set -u
trap 'exit 0' ERR

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/hook-io.sh
source "$HOOK_DIR/lib/hook-io.sh"
# shellcheck source=lib/pipeline-helpers.sh
source "$HOOK_DIR/lib/pipeline-helpers.sh"

hook_read_input
hook_read_context

[ "$TOOL_NAME" = "Bash" ] || exit 0
case "$TOOL_COMMAND" in *vitest*) ;; *) exit 0 ;; esac
OUTPUT="$(pipeline_bash_output)"
printf '%s' "$OUTPUT" | grep -Eq '[Cc]overage|% Stmts' || exit 0
CONFIG="$(pipeline_config_file "$(pipeline_app_dir "$TOOL_COMMAND")")"
[ -n "$CONFIG" ] || exit 0

THRESHOLD="$(pipeline_config_get "$CONFIG" tdd.coverageThreshold 80)"
# vitest's text reporter: "All files |   85.71 |    80 |   100 |   85.71 |" (% Stmts first).
PCT="$(printf '%s\n' "$OUTPUT" | sed -nE 's/^[[:space:]]*All files[[:space:]]*\|[[:space:]]*([0-9.]+).*/\1/p' | head -1)"

if [ -n "$PCT" ]; then
  if awk -v p="$PCT" -v t="$THRESHOLD" 'BEGIN { exit !(p + 0 < t + 0) }'; then
    hook_additional_context PostToolUse "[coverage-check] Statement coverage is ${PCT}%, below the ${THRESHOLD}% threshold (pipeline.config.json → tdd.coverageThreshold). Cover the reported lines before the quality gate."
  fi
  exit 0
fi

hook_additional_context PostToolUse "[coverage-check] Check the coverage report against the ${THRESHOLD}% threshold (pipeline.config.json → tdd.coverageThreshold)."
exit 0
