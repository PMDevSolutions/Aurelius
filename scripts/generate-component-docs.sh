#!/usr/bin/env bash
# generate-component-docs.sh — Generate MDX documentation files for React components
# Exit codes: 0=docs generated, 2=no components found
set -euo pipefail

SRC_DIR="src"
OUTPUT_DIR="docs/components"
LOCKFILE=""
GENERATED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: generate-component-docs.sh [--output-dir <dir>]"
      exit 1
      ;;
  esac
done

# Find lockfile
for candidate in "src/styles/design-tokens.lock.json" "design-tokens.lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

echo "=== Component Documentation Generator ==="
echo ""

# --- Find component files ---
echo "▸ Scanning $SRC_DIR/components/**/*.tsx for React components..."

COMPONENT_FILES=$(find "$SRC_DIR/components" -name "*.tsx" \
  ! -name "*.test.tsx" \
  ! -name "*.spec.tsx" \
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
  echo "  ⊘ No component files found in $SRC_DIR/components"
  echo ""
  echo "=== Summary ==="
  echo "✗ No components found — no docs generated"
  exit 2
fi

TOTAL_COMPONENTS=$(echo "$COMPONENT_FILES" | wc -l | tr -d ' ')
echo "  Found $TOTAL_COMPONENTS component file(s)"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# --- Generate individual component docs ---
echo "▸ Generating component documentation..."

# Collect data for index
declare -a INDEX_ENTRIES=()

while IFS= read -r component_file; do
  # Extract component name from filename
  COMPONENT_NAME=$(basename "$component_file" .tsx)

  # Derive related file paths
  TEST_FILE="${component_file%.tsx}.test.tsx"
  STORIES_FILE="${component_file%.tsx}.stories.tsx"
  HAS_TESTS="no"
  HAS_STORIES="no"
  [[ -f "$TEST_FILE" ]] && HAS_TESTS="yes"
  [[ -f "$STORIES_FILE" ]] && HAS_STORIES="yes"

  # Extract JSDoc description (/** ... */ block above export)
  JSDOC_DESC=$(node -e "
    const fs = require('fs');
    const src = fs.readFileSync('$component_file', 'utf8');
    // Find JSDoc comments that appear before an export
    const re = /\/\*\*\s*\n([\s\S]*?)\*\/\s*\n\s*export/g;
    let match = re.exec(src);
    if (match) {
      const lines = match[1].split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(l => l && !l.startsWith('@'));
      if (lines.length) console.log(lines.join(' '));
    }
  " 2>/dev/null || true)

  # Extract props interface/type
  PROPS_BLOCK=$(node -e "
    const fs = require('fs');
    const src = fs.readFileSync('$component_file', 'utf8');
    // Match exported or non-exported interface/type ending with Props
    const re = /((?:export\s+)?(?:interface|type)\s+\w*Props\b[\s\S]*?(?:\}|;))/g;
    let match = re.exec(src);
    if (match) {
      console.log(match[1]);
    }
  " 2>/dev/null || true)

  # Extract design tokens used (if lockfile exists)
  TOKENS_SECTION=""
  if [[ -n "$LOCKFILE" ]]; then
    TOKENS_USED=$(node -e "
      const fs = require('fs');
      const lock = JSON.parse(fs.readFileSync('$LOCKFILE', 'utf8'));
      const src = fs.readFileSync('$component_file', 'utf8');
      const tokenNames = new Set();
      // Collect all token keys from all sections
      for (const [section, entries] of Object.entries(lock)) {
        if (typeof entries === 'object' && entries !== null) {
          for (const key of Object.keys(entries)) {
            if (src.includes(key)) {
              tokenNames.add(key);
            }
          }
        }
      }
      if (tokenNames.size > 0) {
        for (const t of tokenNames) console.log(t);
      }
    " 2>/dev/null || true)

    if [[ -n "$TOKENS_USED" ]]; then
      TOKENS_SECTION="## Design Tokens Used

"
      while IFS= read -r token; do
        TOKENS_SECTION+="- \`$token\`
"
      done <<< "$TOKENS_USED"
      TOKENS_SECTION+=""
    fi
  fi

  # Build MDX content
  MDX_CONTENT="# $COMPONENT_NAME
"

  # Add description
  if [[ -n "$JSDOC_DESC" ]]; then
    MDX_CONTENT+="
$JSDOC_DESC
"
  fi

  # Source path
  MDX_CONTENT+="
**Source:** \`$component_file\`
"

  # Status table
  MDX_CONTENT+="
## Status

| Check | Status |
|-------|--------|
| Has Tests | $HAS_TESTS |
| Has Stories | $HAS_STORIES |
"

  # Props section
  MDX_CONTENT+="
## Props
"
  if [[ -n "$PROPS_BLOCK" ]]; then
    MDX_CONTENT+="
\`\`\`typescript
$PROPS_BLOCK
\`\`\`
"
  else
    MDX_CONTENT+="
No props interface found.
"
  fi

  # Design tokens section
  if [[ -n "$TOKENS_SECTION" ]]; then
    MDX_CONTENT+="
$TOKENS_SECTION"
  fi

  # Related files
  MDX_CONTENT+="
## Related Files

- **Source:** [\`$component_file\`](./$component_file)"

  if [[ "$HAS_TESTS" == "yes" ]]; then
    MDX_CONTENT+="
- **Tests:** [\`$TEST_FILE\`](./$TEST_FILE)"
  fi

  if [[ "$HAS_STORIES" == "yes" ]]; then
    MDX_CONTENT+="
- **Stories:** [\`$STORIES_FILE\`](./$STORIES_FILE)"
  fi

  MDX_CONTENT+="
"

  # Write MDX file
  echo "$MDX_CONTENT" > "$OUTPUT_DIR/${COMPONENT_NAME}.mdx"
  echo "  ✓ $OUTPUT_DIR/${COMPONENT_NAME}.mdx"
  GENERATED=$((GENERATED + 1))

  # Collect index entry
  INDEX_ENTRIES+=("| [$COMPONENT_NAME](./${COMPONENT_NAME}.mdx) | $HAS_TESTS | $HAS_STORIES | \`$component_file\` |")

done <<< "$COMPONENT_FILES"

echo ""

# --- Generate index.mdx ---
echo "▸ Generating component index..."

INDEX_CONTENT="# Component Documentation

Overview of all React components in the project.

| Component | Tests | Stories | Source |
|-----------|-------|---------|--------|
"

for entry in "${INDEX_ENTRIES[@]}"; do
  INDEX_CONTENT+="$entry
"
done

echo "$INDEX_CONTENT" > "$OUTPUT_DIR/index.mdx"
echo "  ✓ $OUTPUT_DIR/index.mdx"
echo ""

# --- Summary ---
echo "=== Summary ==="
echo "✓ Generated $GENERATED component doc(s) + index in $OUTPUT_DIR"
exit 0
