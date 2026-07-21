#!/usr/bin/env bash
# approval-gate-guard.sh — PostToolUse hook (Bash matcher).
#
# Watches for commands that look like external publish/send/spend actions
# (marketing platform APIs, mail sends, publish/schedule flags) and reminds
# that the human approval gate must be on record first. Informational only —
# always exits 0; it cannot and does not block, it makes the gate hard to
# forget.
#
# Args: $1 = TOOL_INPUT (the Bash command), $2 = TOOL_OUTPUT
set -u
trap 'exit 0' ERR

TOOL_INPUT="${1:-}"

# Never fire on this repo's own tooling or tests.
case "$TOOL_INPUT" in
  *scripts/*|*vitest*|*"git "*) exit 0 ;;
esac

FIRE=0
case "$TOOL_INPUT" in
  *"--publish"*|*"--send"*|*"--schedule"*|*"--live"*) FIRE=1 ;;
  *api.mailchimp.com*|*api.sendgrid.com*|*api.buffer.com*|*api.hootsuite.com*) FIRE=1 ;;
  *graph.facebook.com*|*googleads.googleapis.com*|*api.linkedin.com*|*api.twitter.com*|*api.x.com*) FIRE=1 ;;
esac

if [ "$FIRE" -eq 1 ]; then
  echo "🛑 Approval-gate reminder: this command looks like it publishes, sends,"
  echo "   schedules, or spends externally. Per pipeline.config.json → humanApproval,"
  echo "   explicit human sign-off must be on record (approval-package.md) before"
  echo "   any external action. If approval is recorded, proceed; if not, stop."
fi

exit 0
