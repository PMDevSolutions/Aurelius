#!/usr/bin/env bash
set -euo pipefail

# Accessibility Linter
# Run ESLint with jsx-a11y rules on React/TSX/JSX files
#
# Usage:
#   ./scripts/check-accessibility.sh          # Check all .tsx/.jsx files
#   ./scripts/check-accessibility.sh src/     # Check specific directory

TARGET="${1:-.}"

echo "=== Accessibility Check ==="
echo "Target: $TARGET"
echo ""

# Determine runner
RUNNER="pnpm"
if [[ ! -f "pnpm-lock.yaml" ]] && [[ ! -d "node_modules/.pnpm" ]]; then
    RUNNER="npx"
fi

# Check if ESLint is available
if [[ ! -f "node_modules/.bin/eslint" ]] && ! command -v eslint &>/dev/null; then
    echo "Error: ESLint not found."
    echo "Install it with: pnpm add -D eslint"
    exit 1
fi

# Check if jsx-a11y plugin is installed
HAS_A11Y_PLUGIN=false
if [[ -d "node_modules/eslint-plugin-jsx-a11y" ]]; then
    HAS_A11Y_PLUGIN=true
fi

EXIT_CODE=0
A11Y_OUTPUT_FILE=$(mktemp)

if [[ "$HAS_A11Y_PLUGIN" == true ]]; then
    echo "Found eslint-plugin-jsx-a11y. Running ESLint on .tsx and .jsx files..."
    echo ""

    $RUNNER eslint "$TARGET" --ext .tsx,.jsx 2>&1 | tee "$A11Y_OUTPUT_FILE" || EXIT_CODE=$?
else
    echo "eslint-plugin-jsx-a11y not found."
    echo "Install it with: pnpm add -D eslint-plugin-jsx-a11y"
    echo ""
    echo "Falling back to general ESLint check on .tsx/.jsx files..."
    echo ""

    $RUNNER eslint "$TARGET" --ext .tsx,.jsx 2>&1 | tee "$A11Y_OUTPUT_FILE" || EXIT_CODE=$?
fi

echo ""

# Parse and group results by severity
ERROR_COUNT=$(grep -cE '^\s+[0-9]+:[0-9]+\s+error' "$A11Y_OUTPUT_FILE" 2>/dev/null || echo "0")
WARNING_COUNT=$(grep -cE '^\s+[0-9]+:[0-9]+\s+warning' "$A11Y_OUTPUT_FILE" 2>/dev/null || echo "0")

echo "=== Results ==="
echo "Errors:   $ERROR_COUNT"
echo "Warnings: $WARNING_COUNT"
echo ""

# Suggest fixes for common accessibility issues
if [[ "$EXIT_CODE" -ne 0 ]]; then
    echo "=== Common Fixes ==="
    echo ""

    if grep -q 'jsx-a11y/alt-text' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [alt-text] Add descriptive alt attributes to <img> elements."
        echo "    Example: <img src=\"photo.jpg\" alt=\"Description of the image\" />"
        echo ""
    fi

    if grep -q 'jsx-a11y/anchor-is-valid' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [anchor-is-valid] Ensure <a> tags have valid href attributes."
        echo "    Use <button> for click handlers instead of <a href=\"#\">."
        echo ""
    fi

    if grep -q 'jsx-a11y/click-events-have-key-events' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [click-events-have-key-events] Add onKeyDown/onKeyUp to elements with onClick."
        echo "    Interactive elements need keyboard support for accessibility."
        echo ""
    fi

    if grep -q 'jsx-a11y/no-static-element-interactions' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [no-static-element-interactions] Add role attribute to interactive static elements."
        echo "    Example: <div onClick={handler} role=\"button\" tabIndex={0}>"
        echo ""
    fi

    if grep -q 'jsx-a11y/label-has-associated-control' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [label-has-associated-control] Associate <label> with form controls."
        echo "    Use htmlFor or wrap the input: <label htmlFor=\"email\">Email</label>"
        echo ""
    fi

    if grep -q 'jsx-a11y/heading-has-content' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [heading-has-content] Ensure headings (<h1>-<h6>) have visible text content."
        echo ""
    fi

    if grep -q 'jsx-a11y/aria-' "$A11Y_OUTPUT_FILE" 2>/dev/null; then
        echo "  [aria-*] Ensure ARIA attributes are valid and properly used."
        echo "    Reference: https://www.w3.org/TR/wai-aria-1.1/"
        echo ""
    fi
fi

rm -f "$A11Y_OUTPUT_FILE"
exit $EXIT_CODE
