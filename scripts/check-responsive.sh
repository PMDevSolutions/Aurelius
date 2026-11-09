#!/usr/bin/env bash
# check-responsive.sh — Capture screenshots at all breakpoints using Playwright
# Exit codes: 0=success, 1=error (Playwright not available, capture failed)
#
# Acts on the app in the current directory when that holds a package.json (an
# app scaffolded beside the framework: `cd my-app && ../scripts/check-responsive.sh`),
# otherwise on the Aurelius checkout. Playwright is installed there; the
# screenshots go under the Aurelius checkout's .claude/visual-qa/ either way.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
FRAMEWORK_ROOT="$(common_project_root)"
APP_ROOT="$(common_app_root)"

# --- Args ---
URL="${1:-http://localhost:3000}"
OUTPUT_DIR="${2:-$FRAMEWORK_ROOT/.claude/visual-qa/screenshots/responsive}"

# --- Help ---
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: check-responsive.sh [url] [output-dir]"
  echo ""
  echo "  url         URL to capture (default: http://localhost:3000)"
  echo "  output-dir  Screenshot output directory (default: .claude/visual-qa/screenshots/responsive in the Aurelius checkout)"
  echo ""
  echo "Reads breakpoints from .claude/pipeline.config.json visualDiff.breakpoints."
  echo "Playwright is installed in the current directory when it holds a package.json"
  echo "(cd my-app && ../scripts/check-responsive.sh), otherwise in the Aurelius checkout."
  exit 0
fi

cd "$APP_ROOT"

echo "=== Responsive Screenshot Capture ==="
echo ""

# --- Read breakpoints from pipeline config ---
FALLBACK_BREAKPOINTS='{"small-mobile":320,"mobile":375,"tablet":768,"desktop":1440,"wide":1920}'
BREAKPOINTS_JSON=$(common_config_get 'visualDiff.breakpoints' "$FALLBACK_BREAKPOINTS")
# Treat empty object as "use fallback" to preserve old behaviour.
if [[ "$BREAKPOINTS_JSON" == "{}" ]]; then
  BREAKPOINTS_JSON="$FALLBACK_BREAKPOINTS"
fi

echo "▸ URL: $URL"
echo "▸ App: $APP_ROOT"
echo "▸ Output: $OUTPUT_DIR"
echo "▸ Breakpoints: $BREAKPOINTS_JSON"
echo ""

# --- Ensure output directory exists ---
mkdir -p "$OUTPUT_DIR"

# --- Ensure Playwright is available in the app ---
if ! pnpm exec playwright --version >/dev/null 2>&1; then
  echo "  ▸ Installing @playwright/test in $APP_ROOT..."
  pnpm add -D @playwright/test 2>/dev/null || {
    echo "  ✗ Failed to install @playwright/test. Run 'pnpm add -D @playwright/test' in $APP_ROOT."
    exit 1
  }
  echo "  ✓ @playwright/test installed"
  echo "  ▸ Installing Playwright browsers..."
  pnpm exec playwright install chromium 2>/dev/null || {
    echo "  ✗ Failed to install Playwright browsers. Run 'pnpm exec playwright install chromium' in $APP_ROOT."
    exit 1
  }
  echo "  ✓ Chromium browser installed"
  echo ""
fi

# --- Generate temporary Playwright script ---
# ESM needs the .mjs name, and `mktemp -d` is the portable way to get a fresh path for it.
TEMP_DIR=$(mktemp -d)
common_track_tmpfile "$TEMP_DIR"
TEMP_SCRIPT="$TEMP_DIR/capture.mjs"

cat > "$TEMP_SCRIPT" <<'PLAYWRIGHT_EOF'
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { join } from 'path';

const [url, outputDir, breakpointsJson, appRoot] = process.argv.slice(2);
// Resolve @playwright/test from the app, not from this script's temp directory.
const require = createRequire(join(appRoot, 'package.json'));
const { chromium } = require('@playwright/test');
const breakpoints = JSON.parse(breakpointsJson);

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();
const entries = Object.entries(breakpoints);

for (const [name, width] of entries) {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: 900 },
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const filename = `${name}-${width}px.png`;
  await page.screenshot({
    path: join(outputDir, filename),
    fullPage: true,
  });
  await page.close();
  console.log(`✓ ${filename} (${width}px)`);
}

await browser.close();
PLAYWRIGHT_EOF

# --- Run screenshot capture ---
echo "▸ Capturing screenshots..."
echo ""

node "$TEMP_SCRIPT" "$URL" "$OUTPUT_DIR" "$BREAKPOINTS_JSON" "$APP_ROOT" || {
  echo ""
  echo "  ✗ Screenshot capture failed"
  echo "  Make sure the target URL is accessible and Playwright browsers are installed in $APP_ROOT"
  exit 1
}

echo ""
echo "=== Summary ==="
echo "✓ Responsive screenshots saved → $OUTPUT_DIR/"
exit 0
