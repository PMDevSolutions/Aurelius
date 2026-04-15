#!/usr/bin/env bash
set -euo pipefail

# Run Mutation Tests (Stryker)
# Validates test suite effectiveness via mutation testing
#
# Usage:
#   ./scripts/run-mutation-tests.sh                  # Run mutation tests
#   ./scripts/run-mutation-tests.sh --threshold 80   # Override minimum score
#   ./scripts/run-mutation-tests.sh --json            # JSON output
#   ./scripts/run-mutation-tests.sh --help            # Show usage

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

CONFIG_FILE=".claude/pipeline.config.json"
THRESHOLD=""
JSON_OUTPUT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --threshold)
            if [[ $# -lt 2 ]]; then
                echo "Error: --threshold requires a value"
                echo "Usage: $0 [--threshold N] [--json] [--help]"
                exit 1
            fi
            THRESHOLD="$2"
            shift 2
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--threshold N] [--json] [--help]"
            echo ""
            echo "Options:"
            echo "  --threshold N   Minimum mutation score percentage (default: from pipeline.config.json or 80)"
            echo "  --json          Output results as JSON"
            echo "  --help          Show this message"
            exit 0
            ;;
        *)
            echo "Unknown flag: $1"
            echo "Usage: $0 [--threshold N] [--json] [--help]"
            exit 1
            ;;
    esac
done

# Read threshold from pipeline config if not overridden
if [[ -z "$THRESHOLD" ]]; then
    if [[ -f "$CONFIG_FILE" ]]; then
        THRESHOLD=$(node -e "
            const c = require('./' + process.argv[1]);
            console.log(c.mutationTesting?.scoreThreshold ?? c.qualityGate?.mutationScore?.threshold ?? 80);
        " "$CONFIG_FILE" 2>/dev/null || echo "80")
    else
        THRESHOLD="80"
    fi
fi

# Check that Stryker is installed
if [[ ! -f "node_modules/.bin/stryker" ]]; then
    if [[ "$JSON_OUTPUT" == true ]]; then
        echo "{\"status\":\"skipped\",\"score\":null,\"threshold\":$THRESHOLD,\"sourceFiles\":0,\"reason\":\"@stryker-mutator/core not installed\"}"
    else
        echo "=== Mutation Testing ==="
        echo ""
        echo "Stryker is not installed. Install with:"
        echo "  pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker"
    fi
    exit 0
fi

# Check for stryker config
if [[ ! -f "stryker.config.json" ]]; then
    if [[ "$JSON_OUTPUT" == true ]]; then
        echo "{\"status\":\"skipped\",\"score\":null,\"threshold\":$THRESHOLD,\"sourceFiles\":0,\"reason\":\"stryker.config.json not found\"}"
    else
        echo "=== Mutation Testing ==="
        echo ""
        echo "No stryker.config.json found. Create one or copy from the framework template."
    fi
    exit 0
fi

# Check for source files to mutate
SRC_FILES=$(find src -name '*.ts' -o -name '*.tsx' 2>/dev/null | grep -v '.test.' | grep -v '.spec.' | grep -v '.stories.' | grep -v '.d.ts' || true)
SRC_COUNT=$(echo "$SRC_FILES" | grep -c . || true)
SRC_COUNT=$(echo "$SRC_COUNT" | tr -d ' ')

if [[ "$SRC_COUNT" == "0" ]]; then
    if [[ "$JSON_OUTPUT" == true ]]; then
        echo "{\"status\":\"skipped\",\"score\":null,\"threshold\":$THRESHOLD,\"sourceFiles\":0,\"reason\":\"no source files found in src/\"}"
    else
        echo "=== Mutation Testing ==="
        echo ""
        echo "No source files found in src/ to mutate. Skipping."
    fi
    exit 0
fi

if [[ "$JSON_OUTPUT" == false ]]; then
    echo "=== Mutation Testing ==="
    echo ""
    echo "Threshold: ${THRESHOLD}%"
    echo "Source files: $SRC_COUNT"
    echo ""
fi

# Run Stryker
STRYKER_OUTPUT=""
STRYKER_EXIT=0
STRYKER_OUTPUT=$(npx stryker run 2>&1) || STRYKER_EXIT=$?

# Parse mutation score from output
# Stryker clear-text reporter outputs a line like: "Mutation score: 85.71%"
SCORE=$(echo "$STRYKER_OUTPUT" | grep -oE 'Mutation score:[[:space:]]*[0-9]+(\.[0-9]+)?' | grep -oE '[0-9]+(\.[0-9]+)?$' || echo "")

if [[ -z "$SCORE" ]]; then
    # Try JSON report as fallback
    JSON_REPORT="reports/mutation/mutation-report.json"
    if [[ -f "$JSON_REPORT" ]]; then
        SCORE=$(node -e "
            const r = require('./$JSON_REPORT');
            const f = r.files || {};
            let killed = 0, total = 0;
            for (const file of Object.values(f)) {
                for (const m of (file.mutants || [])) {
                    total++;
                    if (m.status === 'Killed') killed++;
                }
            }
            console.log(total > 0 ? ((killed / total) * 100).toFixed(2) : '0');
        " 2>/dev/null || echo "")
    fi
fi

# Determine pass/fail
if [[ -z "$SCORE" ]]; then
    STATUS="error"
    PASS=false
elif (( $(echo "$SCORE >= $THRESHOLD" | bc -l 2>/dev/null || node -e "console.log($SCORE >= $THRESHOLD ? 1 : 0)") )); then
    STATUS="pass"
    PASS=true
else
    STATUS="fail"
    PASS=false
fi

# Output
if [[ "$JSON_OUTPUT" == true ]]; then
    echo "{\"status\":\"$STATUS\",\"score\":${SCORE:-null},\"threshold\":$THRESHOLD,\"sourceFiles\":$SRC_COUNT}"
else
    if [[ -n "$SCORE" ]]; then
        echo ""
        echo "Mutation Score: ${SCORE}%"
        echo "Threshold:      ${THRESHOLD}%"
        echo ""
        if [[ "$PASS" == true ]]; then
            echo "Result: PASS"
        else
            echo "Result: FAIL (score below threshold)"
        fi
    else
        echo ""
        echo "Could not determine mutation score."
        echo "Stryker exit code: $STRYKER_EXIT"
        echo ""
        echo "Stryker output:"
        echo "$STRYKER_OUTPUT" | tail -20
    fi

    echo ""
    if [[ -f "reports/mutation/index.html" ]]; then
        echo "HTML report: reports/mutation/index.html"
    fi
    echo "=== Mutation Testing Complete ==="
fi

# Exit with failure if below threshold (only when score was determined)
if [[ "$STATUS" == "fail" ]]; then
    exit 1
fi
