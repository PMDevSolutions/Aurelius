#!/usr/bin/env bash
# verify-test-coverage.sh — Ensure every component has tests and tests use lockfile values
# Returns exit code 1 if any component is missing a test file
set -euo pipefail

SRC_DIR="${1:-src}"
LOCKFILE=""
VIOLATIONS=0
MISSING_TESTS=0
MISSING_LOCKFILE_ASSERTIONS=0

# Find lockfile
for candidate in "src/styles/design-tokens.lock.json" "design-tokens.lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

echo "=== Test Coverage Verification ==="
echo ""

# --- Check 1: Every .tsx component has a .test.tsx ---
echo "▸ Checking that every component has a test file..."

# Find all component .tsx files (exclude test files, stories, type-only files)
COMPONENT_FILES=$(find "$SRC_DIR" -name "*.tsx" \
  ! -name "*.test.tsx" \
  ! -name "*.stories.tsx" \
  ! -name "*.d.ts" \
  ! -name "index.tsx" \
  ! -path "*/test/*" \
  ! -path "*/tests/*" \
  ! -path "*/__tests__/*" \
  ! -path "*/__mocks__/*" \
  ! -path "*/node_modules/*" \
  2>/dev/null || true)

if [[ -z "$COMPONENT_FILES" ]]; then
  echo "  ⊘ No component files found in $SRC_DIR"
else
  while IFS= read -r component; do
    # Derive expected test file path
    test_file="${component%.tsx}.test.tsx"

    if [[ ! -f "$test_file" ]]; then
      echo "  ✗ Missing test: $component"
      echo "    Expected: $test_file"
      MISSING_TESTS=$((MISSING_TESTS + 1))
    fi
  done <<< "$COMPONENT_FILES"

  TOTAL_COMPONENTS=$(echo "$COMPONENT_FILES" | wc -l | tr -d ' ')
  TESTED=$((TOTAL_COMPONENTS - MISSING_TESTS))

  if [[ $MISSING_TESTS -eq 0 ]]; then
    echo "  ✓ All $TOTAL_COMPONENTS components have test files"
  else
    echo ""
    echo "  $TESTED/$TOTAL_COMPONENTS components have tests ($MISSING_TESTS missing)"
    VIOLATIONS=$((VIOLATIONS + MISSING_TESTS))
  fi
fi
echo ""

# --- Check 2: Test files actually import their component ---
echo "▸ Checking that test files import their component..."
ORPHAN_TESTS=0

TEST_FILES=$(find "$SRC_DIR" -name "*.test.tsx" \
  ! -path "*/node_modules/*" \
  2>/dev/null || true)

if [[ -n "$TEST_FILES" ]]; then
  while IFS= read -r test_file; do
    component_name=$(basename "$test_file" .test.tsx)
    # Check if the test imports the component
    if ! grep -qE "(import.*from.*['\"]\./${component_name}['\"]|import.*from.*['\"]\.\..*/${component_name}['\"])" "$test_file" 2>/dev/null; then
      # Also check for relative path imports
      if ! grep -qE "import.*${component_name}" "$test_file" 2>/dev/null; then
        echo "  ⚠ Test may not import its component: $test_file"
        ORPHAN_TESTS=$((ORPHAN_TESTS + 1))
      fi
    fi
  done <<< "$TEST_FILES"

  if [[ $ORPHAN_TESTS -eq 0 ]]; then
    TOTAL_TESTS=$(echo "$TEST_FILES" | wc -l | tr -d ' ')
    echo "  ✓ All $TOTAL_TESTS test files import their components"
  fi
fi
echo ""

# --- Check 3: Tests reference lockfile text content ---
if [[ -n "$LOCKFILE" ]]; then
  echo "▸ Checking that tests assert lockfile text content..."

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

  if [[ -n "$TEXT_ENTRIES" ]]; then
    TOTAL_TEXT=$(echo "$TEXT_ENTRIES" | wc -l | tr -d ' ')
    FOUND_IN_TESTS=0

    while IFS= read -r text; do
      if grep -rqF "$text" "$SRC_DIR" --include="*.test.tsx" 2>/dev/null; then
        FOUND_IN_TESTS=$((FOUND_IN_TESTS + 1))
      else
        echo "  ✗ Lockfile text not asserted in any test: \"$text\""
        MISSING_LOCKFILE_ASSERTIONS=$((MISSING_LOCKFILE_ASSERTIONS + 1))
      fi
    done <<< "$TEXT_ENTRIES"

    if [[ $MISSING_LOCKFILE_ASSERTIONS -eq 0 ]]; then
      echo "  ✓ All $TOTAL_TEXT lockfile text entries are asserted in tests"
    else
      echo ""
      echo "  $FOUND_IN_TESTS/$TOTAL_TEXT lockfile text entries asserted ($MISSING_LOCKFILE_ASSERTIONS missing)"
      VIOLATIONS=$((VIOLATIONS + MISSING_LOCKFILE_ASSERTIONS))
    fi
  else
    echo "  ⊘ No text content entries in lockfile (skipped)"
  fi
else
  echo "▸ No design-tokens.lock.json found — skipping lockfile assertion check"
fi
echo ""

# --- Check 4: Test files use proper RTL queries ---
echo "▸ Checking test quality (RTL query usage)..."
BAD_QUERIES=0

if [[ -n "$TEST_FILES" ]]; then
  # Check for getByTestId usage (should be last resort)
  TESTID_USAGE=$(grep -rnc "getByTestId\|queryByTestId\|findByTestId" "$SRC_DIR" --include="*.test.tsx" 2>/dev/null || true)
  ROLE_USAGE=$(grep -rnc "getByRole\|queryByRole\|findByRole" "$SRC_DIR" --include="*.test.tsx" 2>/dev/null || true)

  TESTID_COUNT=$(echo "$TESTID_USAGE" | awk -F: '{sum += $NF} END {print sum+0}')
  ROLE_COUNT=$(echo "$ROLE_USAGE" | awk -F: '{sum += $NF} END {print sum+0}')

  if [[ $TESTID_COUNT -gt 0 && $ROLE_COUNT -gt 0 ]]; then
    RATIO=$((TESTID_COUNT * 100 / (ROLE_COUNT + TESTID_COUNT)))
    if [[ $RATIO -gt 30 ]]; then
      echo "  ⚠ High getByTestId usage (${RATIO}% of queries). Prefer getByRole."
    else
      echo "  ✓ Good query balance: ${ROLE_COUNT} role queries, ${TESTID_COUNT} testId queries"
    fi
  elif [[ $TESTID_COUNT -gt 0 && $ROLE_COUNT -eq 0 ]]; then
    echo "  ⚠ Tests only use getByTestId. Should use getByRole as primary query."
  else
    echo "  ✓ Tests use recommended RTL queries"
  fi
fi
echo ""

# --- Check 5: describe/it blocks exist ---
echo "▸ Checking test structure..."
EMPTY_TESTS=0

if [[ -n "$TEST_FILES" ]]; then
  while IFS= read -r test_file; do
    if ! grep -qE "(describe|it|test)\(" "$test_file" 2>/dev/null; then
      echo "  ✗ No test cases found in: $test_file"
      EMPTY_TESTS=$((EMPTY_TESTS + 1))
    fi
  done <<< "$TEST_FILES"

  if [[ $EMPTY_TESTS -eq 0 ]]; then
    TOTAL_TESTS=$(echo "$TEST_FILES" | wc -l | tr -d ' ')
    echo "  ✓ All $TOTAL_TESTS test files contain test cases"
  else
    VIOLATIONS=$((VIOLATIONS + EMPTY_TESTS))
  fi
fi
echo ""

# --- Summary ---
echo "=== Summary ==="
if [[ $VIOLATIONS -gt 0 ]]; then
  echo "✗ $VIOLATIONS violation(s) found"
  [[ $MISSING_TESTS -gt 0 ]] && echo "  - $MISSING_TESTS component(s) missing test files"
  [[ $MISSING_LOCKFILE_ASSERTIONS -gt 0 ]] && echo "  - $MISSING_LOCKFILE_ASSERTIONS lockfile text(s) not asserted in tests"
  [[ $EMPTY_TESTS -gt 0 ]] && echo "  - $EMPTY_TESTS test file(s) with no test cases"
  exit 1
else
  echo "✓ All checks passed — test coverage verification complete"
  exit 0
fi
