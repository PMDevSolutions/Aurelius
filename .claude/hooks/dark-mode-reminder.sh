#!/usr/bin/env bash
# dark-mode-reminder.sh — PostToolUse hook (matcher: Bash, if: "Bash(*visual-diff*)").
#
# After a visual-diff.js run that passed with no failing comparison, in an
# Aurelius project with pipeline.config.json → darkMode.enabled, suggest the
# dark-theme check.
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
case "$TOOL_COMMAND" in *visual-diff*) ;; *) exit 0 ;; esac
OUTPUT="$(pipeline_bash_output)"
printf '%s' "$OUTPUT" | grep -q 'PASS' || exit 0
printf '%s' "$OUTPUT" | grep -q 'FAIL' && exit 0
CONFIG="$(pipeline_config_file "$(pipeline_app_dir "$TOOL_COMMAND")")"
[ -n "$CONFIG" ] || exit 0
[ "$(pipeline_config_get "$CONFIG" darkMode.enabled true)" = "false" ] && exit 0

hook_additional_context PostToolUse "[dark-mode-reminder] Visual diff passed. Check the dark theme too: ./scripts/check-dark-mode.sh <url> (pipeline.config.json → darkMode)."
exit 0
