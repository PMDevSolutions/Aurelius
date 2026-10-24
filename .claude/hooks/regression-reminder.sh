#!/usr/bin/env bash
# regression-reminder.sh — PostToolUse hook (matcher: Bash, if: "Bash(pnpm *build*)").
#
# After a successful `pnpm build` in an Aurelius project, remind Claude to run
# the visual regression suite, but only when baseline screenshots exist under
# .claude/visual-qa/baselines/ (otherwise there is nothing to diff against).
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
pipeline_is_build_command "$TOOL_COMMAND" || exit 0
APP_DIR="$(pipeline_app_dir "$TOOL_COMMAND")"
CONFIG="$(pipeline_config_file "$APP_DIR")"
[ -n "$CONFIG" ] || exit 0
pipeline_build_succeeded "$(pipeline_bash_output)" || exit 0

# Baselines live beside the pipeline config that governs the app.
BASELINES="$(dirname "$CONFIG")/visual-qa/baselines"
[ -d "$BASELINES" ] || exit 0
COUNT="$(find "$BASELINES" -name '*.png' 2>/dev/null | wc -l | tr -d ' ')"
case "$COUNT" in ''|0) exit 0 ;; esac

hook_additional_context PostToolUse "[regression-reminder] $COUNT baselines exist. Run ./scripts/regression-test.sh to check the build for visual regressions."
exit 0
