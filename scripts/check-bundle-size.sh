#!/usr/bin/env bash
set -euo pipefail

# Bundle Size Analyzer
# Build the project and analyze output chunk sizes
#
# Usage:
#   ./scripts/check-bundle-size.sh
#
# Environment:
#   BUNDLE_SIZE_LIMIT  - Max chunk size in KB before warning (default: 250)

BUNDLE_SIZE_LIMIT="${BUNDLE_SIZE_LIMIT:-250}"

echo "=== Bundle Size Analysis ==="
echo "Chunk size warning threshold: ${BUNDLE_SIZE_LIMIT}KB"
echo ""

# Determine runner
RUNNER="pnpm"
if [[ ! -f "pnpm-lock.yaml" ]] && [[ ! -d "node_modules/.pnpm" ]]; then
    RUNNER="npx"
fi

# Auto-detect framework and build
BUILD_DIR=""
FRAMEWORK=""

if [[ -f "next.config.js" ]] || [[ -f "next.config.mjs" ]] || [[ -f "next.config.ts" ]]; then
    FRAMEWORK="Next.js"
    echo "Detected framework: Next.js"
    echo "Running: $RUNNER next build"
    echo ""
    $RUNNER next build 2>&1 || true
    BUILD_DIR=".next"
elif [[ -f "vite.config.ts" ]] || [[ -f "vite.config.js" ]] || [[ -f "vite.config.mts" ]]; then
    FRAMEWORK="Vite"
    echo "Detected framework: Vite"
    echo "Running: $RUNNER vite build"
    echo ""
    $RUNNER vite build 2>&1 || true
    BUILD_DIR="dist"
elif [[ -f "package.json" ]] && grep -q '"build"' package.json 2>/dev/null; then
    FRAMEWORK="Generic"
    echo "Detected: build script in package.json"
    echo "Running: $RUNNER build"
    echo ""
    $RUNNER build 2>&1 || true
    # Check common output directories
    if [[ -d "dist" ]]; then
        BUILD_DIR="dist"
    elif [[ -d "build" ]]; then
        BUILD_DIR="build"
    elif [[ -d "out" ]]; then
        BUILD_DIR="out"
    fi
else
    echo "Error: No recognized framework or build script found."
    echo "Supported: Next.js (next.config.*), Vite (vite.config.*), or package.json with build script"
    exit 1
fi

# Verify build output exists
if [[ -z "$BUILD_DIR" ]] || [[ ! -d "$BUILD_DIR" ]]; then
    echo ""
    echo "Error: Build output directory not found."
    echo "Expected: dist/, build/, out/, or .next/"
    exit 1
fi

echo ""
echo "--- Build Output Analysis ---"
echo "Build directory: $BUILD_DIR"
echo ""

# Calculate total bundle size
TOTAL_SIZE_BYTES=$(find "$BUILD_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.mjs" \) -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
TOTAL_SIZE_BYTES="${TOTAL_SIZE_BYTES:-0}"
TOTAL_SIZE_KB=$((TOTAL_SIZE_BYTES / 1024))

echo "Total bundle size (JS + CSS): ${TOTAL_SIZE_KB}KB (${TOTAL_SIZE_BYTES} bytes)"
echo ""

# Find and list the 10 largest chunks
echo "Top 10 largest chunks:"
echo "---"

OVERSIZED=0
find "$BUILD_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.mjs" \) -exec wc -c {} + 2>/dev/null \
    | grep -v ' total$' \
    | sort -rn \
    | head -10 \
    | while read -r size_bytes filepath; do
        size_kb=$((size_bytes / 1024))
        if [[ $size_kb -gt $BUNDLE_SIZE_LIMIT ]]; then
            echo "  [!] ${size_kb}KB  ${filepath}"
        else
            echo "      ${size_kb}KB  ${filepath}"
        fi
    done

echo ""

# Check for oversized chunks
OVERSIZED_COUNT=$(find "$BUILD_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.mjs" \) -exec wc -c {} + 2>/dev/null \
    | grep -v ' total$' \
    | awk -v limit="$((BUNDLE_SIZE_LIMIT * 1024))" '$1 > limit {count++} END {print count+0}')

echo "=== Summary ==="
echo "Framework: $FRAMEWORK"
echo "Total bundle size: ${TOTAL_SIZE_KB}KB"
echo "Chunk size limit: ${BUNDLE_SIZE_LIMIT}KB"

if [[ "$OVERSIZED_COUNT" -gt 0 ]]; then
    echo ""
    echo "WARNING: ${OVERSIZED_COUNT} chunk(s) exceed the ${BUNDLE_SIZE_LIMIT}KB limit."
    echo "Consider code splitting, lazy loading, or tree shaking to reduce chunk sizes."
    exit 1
else
    echo "All chunks are within the size limit."
fi
