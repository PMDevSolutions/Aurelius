#!/usr/bin/env bash
# regression-reminder.sh — PostToolUse hook: remind about regression tests
TOOL_INPUT="$1"
TOOL_OUTPUT="$2"

# Only trigger on pnpm build success
if echo "$TOOL_INPUT" | grep -q "pnpm build" && echo "$TOOL_OUTPUT" | grep -q "Build\|build.*complete\|Successfully compiled"; then
  BASELINE_COUNT=$(find .claude/visual-qa/baselines -name "*.png" 2>/dev/null | wc -l)
  if [ "$BASELINE_COUNT" -gt 0 ]; then
    echo "REGRESSION: $BASELINE_COUNT baselines exist. Run ./scripts/regression-test.sh to check for visual regressions."
  fi
fi
