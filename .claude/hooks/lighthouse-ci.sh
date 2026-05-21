#!/usr/bin/env bash
# lighthouse-ci.sh — PostToolUse hook
# Suggests a Lighthouse audit after a successful pnpm build, including the
# performance and accessibility thresholds from pipeline.config.json.
#
# Args:
#   $1  TOOL_INPUT
#   $2  TOOL_OUTPUT
#
# Exit: always 0.

set -u
TOOL_INPUT="${1:-}"
TOOL_OUTPUT="${2:-}"
trap 'exit 0' ERR

if ! echo "$TOOL_INPUT" | grep -q "pnpm build"; then
  exit 0
fi
if ! echo "$TOOL_OUTPUT" | grep -q "built in"; then
  exit 0
fi

CONFIG=".claude/pipeline.config.json"
PERF=80
A11Y=90

if [ -f "$CONFIG" ] && command -v node >/dev/null 2>&1; then
  P="$(node -e 'const c=require("./.claude/pipeline.config.json"); console.log(c.qualityGate?.lighthouseThresholds?.performance ?? 80);' 2>/dev/null)" || P=""
  A="$(node -e 'const c=require("./.claude/pipeline.config.json"); console.log(c.qualityGate?.lighthouseThresholds?.accessibility ?? 90);' 2>/dev/null)" || A=""
  [ -n "$P" ] && PERF="$P"
  [ -n "$A" ] && A11Y="$A"
fi

echo "[lighthouse-ci] Build done. Run Lighthouse audit — thresholds: performance=${PERF}, accessibility=${A11Y}. Use: npx lighthouse <url> --output=json"

exit 0
