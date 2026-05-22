#!/usr/bin/env bash
# check-responsive.sh — Capture screenshots at all breakpoints using Playwright
# Exit codes: 0=success, 1=error (Playwright not available, capture failed)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
cd "$(common_project_root)"

# --- Args ---
URL="${1:-http://localhost:3000}"
OUTPUT_DIR="${2:-.claude/visual-qa/screenshots/responsive}"

# --- Help ---
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: check-responsive.sh [url] [output-dir]"
  echo ""
  echo "  url         URL to capture (default: http://localhost:3000)"
  echo "  output-dir  Screenshot output directory (default: .claude/visual-qa/screenshots/responsive)"
  echo ""
  echo "Reads breakpoints from .claude/pipeline.config.json visualDiff.breakpoints"
  exit 0
fi

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
echo "▸ Output: $OUTPUT_DIR"
echo "▸ Breakpoints: $BREAKPOINTS_JSON"
echo ""

# --- Ensure output directory exists ---
mkdir -p "$OUTPUT_DIR"

# --- Ensure Playwright is available ---
if ! npx playwright --version &>/dev/null; then
  echo "  ▸ Installing @playwright/test..."
  pnpm add -D @playwright/test 2>/dev/null || {
    echo "  ✗ Failed to install @playwright/test. Run 'pnpm add -D @playwright/test' manually."
    exit 1
  }
  echo "  ✓ @playwright/test installed"
  echo "  ▸ Installing Playwright browsers..."
  npx playwright install chromium 2>/dev/null || {
    echo "  ✗ Failed to install Playwright browsers. Run 'npx playwright install chromium' manually."
    exit 1
  }
  echo "  ✓ Chromium browser installed"
  echo ""
fi

# --- Generate temporary Playwright script ---
TEMP_SCRIPT=$(mktemp --suffix=.mjs)
common_track_tmpfile "$TEMP_SCRIPT"

cat > "$TEMP_SCRIPT" <<'PLAYWRIGHT_EOF'
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const url = process.argv[2];
const outputDir = process.argv[3];
const breakpoints = JSON.parse(process.argv[4]);

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

node "$TEMP_SCRIPT" "$URL" "$OUTPUT_DIR" "$BREAKPOINTS_JSON" || {
  echo ""
  echo "  ✗ Screenshot capture failed"
  echo "  Make sure the target URL is accessible and Playwright browsers are installed"
  exit 1
}

echo ""
echo "=== Summary ==="
echo "✓ Responsive screenshots saved → $OUTPUT_DIR/"
exit 0
