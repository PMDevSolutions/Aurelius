#!/bin/bash
# Stop Hook: Generate build status report
# Runs when the frontend-developer agent completes
#
# Creates a summary report in .claude/reports/frontend-developer/

REPORT_DIR=".claude/reports/frontend-developer"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/build_${TIMESTAMP}.md"

mkdir -p "$REPORT_DIR"

{
    echo "# Frontend Developer Build Report"
    echo ""
    echo "**Generated:** $(date)"
    echo ""

    # Count modified files by type
    echo "## Files Modified"
    echo ""

    TSX_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.tsx$' || echo 0)
    TS_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.ts$' || echo 0)
    CSS_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.css$' || echo 0)
    JS_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.js$' || echo 0)
    JSX_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.jsx$' || echo 0)

    echo "| Type | Count |"
    echo "|------|-------|"
    echo "| TSX | $TSX_COUNT |"
    echo "| TS | $TS_COUNT |"
    echo "| CSS | $CSS_COUNT |"
    echo "| JS | $JS_COUNT |"
    echo "| JSX | $JSX_COUNT |"
    echo ""

    # List source files changed
    echo "## Source Files Changed"
    echo ""
    git diff --name-only HEAD 2>/dev/null | grep -E '^src/' || echo "None"
    echo ""

    # Run quick validation
    echo "## Validation Status"
    echo ""

    # Check for TypeScript errors in changed files
    if [ -f "tsconfig.json" ] && [ -f "node_modules/.bin/tsc" ]; then
        TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c 'error TS' || echo 0)
        if [ "$TSC_ERRORS" -gt 0 ]; then
            echo "- TypeScript: $TSC_ERRORS error(s)"
        else
            echo "- TypeScript: Passed"
        fi
    else
        echo "- TypeScript: Not configured"
    fi

    # Check for ESLint issues
    if [ -f "node_modules/.bin/eslint" ]; then
        ESLINT_ERRORS=$(npx eslint . --ext .ts,.tsx,.js,.jsx 2>&1 | grep -c 'error' || echo 0)
        if [ "$ESLINT_ERRORS" -gt 0 ]; then
            echo "- ESLint: $ESLINT_ERRORS issue(s)"
        else
            echo "- ESLint: Passed"
        fi
    else
        echo "- ESLint: Not configured"
    fi

} > "$REPORT_FILE"

echo "Build report saved to: $REPORT_FILE" >&2
exit 0
