#!/usr/bin/env bash
set -euo pipefail

# TypeScript Type Checker
# Run tsc --noEmit to check for type errors
#
# Usage:
#   ./scripts/check-types.sh           # Standard type check
#   ./scripts/check-types.sh --strict  # Also check with strict mode enabled

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

STRICT_MODE=false
if [[ "${1:-}" == "--strict" ]]; then
    STRICT_MODE=true
fi

say_banner "TypeScript Type Check"
echo ""

# Check for tsconfig.json
if [[ ! -f "tsconfig.json" ]]; then
    echo "Warning: tsconfig.json not found in the current directory."
    echo "TypeScript type checking requires a tsconfig.json file."
    echo ""
    echo "Create one with: pnpm tsc --init"
    exit 1
fi

# Determine runner
RUNNER="pnpm"
if [[ ! -f "pnpm-lock.yaml" ]] && [[ ! -d "node_modules/.pnpm" ]]; then
    RUNNER="npx"
fi

# Check that tsc is available
if [[ ! -f "node_modules/.bin/tsc" ]] && ! command -v tsc &>/dev/null; then
    echo "Error: TypeScript compiler (tsc) not found."
    echo "Install it with: pnpm add -D typescript"
    exit 1
fi

# Run standard type check
echo "Running tsc --noEmit..."
echo ""

TSC_OUTPUT_FILE=$(mktemp)
common_track_tmpfile "$TSC_OUTPUT_FILE"
EXIT_CODE=0

if $RUNNER tsc --noEmit 2>&1 | tee "$TSC_OUTPUT_FILE"; then
    echo ""
    echo "No type errors found."
else
    EXIT_CODE=1
    ERROR_COUNT=$(grep -cE '^.+\([0-9]+,[0-9]+\): error TS' "$TSC_OUTPUT_FILE" 2>/dev/null || echo "unknown")
    echo ""
    echo "Type errors found: ${ERROR_COUNT}"
fi

# Run strict mode check if requested
if [[ "$STRICT_MODE" == true ]]; then
    echo ""
    echo "---"
    echo "Running strict mode check (tsc --noEmit --strict)..."
    echo ""

    STRICT_OUTPUT_FILE=$(mktemp)
    common_track_tmpfile "$STRICT_OUTPUT_FILE"

    if $RUNNER tsc --noEmit --strict 2>&1 | tee "$STRICT_OUTPUT_FILE"; then
        echo ""
        echo "No strict mode errors found."
    else
        EXIT_CODE=1
        STRICT_ERROR_COUNT=$(grep -cE '^.+\([0-9]+,[0-9]+\): error TS' "$STRICT_OUTPUT_FILE" 2>/dev/null || echo "unknown")
        echo ""
        echo "Strict mode errors: ${STRICT_ERROR_COUNT}"
    fi
fi

echo ""
say_banner "Type Check Complete"
exit $EXIT_CODE
