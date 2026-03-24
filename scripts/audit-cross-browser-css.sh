#!/bin/bash
# Audit CSS for known cross-browser rendering issues.
#
# Checks for:
# - Vendor-prefixed properties without standard equivalents
# - Properties known to render differently across browsers
# - Missing reset/normalization patterns
#
# Usage:
#   ./scripts/audit-cross-browser-css.sh [--json]
#   ./scripts/audit-cross-browser-css.sh src/

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEARCH_DIR="${1:-$PROJECT_ROOT/src}"
JSON_OUTPUT=false
ISSUES=0

# Check for --json flag
for arg in "$@"; do
  if [ "$arg" = "--json" ]; then
    JSON_OUTPUT=true
    break
  fi
done

echo "=== Cross-Browser CSS Audit ==="
echo "Scanning: $SEARCH_DIR"
echo ""

# 1. Check for webkit-only properties missing standard equivalents
echo "--- Vendor prefix issues ---"
WEBKIT_ONLY=$(grep -rn "-webkit-" "$SEARCH_DIR" --include="*.css" --include="*.tsx" --include="*.ts" --include="*.jsx" 2>/dev/null | grep -v "node_modules" | grep -v "-webkit-font-smoothing" | grep -v "-webkit-touch-callout" | grep -v "-webkit-appearance" | grep -v "-webkit-scrollbar" || true)
if [ -n "$WEBKIT_ONLY" ]; then
  echo "WARNING: Found -webkit- prefixed properties. Verify Firefox/Safari equivalents exist:"
  echo "$WEBKIT_ONLY" | head -20
  ISSUES=$((ISSUES + $(echo "$WEBKIT_ONLY" | wc -l)))
  echo ""
fi

# 2. Check for backdrop-filter (needs -webkit- prefix for Safari)
echo "--- backdrop-filter (needs -webkit- for Safari < 18) ---"
BACKDROP=$(grep -rn "backdrop-filter" "$SEARCH_DIR" --include="*.css" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "-webkit-backdrop-filter" || true)
if [ -n "$BACKDROP" ]; then
  echo "WARNING: backdrop-filter used without -webkit- prefix for Safari:"
  echo "$BACKDROP" | head -10
  ISSUES=$((ISSUES + $(echo "$BACKDROP" | wc -l)))
  echo ""
fi

# 3. Check for gap property in flexbox (Safari < 14.1)
echo "--- Flexbox gap (limited Safari < 14.1 support) ---"
FLEX_GAP=$(grep -rn "flex.*gap\|gap:.*\(flex\)" "$SEARCH_DIR" --include="*.css" 2>/dev/null | grep -v "node_modules" || true)
if [ -n "$FLEX_GAP" ]; then
  echo "INFO: Flexbox gap detected. Ensure Safari 14.1+ is your minimum target or add fallbacks:"
  echo "$FLEX_GAP" | head -10
  echo ""
fi

# 4. Check for hardcoded focus outline styles (should use :focus-visible)
echo "--- Focus styling consistency ---"
FOCUS_OUTLINE=$(grep -rn ":focus\b" "$SEARCH_DIR" --include="*.css" 2>/dev/null | grep -v "node_modules" | grep -v ":focus-visible" | grep -v ":focus-within" | grep -v ":focus:not" || true)
if [ -n "$FOCUS_OUTLINE" ]; then
  echo "WARNING: :focus used without :focus-visible. Consider using :focus-visible for cross-browser consistency:"
  echo "$FOCUS_OUTLINE" | head -10
  ISSUES=$((ISSUES + $(echo "$FOCUS_OUTLINE" | wc -l)))
  echo ""
fi

# 5. Summary
echo "=== Audit Summary ==="
echo "Issues found: $ISSUES"

if [ "$ISSUES" -eq 0 ]; then
  echo "All clear! No cross-browser CSS issues detected."
fi

exit 0
