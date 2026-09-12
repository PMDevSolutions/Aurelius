#!/usr/bin/env bash
# verify-tokens.sh — Detect hardcoded values and token drift in React components
# Returns exit code 1 with file:line references on failure
set -euo pipefail

LOCKFILE=""
SRC_DIR="src"
VIOLATIONS=0

# Find lockfile
for candidate in "src/styles/design-tokens.lock.json" "design-tokens.lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

echo "=== Token Verification ==="
echo ""

# --- Check 1: Hardcoded hex colors in .tsx files ---
echo "▸ Checking for hardcoded hex colors in .tsx files..."
HEX_HITS=$(grep -rnE '#[0-9a-fA-F]{3,8}' "$SRC_DIR" --include="*.tsx" \
  | grep -v '// token-ok' \
  | grep -v '\.css' \
  | grep -v 'design-tokens' \
  | grep -v 'node_modules' \
  || true)

if [[ -n "$HEX_HITS" ]]; then
  echo "  ✗ Hardcoded hex colors found:"
  echo "$HEX_HITS" | sed 's/^/    /'
  VIOLATIONS=$((VIOLATIONS + $(echo "$HEX_HITS" | wc -l)))
else
  echo "  ✓ No hardcoded hex colors"
fi
echo ""

# --- Check 2: Arbitrary pixel values in Tailwind classes ---
echo "▸ Checking for arbitrary Tailwind values (w-[...], h-[...], p-[...], etc.)..."
ARBITRARY_HITS=$(grep -rnE '\b(w|h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y|text|rounded)-\[[0-9]+px\]' "$SRC_DIR" --include="*.tsx" \
  | grep -v '// token-ok' \
  | grep -v 'node_modules' \
  || true)

if [[ -n "$ARBITRARY_HITS" ]]; then
  echo "  ✗ Arbitrary pixel values found:"
  echo "$ARBITRARY_HITS" | sed 's/^/    /'
  VIOLATIONS=$((VIOLATIONS + $(echo "$ARBITRARY_HITS" | wc -l)))
else
  echo "  ✓ No arbitrary pixel values"
fi
echo ""

# --- Check 3: Inline style attributes ---
echo "▸ Checking for inline style={{}} attributes..."
INLINE_HITS=$(grep -rnE 'style=\{\{' "$SRC_DIR" --include="*.tsx" \
  | grep -v '// token-ok' \
  | grep -v 'node_modules' \
  || true)

if [[ -n "$INLINE_HITS" ]]; then
  echo "  ✗ Inline styles found:"
  echo "$INLINE_HITS" | sed 's/^/    /'
  VIOLATIONS=$((VIOLATIONS + $(echo "$INLINE_HITS" | wc -l)))
else
  echo "  ✓ No inline styles"
fi
echo ""

# --- Check 4: Text content drift from lockfile ---
if [[ -n "$LOCKFILE" ]]; then
  echo "▸ Checking text content against lockfile ($LOCKFILE)..."

  # Extract text entries from lockfile and verify they exist in source
  TEXT_ENTRIES=$(python3 -c "
import json, sys
try:
    with open('$LOCKFILE') as f:
        data = json.load(f)
    texts = data.get('textContent', {})
    for key, val in texts.items():
        if isinstance(val, str) and len(val) > 2:
            print(val)
except Exception:
    sys.exit(0)
" 2>/dev/null || true)

  DRIFT_COUNT=0
  if [[ -n "$TEXT_ENTRIES" ]]; then
    while IFS= read -r text; do
      if ! grep -rqF "$text" "$SRC_DIR" --include="*.tsx" 2>/dev/null; then
        echo "  ✗ Missing text from lockfile: \"$text\""
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
      fi
    done <<< "$TEXT_ENTRIES"

    if [[ $DRIFT_COUNT -eq 0 ]]; then
      echo "  ✓ All lockfile text content found in source"
    else
      VIOLATIONS=$((VIOLATIONS + DRIFT_COUNT))
    fi
  else
    echo "  ⊘ No text content entries in lockfile (skipped)"
  fi
else
  echo "▸ No design-tokens.lock.json found — skipping text content drift check"
fi
echo ""

# --- Check 5: Hardcoded color values in CSS/style files ---
echo "▸ Checking for hardcoded colors in CSS files (outside tokens)..."
CSS_HEX_HITS=$(grep -rnE '#[0-9a-fA-F]{3,8}' "$SRC_DIR" --include="*.css" \
  | grep -v 'tokens.css' \
  | grep -v 'globals.css' \
  | grep -v 'design-tokens' \
  | grep -v '// token-ok' \
  | grep -v 'node_modules' \
  || true)

if [[ -n "$CSS_HEX_HITS" ]]; then
  echo "  ✗ Hardcoded hex colors in CSS:"
  echo "$CSS_HEX_HITS" | sed 's/^/    /'
  VIOLATIONS=$((VIOLATIONS + $(echo "$CSS_HEX_HITS" | wc -l)))
else
  echo "  ✓ No hardcoded hex colors in CSS"
fi
echo ""

# --- Summary ---
echo "=== Summary ==="
if [[ $VIOLATIONS -gt 0 ]]; then
  echo "✗ $VIOLATIONS violation(s) found"
  echo "  Fix violations or add '// token-ok' comment to intentional exceptions"
  exit 1
else
  echo "✓ All checks passed — no token violations detected"
  exit 0
fi
