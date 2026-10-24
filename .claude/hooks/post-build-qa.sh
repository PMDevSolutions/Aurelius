#!/usr/bin/env bash
# post-build-qa.sh — PostToolUse hook (matcher: Bash, if: "Bash(pnpm *build*)").
#
# After a successful `pnpm build` in an Aurelius project, remind Claude to run
# the quality gate before calling the work done.
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
[ -n "$(pipeline_config_file "$(pipeline_app_dir "$TOOL_COMMAND")")" ] || exit 0
pipeline_build_succeeded "$(pipeline_bash_output)" || exit 0

hook_additional_context PostToolUse "[post-build-qa] Build succeeded. Run the quality gate before calling this done: pnpm vitest run && pnpm tsc --noEmit && ./scripts/verify-tokens.sh (or ./scripts/verify-all.sh for every check)."
exit 0
