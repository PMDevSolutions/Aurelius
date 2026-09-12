#!/usr/bin/env bash
set -euo pipefail

# Run Tests
# Run Vitest (or Jest / npm test) with coverage
#
# Usage:
#   ./scripts/run-tests.sh           # Run tests with coverage
#   ./scripts/run-tests.sh --watch   # Run in watch mode
#   ./scripts/run-tests.sh --ui      # Run with Vitest UI

WATCH_MODE=false
UI_MODE=false

for arg in "$@"; do
    case "$arg" in
        --watch) WATCH_MODE=true ;;
        --ui) UI_MODE=true ;;
        *) echo "Unknown flag: $arg"; echo "Usage: $0 [--watch] [--ui]"; exit 1 ;;
    esac
done

echo "=== Test Runner ==="
echo ""

# Auto-detect test runner
RUNNER="pnpm"
if [[ ! -f "pnpm-lock.yaml" ]] && [[ ! -d "node_modules/.pnpm" ]]; then
    RUNNER="npx"
fi

TEST_TOOL=""
if [[ -f "node_modules/.bin/vitest" ]] || grep -q '"vitest"' package.json 2>/dev/null; then
    TEST_TOOL="vitest"
elif [[ -f "node_modules/.bin/jest" ]] || grep -q '"jest"' package.json 2>/dev/null; then
    TEST_TOOL="jest"
else
    TEST_TOOL="generic"
fi

echo "Detected test runner: $TEST_TOOL"
echo ""

case "$TEST_TOOL" in
    vitest)
        ARGS=()

        if [[ "$WATCH_MODE" == true ]]; then
            ARGS+=(watch)
            echo "Mode: watch"
        elif [[ "$UI_MODE" == true ]]; then
            ARGS+=(--ui)
            echo "Mode: UI"
        else
            ARGS+=(run --coverage)
            echo "Mode: run with coverage"
        fi

        echo ""
        $RUNNER vitest "${ARGS[@]}"
        ;;

    jest)
        ARGS=()

        if [[ "$WATCH_MODE" == true ]]; then
            ARGS+=(--watch)
            echo "Mode: watch"
        else
            ARGS+=(--coverage)
            echo "Mode: run with coverage"
        fi

        if [[ "$UI_MODE" == true ]]; then
            echo "Note: --ui flag is Vitest-only. Running Jest in standard mode."
        fi

        echo ""
        $RUNNER jest "${ARGS[@]}"
        ;;

    generic)
        echo "No Vitest or Jest detected. Falling back to 'npm test'."

        if [[ "$WATCH_MODE" == true ]]; then
            echo "Note: --watch may not be supported by generic test script."
        fi
        if [[ "$UI_MODE" == true ]]; then
            echo "Note: --ui is Vitest-only and not supported here."
        fi

        echo ""
        $RUNNER test 2>/dev/null || npm test
        ;;
esac

echo ""
echo "=== Tests Complete ==="

# Report coverage summary if coverage directory exists
if [[ -d "coverage" ]]; then
    echo ""
    echo "Coverage output: ./coverage/"
    if [[ -f "coverage/coverage-summary.json" ]]; then
        echo ""
        echo "Coverage Summary:"
        if command -v jq &>/dev/null; then
            jq -r '.total | to_entries[] | "  \(.key): \(.value.pct // "N/A")%"' coverage/coverage-summary.json 2>/dev/null || true
        else
            echo "  (install jq for formatted coverage summary)"
        fi
    fi
fi
