#!/usr/bin/env bash
# mutation-test-reminder.sh — PostToolUse hook (matcher: Bash, if: "Bash(*vitest*)").
#
# After a vitest run where every test passed, in an Aurelius project whose
# pipeline.config.json sets mutationTesting.reminder to true, suggest a Stryker
# run to check that the tests catch real faults.
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
printf '%s' "$OUTPUT" | grep -Eq 'Tests[[:space:]]+[0-9]+ passed' || exit 0
printf '%s' "$OUTPUT" | grep -Eq '[0-9]+ failed' && exit 0
CONFIG="$(pipeline_config_file "$(pipeline_app_dir "$TOOL_COMMAND")")"
[ -n "$CONFIG" ] || exit 0
[ "$(pipeline_config_get "$CONFIG" mutationTesting.reminder false)" = "true" ] || exit 0

hook_additional_context PostToolUse "[mutation-test] All tests passed. Consider a mutation run to check the tests catch real faults: ./scripts/run-mutation-tests.sh (threshold: pipeline.config.json → mutationTesting.scoreThreshold)."
exit 0
