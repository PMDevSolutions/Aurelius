#!/usr/bin/env bash
# pre-commit-token-guard.sh — PreToolUse hook (matcher: Bash, if: "Bash(git commit *)").
#
# Before a `git commit` runs in an app that has a design-token lockfile, run
# scripts/verify-tokens.sh and keep only the findings in files this commit
# carries: the staged files, plus working-tree changes when the same command
# also runs `git add` or `git commit -a`.
#   • a hardcoded color, arbitrary pixel value or inline style in one of those
#     files → permissionDecision "deny" with the findings, so the value becomes
#     a lockfile token before the commit happens;
#   • findings only in files the commit does not touch → silent, so an old
#     violation never blocks an unrelated commit (the quality gate reports it).
# Silent when the command is not a commit, the app has no lockfile, or the
# commit carries no src/ .tsx or .css file. The husky pre-commit stays the last
# line of defence for commits made outside Claude Code.
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
case "$TOOL_COMMAND" in
  *"git commit"*|*"git -C "*" commit"*) ;;
  *) exit 0 ;;
esac
command -v git >/dev/null 2>&1 || exit 0

APP_DIR="$(pipeline_app_dir "$TOOL_COMMAND")"
cd "$APP_DIR" 2>/dev/null || exit 0
[ -f src/styles/design-tokens.lock.json ] || [ -f design-tokens.lock.json ] || exit 0
[ -d src ] || exit 0

VERIFY=""
for candidate in "$APP_DIR/scripts/verify-tokens.sh" "$(hook_project_dir)/scripts/verify-tokens.sh"; do
  if [ -f "$candidate" ]; then VERIFY="$candidate"; break; fi
done
[ -n "$VERIFY" ] || exit 0

# The files this commit will carry, relative to the app dir.
CARRIED="$(git diff --cached --name-only --relative --diff-filter=ACMR 2>/dev/null || true)"
case "$TOOL_COMMAND" in
  *"git add"*|*"commit -a"*|*"commit --all"*|*" -am "*|*" -a "*)
    CARRIED="$CARRIED
$(git diff HEAD --name-only --relative --diff-filter=ACMR 2>/dev/null || true)
$(git ls-files --others --exclude-standard 2>/dev/null || true)" ;;
esac
CARRIED="$(printf '%s\n' "$CARRIED" | grep -E '^src/.*\.(tsx|css)$' | sort -u || true)"
[ -n "$CARRIED" ] || exit 0

# verify-tokens.sh lists each finding as "    src/<file>:<line>:<text>".
REPORT="$(bash "$VERIFY" 2>&1 || true)"
FINDINGS="$(printf '%s\n' "$REPORT" | CARRIED="$CARRIED" awk '
  BEGIN { n = split(ENVIRON["CARRIED"], files, "\n"); for (i = 1; i <= n; i++) keep[files[i]] = 1 }
  {
    line = $0
    sub(/^[ \t]+/, "", line)
    if (match(line, /^src\/[^:]+:[0-9]+:/)) {
      file = substr(line, 1, RLENGTH)
      sub(/:[0-9]+:$/, "", file)
      if (file in keep) print line
    }
  }' || true)"
[ -n "$FINDINGS" ] || exit 0

COUNT="$(printf '%s\n' "$FINDINGS" | wc -l | tr -d ' ')"
SHOWN="$(printf '%s\n' "$FINDINGS" | head -12)"
hook_pretooluse_decision deny "Token guard: $COUNT hardcoded value(s) in files this commit carries. The lockfile (src/styles/design-tokens.lock.json) is the single source of truth: replace each value with its Tailwind token or CSS variable, re-stage, then commit. Mark a deliberate exception with // token-ok. Findings:
$SHOWN
Re-run: ./scripts/verify-tokens.sh"
exit 0
