#!/usr/bin/env bash
# capture-baselines.sh — Capture baseline screenshots for visual regression testing
# Usage: ./scripts/capture-baselines.sh [url] [--routes /,/about,/pricing]
# Exit codes: 0=success, 1=error
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Args ---
URL="${1:-http://localhost:3000}"
ROUTES_ARG=""

# Parse optional --routes flag
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --routes) ROUTES_ARG="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: capture-baselines.sh [url] [--routes /,/about,/pricing]"
      echo ""
      echo "Captures baseline screenshots at configured breakpoints and routes."
      echo "Reads config from .claude/pipeline.config.json regressionTesting section."
      echo ""
      echo "Options:"
      echo "  url       URL to capture (default: http://localhost:3000)"
      echo "  --routes  Comma-separated routes (default: from config, or /)"
      exit 0
      ;;
    *) shift ;;
  esac
done

echo "=== Baseline Screenshot Capture ==="
echo ""

# --- Read config ---
CONFIG_FILE=".claude/pipeline.config.json"
if [ -f "$CONFIG_FILE" ] && command -v node &> /dev/null; then
  BASELINE_DIR=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.baselineDir||'.claude/visual-qa/baselines')")
  BREAKPOINTS_JSON=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(JSON.stringify(c.regressionTesting?.breakpoints||{mobile:375,desktop:1440}))")
  WAIT_MS=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.waitAfterLoadMs||1500)")
  FULL_PAGE=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(c.regressionTesting?.fullPage!==false?'true':'false')")
  CONFIG_ROUTES=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log((c.regressionTesting?.routes||['/']).join(','))")
  BROWSERS_JSON=$(node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log(JSON.stringify(c.regressionTesting?.browsers||['chromium']))")
else
  BASELINE_DIR=".claude/visual-qa/baselines"
  BREAKPOINTS_JSON='{"mobile":375,"desktop":1440}'
  WAIT_MS=1500
  FULL_PAGE="true"
  CONFIG_ROUTES="/"
  BROWSERS_JSON='["chromium"]'
fi

ROUTES="${ROUTES_ARG:-$CONFIG_ROUTES}"

mkdir -p "$BASELINE_DIR"

echo "URL:         $URL"
echo "Baselines:   $BASELINE_DIR"
echo "Breakpoints: $BREAKPOINTS_JSON"
echo "Routes:      $ROUTES"
echo "Browsers:    $BROWSERS_JSON"
echo "Wait:        ${WAIT_MS}ms"
echo "Full page:   $FULL_PAGE"
echo ""

# --- Check Playwright ---
if ! npx playwright --version &> /dev/null; then
  echo "ERROR: Playwright not available. Run: pnpm add -D @playwright/test && npx playwright install"
  exit 1
fi

# --- Capture screenshots ---
TEMP_SCRIPT=$(mktemp /tmp/capture-baselines-XXXXXX.mjs)
cat > "$TEMP_SCRIPT" << 'SCRIPT_EOF'
import { chromium, firefox, webkit } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const url = process.argv[2];
const baselineDir = process.argv[3];
const breakpoints = JSON.parse(process.argv[4]);
const waitMs = parseInt(process.argv[5], 10);
const fullPage = process.argv[6] === 'true';
const routes = process.argv[7].split(',');
const browsers = JSON.parse(process.argv[8]);

const browserLaunchers = { chromium, firefox, webkit };

for (const browserName of browsers) {
  const launcher = browserLaunchers[browserName];
  if (!launcher) {
    console.error(`Unknown browser: ${browserName}`);
    continue;
  }

  console.log(`\n--- ${browserName} ---`);
  const browser = await launcher.launch();

  for (const route of routes) {
    const routeSlug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');

    for (const [bpName, width] of Object.entries(breakpoints)) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const target = `${url}${route}`;
      console.log(`  Capturing ${browserName}/${routeSlug}/${bpName} (${width}px) → ${target}`);

      try {
        await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(waitMs);

        const outDir = join(baselineDir, browserName, routeSlug);
        mkdirSync(outDir, { recursive: true });

        const filename = `${bpName}_${width}px.png`;
        await page.screenshot({ path: join(outDir, filename), fullPage });
        console.log(`    ✓ Saved ${filename}`);
      } catch (err) {
        console.error(`    ✗ Failed: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();
}

console.log('\nBaseline capture complete.');
SCRIPT_EOF

npx playwright test --version > /dev/null 2>&1 || true

node "$TEMP_SCRIPT" "$URL" "$BASELINE_DIR" "$BREAKPOINTS_JSON" "$WAIT_MS" "$FULL_PAGE" "$ROUTES" "$BROWSERS_JSON"
EXIT_CODE=$?

rm -f "$TEMP_SCRIPT"

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "=== Baselines saved to $BASELINE_DIR ==="
  echo ""
  echo "To commit baselines:"
  echo "  git add $BASELINE_DIR"
  echo "  git commit -m 'test: update visual regression baselines'"
  echo ""
  TOTAL=$(find "$BASELINE_DIR" -name "*.png" | wc -l)
  echo "Total baseline screenshots: $TOTAL"
else
  echo ""
  echo "ERROR: Baseline capture failed (exit code $EXIT_CODE)"
fi

exit $EXIT_CODE
