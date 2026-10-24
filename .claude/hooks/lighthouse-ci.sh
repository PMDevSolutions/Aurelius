#!/usr/bin/env bash
# lighthouse-ci.sh — PostToolUse hook (matcher: Bash, if: "Bash(pnpm *build*)").
#
# After a successful `pnpm build` in an Aurelius project, remind Claude to run
# a Lighthouse audit against the thresholds in pipeline.config.json →
# qualityGate.lighthouseThresholds.
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
CONFIG="$(pipeline_config_file "$(pipeline_app_dir "$TOOL_COMMAND")")"
[ -n "$CONFIG" ] || exit 0
pipeline_build_succeeded "$(pipeline_bash_output)" || exit 0

PERF="$(pipeline_config_get "$CONFIG" qualityGate.lighthouseThresholds.performance 80)"
A11Y="$(pipeline_config_get "$CONFIG" qualityGate.lighthouseThresholds.accessibility 90)"

hook_additional_context PostToolUse "[lighthouse-ci] Build done. Run a Lighthouse audit against pipeline.config.json → qualityGate.lighthouseThresholds: performance=${PERF}, accessibility=${A11Y}. Use the Chrome DevTools MCP lighthouse_audit, or npx lighthouse <url> --output=json."
exit 0
