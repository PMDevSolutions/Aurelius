#!/usr/bin/env bash
# session-context.sh — SessionStart hook (matcher: startup|resume|clear|compact).
#
# Adds a short, current status block to the session's context: a pipeline run
# in flight (from .claude/plans/pipeline-state.json) and where it resumes, the
# build spec, the token lockfiles, the visual baselines, and whether work sits
# uncommitted on main. Plain text on stdout is added to context for SessionStart
# hooks. Silent outside an Aurelius checkout and on any failure; always exits 0.
set -u
trap 'exit 0' ERR

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/hook-io.sh
source "$HOOK_DIR/lib/hook-io.sh"

hook_read_input
command -v node >/dev/null 2>&1 || exit 0

node "$HOOK_DIR/lib/session-context.mjs" "$(hook_project_dir)" 2>/dev/null || true
exit 0
