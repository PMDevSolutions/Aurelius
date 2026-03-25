#!/usr/bin/env bash
# regression-test.sh — Run visual regression tests against baseline screenshots
# Usage: ./scripts/regression-test.sh [url] [--update-baselines] [--json]
# Exit codes: 0=pass, 1=regression detected, 2=error
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Args ---
URL="${1:-http://localhost:3000}"
UPDATE_BASELINES=false
JSON_OUTPUT=false

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --update-baselines) UPDATE_BASELINES=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    -h|--help)
      echo "Usage: regression-test.sh [url] [--update-baselines] [--json]"
      echo ""
      echo "Captures screenshots and compares against committed baselines."
      echo "Reads config from .claude/pipeline.config.json regressionTesting section."
      echo ""
      echo "Options:"
      echo "  url                  URL to test (default: http://localhost:3000)"
      echo "  --update-baselines   Overwrite baselines with current screenshots on pass"
      echo "  --json               Output results as JSON"
      exit 0
      ;;
    *) shift ;;
  esac
done

echo "=== Visual Regression Test ==="
echo ""

# --- Read config ---
CONFIG_FILE=".claude/pipeline.config.json"
if [ -f "$CONFIG_FILE" ] && command -v node &> /dev/null; then
  BASELINE_DIR=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.baselineDir||'.claude/visual-qa/baselines')")
  SCREENSHOT_DIR=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.screenshotDir||'.claude/visual-qa/screenshots/regression')")
  DIFF_DIR=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.diffDir||'.claude/visual-qa/diffs/regression')")
  THRESHOLD=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.threshold||0.02)")
  FAIL_ON_MISSING=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.failOnMissingBaseline?'true':'false')")
  REPORT_FILE=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.reportFile||'regression-report.md')")
  BREAKPOINTS_JSON=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(JSON.stringify(c.regressionTesting?.breakpoints||{mobile:375,desktop:1440}))")
  WAIT_MS=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.waitAfterLoadMs||1500)")
  FULL_PAGE=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.fullPage!==false?'true':'false')")
  CONFIG_ROUTES=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log((c.regressionTesting?.routes||['/']).join(','))")
  BROWSERS_JSON=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(JSON.stringify(c.regressionTesting?.browsers||['chromium']))")
else
  BASELINE_DIR=".claude/visual-qa/baselines"
  SCREENSHOT_DIR=".claude/visual-qa/screenshots/regression"
  DIFF_DIR=".claude/visual-qa/diffs/regression"
  THRESHOLD=0.02
  FAIL_ON_MISSING=false
  REPORT_FILE="regression-report.md"
  BREAKPOINTS_JSON='{"mobile":375,"desktop":1440}'
  WAIT_MS=1500
  FULL_PAGE="true"
  CONFIG_ROUTES="/"
  BROWSERS_JSON='["chromium"]'
fi

REPORT_PATH=".claude/visual-qa/$REPORT_FILE"

# --- Check for baselines ---
BASELINE_COUNT=$(find "$BASELINE_DIR" -name "*.png" 2>/dev/null | wc -l)
if [ "$BASELINE_COUNT" -eq 0 ]; then
  echo "No baseline screenshots found in $BASELINE_DIR"
  echo ""
  if [ "$FAIL_ON_MISSING" = "true" ]; then
    echo "ERROR: failOnMissingBaseline is true. Run ./scripts/capture-baselines.sh first."
    exit 2
  else
    echo "Capturing initial baselines..."
    bash "$PROJECT_ROOT/scripts/capture-baselines.sh" "$URL"
    echo ""
    echo "Initial baselines captured. Run this script again to compare."
    exit 0
  fi
fi

echo "Found $BASELINE_COUNT baseline screenshots"
echo ""

# --- Capture current screenshots ---
echo "--- Capturing current screenshots ---"
echo ""

# Clean previous regression screenshots
rm -rf "$SCREENSHOT_DIR" 2>/dev/null || true
mkdir -p "$SCREENSHOT_DIR"

TEMP_SCRIPT=$(mktemp /tmp/regression-capture-XXXXXX.mjs)
cat > "$TEMP_SCRIPT" << 'SCRIPT_EOF'
import { chromium, firefox, webkit } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const url = process.argv[2];
const screenshotDir = process.argv[3];
const breakpoints = JSON.parse(process.argv[4]);
const waitMs = parseInt(process.argv[5], 10);
const fullPage = process.argv[6] === 'true';
const routes = process.argv[7].split(',');
const browsers = JSON.parse(process.argv[8]);

const browserLaunchers = { chromium, firefox, webkit };

for (const browserName of browsers) {
  const launcher = browserLaunchers[browserName];
  if (!launcher) continue;

  const browser = await launcher.launch();

  for (const route of routes) {
    const routeSlug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');

    for (const [bpName, width] of Object.entries(breakpoints)) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const target = `${url}${route}`;

      try {
        await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(waitMs);

        const outDir = join(screenshotDir, browserName, routeSlug);
        mkdirSync(outDir, { recursive: true });

        const filename = `${bpName}_${width}px.png`;
        await page.screenshot({ path: join(outDir, filename), fullPage });
      } catch (err) {
        console.error(`Failed ${browserName}/${routeSlug}/${bpName}: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();
}
SCRIPT_EOF

node "$TEMP_SCRIPT" "$URL" "$SCREENSHOT_DIR" "$BREAKPOINTS_JSON" "$WAIT_MS" "$FULL_PAGE" "$CONFIG_ROUTES" "$BROWSERS_JSON"
CAPTURE_EXIT=$?
rm -f "$TEMP_SCRIPT"

if [ "$CAPTURE_EXIT" -ne 0 ]; then
  echo "ERROR: Screenshot capture failed"
  exit 2
fi

echo "Screenshots captured to $SCREENSHOT_DIR"
echo ""

# --- Compare against baselines ---
echo "--- Comparing against baselines ---"
echo ""

mkdir -p "$DIFF_DIR"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
SKIP_COUNT=0
RESULTS=""

# Walk baseline directory and find matching screenshots
while IFS= read -r baseline_file; do
  # Get relative path from baseline dir
  rel_path="${baseline_file#$BASELINE_DIR/}"
  current_file="$SCREENSHOT_DIR/$rel_path"
  diff_file="$DIFF_DIR/$rel_path"

  if [ ! -f "$current_file" ]; then
    echo "SKIP: $rel_path (no current screenshot)"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | SKIP | - | No current screenshot |"
    continue
  fi

  # Create diff output directory
  mkdir -p "$(dirname "$diff_file")"

  # Run visual-diff.js
  DIFF_OUTPUT=$(node scripts/visual-diff.js "$current_file" "$baseline_file" --output "$diff_file" --threshold "$THRESHOLD" --json 2>&1) || true

  # Parse mismatch and status from visual-diff.js JSON output
  # Fields: mismatchPct (number), status ("PASS"/"FAIL"), pass (boolean)
  PARSED=$(echo "$DIFF_OUTPUT" | node -e "
    let data='';
    process.stdin.on('data',d=>data+=d);
    process.stdin.on('end',()=>{
      try {
        const j=JSON.parse(data);
        const pct = j.mismatchPct ?? '?';
        const status = (j.status || 'UNKNOWN').toUpperCase();
        console.log(pct + '|' + status);
      } catch { console.log('?|UNKNOWN'); }
    });
  " 2>/dev/null || echo "?|UNKNOWN")

  MISMATCH="${PARSED%%|*}"
  STATUS="${PARSED##*|}"

  if [ "$STATUS" = "PASS" ]; then
    echo "PASS: $rel_path (${MISMATCH}%)"
    PASS_COUNT=$((PASS_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | PASS | ${MISMATCH}% | - |"
  elif [ "$STATUS" = "FAIL" ]; then
    echo "FAIL: $rel_path (${MISMATCH}%)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | FAIL | ${MISMATCH}% | Exceeds ${THRESHOLD} threshold |"
  else
    echo "WARN: $rel_path (${MISMATCH}%)"
    WARN_COUNT=$((WARN_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | WARN | ${MISMATCH}% | Unable to determine status |"
  fi

done < <(find "$BASELINE_DIR" -name "*.png" -type f | sort)

TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT + SKIP_COUNT))

echo ""
echo "=== Results ==="
echo "Total: $TOTAL | Pass: $PASS_COUNT | Fail: $FAIL_COUNT | Warn: $WARN_COUNT | Skip: $SKIP_COUNT"
echo ""

# --- Generate report ---
cat > "$REPORT_PATH" << REPORT_EOF
# Visual Regression Report

**Date:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**URL:** $URL
**Threshold:** $THRESHOLD ($(node -e "console.log($THRESHOLD * 100)")%)
**Browsers:** $(echo "$BROWSERS_JSON" | tr -d '[]"')

## Summary

| Metric | Count |
|--------|-------|
| Total | $TOTAL |
| Pass | $PASS_COUNT |
| Fail | $FAIL_COUNT |
| Warn | $WARN_COUNT |
| Skip | $SKIP_COUNT |

## Results

| Screenshot | Status | Mismatch | Notes |
|-----------|--------|----------|-------|
$(printf '%b\n' "$RESULTS")

## Diff Images

Diff images saved to: \`$DIFF_DIR\`

REPORT_EOF

echo "Report saved to $REPORT_PATH"

# --- JSON output ---
if [ "$JSON_OUTPUT" = "true" ]; then
  node -e "console.log(JSON.stringify({
    pass: $PASS_COUNT,
    fail: $FAIL_COUNT,
    warn: $WARN_COUNT,
    skip: $SKIP_COUNT,
    total: $TOTAL,
    threshold: $THRESHOLD,
    reportPath: '$REPORT_PATH'
  }, null, 2))"
fi

# --- Update baselines if requested and all passed ---
if [ "$UPDATE_BASELINES" = "true" ] && [ "$FAIL_COUNT" -eq 0 ]; then
  echo ""
  echo "Updating baselines (all tests passed)..."
  cp -r "$SCREENSHOT_DIR"/* "$BASELINE_DIR"/
  echo "Baselines updated from current screenshots."
fi

# --- Exit code ---
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
else
  exit 0
fi
