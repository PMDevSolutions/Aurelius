#!/usr/bin/env bash
set -euo pipefail

# Lint and Format
# Run ESLint + Prettier across a React/TypeScript project
#
# Usage:
#   ./scripts/lint-and-format.sh          # Fix and format all files
#   ./scripts/lint-and-format.sh --check  # Check only, no fixes (CI mode)

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
    CHECK_ONLY=true
fi

echo "=== Lint & Format ==="
echo ""

# Auto-detect if eslint and prettier are installed
HAS_ESLINT=false
HAS_PRETTIER=false

if [[ -f "node_modules/.bin/eslint" ]]; then
    HAS_ESLINT=true
elif command -v eslint &>/dev/null; then
    HAS_ESLINT=true
fi

if [[ -f "node_modules/.bin/prettier" ]]; then
    HAS_PRETTIER=true
elif command -v prettier &>/dev/null; then
    HAS_PRETTIER=true
fi

if [[ "$HAS_ESLINT" == false ]] && [[ "$HAS_PRETTIER" == false ]]; then
    echo "Error: Neither ESLint nor Prettier found."
    echo "Install them with: pnpm add -D eslint prettier"
    exit 1
fi

EXIT_CODE=0

# Determine runner
RUNNER="pnpm"
if [[ ! -f "pnpm-lock.yaml" ]] && [[ ! -d "node_modules/.pnpm" ]]; then
    RUNNER="npx"
fi

# --- ESLint ---
if [[ "$HAS_ESLINT" == true ]]; then
    echo "Running ESLint..."
    ESLINT_OUTPUT_FILE=$(mktemp)

    if [[ "$CHECK_ONLY" == true ]]; then
        if $RUNNER eslint . 2>&1 | tee "$ESLINT_OUTPUT_FILE"; then
            echo "  ESLint: No issues found."
        else
            ESLINT_ERRORS=$(grep -cE '^\s+[0-9]+:[0-9]+\s+error' "$ESLINT_OUTPUT_FILE" 2>/dev/null || echo "0")
            ESLINT_WARNINGS=$(grep -cE '^\s+[0-9]+:[0-9]+\s+warning' "$ESLINT_OUTPUT_FILE" 2>/dev/null || echo "0")
            echo "  ESLint: ${ESLINT_ERRORS} error(s), ${ESLINT_WARNINGS} warning(s)"
            EXIT_CODE=1
        fi
    else
        if $RUNNER eslint . --fix 2>&1 | tee "$ESLINT_OUTPUT_FILE"; then
            echo "  ESLint: All issues fixed or no issues found."
        else
            ESLINT_ERRORS=$(grep -cE '^\s+[0-9]+:[0-9]+\s+error' "$ESLINT_OUTPUT_FILE" 2>/dev/null || echo "0")
            ESLINT_WARNINGS=$(grep -cE '^\s+[0-9]+:[0-9]+\s+warning' "$ESLINT_OUTPUT_FILE" 2>/dev/null || echo "0")
            echo ""
            echo "  ESLint: ${ESLINT_ERRORS} unfixable error(s), ${ESLINT_WARNINGS} warning(s) remaining"
            if [[ "$ESLINT_ERRORS" -gt 0 ]]; then
                EXIT_CODE=1
            fi
        fi
    fi

    rm -f "$ESLINT_OUTPUT_FILE"
    echo ""
else
    echo "Skipping ESLint (not installed)"
    echo ""
fi

# --- Prettier ---
if [[ "$HAS_PRETTIER" == true ]]; then
    echo "Running Prettier..."
    PRETTIER_OUTPUT_FILE=$(mktemp)

    if [[ "$CHECK_ONLY" == true ]]; then
        if $RUNNER prettier --check . 2>&1 | tee "$PRETTIER_OUTPUT_FILE"; then
            echo "  Prettier: All files formatted."
        else
            UNFORMATTED=$(grep -c 'Forgot to run Prettier\|would reformat\|[Cc]heck.*failed' "$PRETTIER_OUTPUT_FILE" 2>/dev/null || echo "some")
            echo "  Prettier: ${UNFORMATTED} file(s) need formatting."
            EXIT_CODE=1
        fi
    else
        if $RUNNER prettier --write . 2>&1 | tee "$PRETTIER_OUTPUT_FILE"; then
            FORMATTED_COUNT=$(grep -cE '^\S' "$PRETTIER_OUTPUT_FILE" 2>/dev/null || echo "0")
            echo "  Prettier: ${FORMATTED_COUNT} file(s) processed."
        else
            echo "  Prettier: Formatting encountered errors."
            EXIT_CODE=1
        fi
    fi

    rm -f "$PRETTIER_OUTPUT_FILE"
    echo ""
else
    echo "Skipping Prettier (not installed)"
    echo ""
fi

# --- Summary ---
echo "=== Summary ==="
if [[ "$EXIT_CODE" -eq 0 ]]; then
    echo "All checks passed."
else
    echo "Issues remain. Review the output above."
fi

exit $EXIT_CODE
