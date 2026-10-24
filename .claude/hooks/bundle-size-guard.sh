#!/usr/bin/env bash
# bundle-size-guard.sh — PreToolUse hook (matcher: Bash, if: "Bash(git commit *)").
#
# Before a `git commit` in an Aurelius project whose app has a build in .next/,
# dist/, build/ or out/, add up the build's JavaScript and CSS (the same files
# check-bundle-size.sh counts). Above pipeline.config.json →
# bundleSize.maxSizeKb, return a reminder to Claude. The commit proceeds: the
# build on disk may be stale, and ./scripts/check-bundle-size.sh is the real
# check.
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

APP_DIR="$(pipeline_app_dir "$TOOL_COMMAND")"
CONFIG="$(pipeline_config_file "$APP_DIR")"
[ -n "$CONFIG" ] || exit 0
[ "$(pipeline_config_get "$CONFIG" bundleSize.enabled true)" = "false" ] && exit 0

BUILD_DIR=""
for d in .next dist build out; do
  if [ -d "$APP_DIR/$d" ]; then BUILD_DIR="$d"; break; fi
done
[ -n "$BUILD_DIR" ] || exit 0

SCAN="$APP_DIR/$BUILD_DIR"
# Next.js keeps server output and a build cache beside the client bundle.
[ "$BUILD_DIR" = ".next" ] && [ -d "$SCAN/static" ] && SCAN="$SCAN/static"
BYTES="$(find "$SCAN" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' \) -not -path '*/cache/*' -exec cat {} + 2>/dev/null | wc -c | tr -d ' ')"
case "$BYTES" in ''|*[!0-9]*) exit 0 ;; esac
SIZE_KB=$((BYTES / 1024))

MAX_KB="$(pipeline_config_get "$CONFIG" bundleSize.maxSizeKb 200)"
case "$MAX_KB" in ''|*[!0-9]*) MAX_KB=200 ;; esac

if [ "$SIZE_KB" -gt "$MAX_KB" ]; then
  hook_additional_context PreToolUse "[bundle-guard] $BUILD_DIR/ holds ${SIZE_KB}KB of JavaScript and CSS, above the ${MAX_KB}KB limit (pipeline.config.json → bundleSize.maxSizeKb). The commit proceeds; if that build is current, run ./scripts/check-bundle-size.sh and split or trim before shipping."
fi
exit 0
