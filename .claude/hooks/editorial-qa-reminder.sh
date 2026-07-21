#!/usr/bin/env bash
# editorial-qa-reminder.sh — PostToolUse hook (Bash matcher).
#
# When a brand-voice lint run comes back clean, remind that brand voice is one
# of three editorial QA gates — readability and fact-check/SEO still apply
# before the approval gate. Informational only — always exits 0.
#
# Args: $1 = TOOL_INPUT (the Bash command), $2 = TOOL_OUTPUT
set -u
trap 'exit 0' ERR

TOOL_INPUT="${1:-}"
TOOL_OUTPUT="${2:-}"

case "$TOOL_INPUT" in
  *brand-voice-lint.js*) ;;
  *) exit 0 ;;
esac

# Only fire on a clean run (avoid piling advice onto a failure report).
case "$TOOL_OUTPUT" in
  *"✓"*clean*)
    echo "✓ Brand voice clean. Before the approval gate, complete the QA trio:"
    echo "  node scripts/readability-score.js content/ --check"
    echo "  node scripts/seo-check.js content/    (web-bound assets)"
    echo "  …and confirm every claim has a source (fact-check blocks without one)."
    ;;
esac

exit 0
