#!/usr/bin/env bash
# deploy-guard.sh — PreToolUse hook (matcher: Bash). Registered in
# .claude/settings.json for every session with onFailure "block", and mirrored
# in .claude/hooks/hooks.json for plugin installs.
#
# Aurelius builds apps that ship to Vercel, Netlify, Cloudflare, Firebase, the
# app stores, the Chrome Web Store and npm, and its own release runs through a
# workflow dispatch and a PR merge. Each of those reaches users or a registry
# and is hard to undo, so this hook stops them for a human:
#
#   gate     production deploys, publishes, releases, store submissions, PR
#            merges, workflow dispatches, force pushes, pushes to the default
#            branch, a tag or a deploy remote, production config changes
#            → permissionDecision "ask". In bypassPermissions and dontAsk,
#              where a hook cannot prompt, the answer is "deny" with where to
#              run the command instead (lib/hook-io.sh → hook_gate_decision).
#   preview  preview deploys (a public URL, not production) → a reminder.
#   outward  feature-branch pushes, PR and issue posts → silent.
#
# Inside a SUBAGENT (the event carries agent_id, or agent-no-deploy.sh passes
# --subagent) every tier is a deny: subagents build, test and stage, and the
# main session ships. This settings-level check is the half that holds when the
# agents run from the plugin, because plugin agents ignore frontmatter hooks.
#
# Classification lives in lib/deploy-classify.mjs, which splits the command the
# way the shell does, so a commit message that mentions `vercel --prod` is text,
# not a deploy. A keyword check runs first, so ordinary commands never start node.
#
# Input: the hook event as JSON on stdin. Output: JSON on stdout, or nothing.
# Always exits 0.
set -u
trap 'exit 0' ERR

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/hook-io.sh
source "$HOOK_DIR/lib/hook-io.sh"

hook_read_input
hook_read_context

[ "$TOOL_NAME" = "Bash" ] || exit 0
[ -n "$TOOL_COMMAND" ] || exit 0

IN_SUBAGENT=0
if [ "${1:-}" = "--subagent" ] || [ -n "$HOOK_AGENT_ID" ]; then IN_SUBAGENT=1; fi

# Every word the classifier can act on; anything else is let through untouched.
case "$TOOL_COMMAND" in
  *vercel*|vc|vc\ *|*\ vc|*\ vc\ *|*netlify*|*ntl\ *|*wrangler*|*firebase*|*eas\ *|*publish*|*release*|*deploy*) ;;
  *push*|*merge*|*gh\ *|*dist-tag*|*deprecate*|*owner*|*changeset*|*lerna*|*surge*|*gh-pages*|*electron-builder*) ;;
  *fly*|*railway*|*amplify*|*heroku*|*s3*|*webstore*|*cws-*|*web-ext*|*wxt*) ;;
  *) exit 0 ;;
esac

if ! command -v node >/dev/null 2>&1; then
  # The command names a deploy, publish or push tool and cannot be classified.
  if [ "$IN_SUBAGENT" -eq 1 ]; then
    hook_pretooluse_decision deny "Deploy guard (subagent): node is not available to classify this command, and it names a deploy, publish or push tool. Subagents never deploy, publish, release, merge or push; put the command in your report for the main session."
  else
    hook_gate_decision ask "Deploy guard: node is not available to classify this command, and it names a deploy, publish or push tool. Approve only if this is the release step the human asked for."
  fi
  exit 0
fi

RESULT="$(printf '%s' "$TOOL_COMMAND" | node "$HOOK_DIR/lib/deploy-classify.mjs" --cwd "${HOOK_CWD:-$(hook_project_dir)}" 2>/dev/null || true)"
[ -n "$RESULT" ] || exit 0
TAB="$(printf '\t')"
TIER="${RESULT%%"$TAB"*}"
WHAT="${RESULT#*"$TAB"}"

if [ "$IN_SUBAGENT" -eq 1 ]; then
  hook_pretooluse_decision deny "Deploy guard (subagent): $WHAT. Subagents build, test and stage; they never deploy, publish, release, merge or push. Put the exact command and what it needs first (a green quality gate, a human's go-ahead) in your final report, and the main session runs it."
  exit 0
fi

case "$TIER" in
  gate)
    hook_gate_decision ask "Deploy guard: $WHAT. This reaches users or a registry and is hard to undo. Approve only if a human asked for this step and the quality gate passed (./scripts/verify-all.sh, or the pipeline's Phase 8 report); otherwise deny it and hand the command back." ;;
  preview)
    hook_additional_context PreToolUse "Deploy guard: $WHAT. A preview URL is public to anyone who has the link, so it must not carry unreleased client work, real customer data or secrets. Proceed only if the human asked for a preview." ;;
esac
exit 0
