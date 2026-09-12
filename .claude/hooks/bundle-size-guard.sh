#!/usr/bin/env bash
# bundle-size-guard.sh — PostToolUse hook
# Warns when the existing build artifacts exceed bundleSize.maxSizeKb from
# pipeline.config.json. Fires when the agent runs `git commit` so the warning
# arrives at the natural review point.
#
# Args:
#   $1  TOOL_INPUT
#   $2  TOOL_OUTPUT (unused)
#
# Exit: always 0.

set -u
TOOL_INPUT="${1:-}"
trap 'exit 0' ERR

if ! echo "$TOOL_INPUT" | grep -q "git commit"; then
  exit 0
fi

# Pick the first build directory that exists.
BUILD_DIR=""
for d in .next dist build out; do
  if [ -d "$d" ]; then
    BUILD_DIR="$d"
    break
  fi
done
if [ -z "$BUILD_DIR" ]; then
  exit 0
fi

if ! command -v du >/dev/null 2>&1; then
  exit 0
fi
SIZE_KB="$(du -sk "$BUILD_DIR" 2>/dev/null | cut -f1)"
if [ -z "$SIZE_KB" ]; then
  exit 0
fi

# Default max = 200 KB. Overridden by pipeline.config.json -> bundleSize.maxSizeKb.
MAX_KB=200
if [ -f .claude/pipeline.config.json ] && command -v node >/dev/null 2>&1; then
  PARSED="$(node -e 'const c=require("./.claude/pipeline.config.json"); console.log(c.bundleSize?.maxSizeKb ?? 200);' 2>/dev/null)" || PARSED=""
  if [ -n "$PARSED" ]; then
    MAX_KB="$PARSED"
  fi
fi

if [ "$SIZE_KB" -gt "$MAX_KB" ]; then
  echo "[bundle-guard] $BUILD_DIR is ${SIZE_KB}KB, above the ${MAX_KB}KB limit. Run: ./scripts/check-bundle-size.sh"
fi

exit 0
