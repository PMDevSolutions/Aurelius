# Screenshot-Based Regression Testing for Pipeline Output

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated screenshot comparison testing that captures pipeline output, manages baseline screenshots in git, compares against baselines on every PR, and reports visual regressions with configurable thresholds.

**Architecture:** A new `scripts/regression-test.sh` script orchestrates Playwright-based screenshot capture and `visual-diff.js` comparison against committed baseline PNGs. Baselines live in `.claude/visual-qa/baselines/` (git-tracked). A new CI workflow job runs on PRs and uploads diff artifacts. Configuration lives in `pipeline.config.json` under a new `regressionTesting` section.

**Tech Stack:** Playwright (screenshot capture), pixelmatch via visual-diff.js (comparison), GitHub Actions (CI), Bash (orchestration)

---

## Task 1: Add `regressionTesting` config section to pipeline.config.json

**Files:**
- Modify: `.claude/pipeline.config.json` (after `responsiveVerification` block, ~line 273)

**Step 1: Read the current config file**

Verify the file structure and find the insertion point after `responsiveVerification`.

**Step 2: Add the regressionTesting config block**

Insert after the `responsiveVerification` section (after line 273's closing `}`):

```json
"regressionTesting": {
  "enabled": true,
  "baselineDir": ".claude/visual-qa/baselines",
  "screenshotDir": ".claude/visual-qa/screenshots/regression",
  "diffDir": ".claude/visual-qa/diffs/regression",
  "threshold": 0.02,
  "failOnMissingBaseline": false,
  "updateBaselinesOnPass": false,
  "breakpoints": {
    "mobile": 375,
    "desktop": 1440
  },
  "waitAfterLoadMs": 1500,
  "fullPage": true,
  "routes": ["/"],
  "browsers": ["chromium"],
  "reportFile": "regression-report.md"
}
```

**Step 3: Validate JSON**

Run: `python3 -m json.tool .claude/pipeline.config.json > /dev/null`
Expected: exit code 0 (valid JSON)

**Step 4: Commit**

```bash
git add .claude/pipeline.config.json
git commit -m "feat: add regressionTesting config to pipeline.config.json"
```

---

## Task 2: Create baseline directory structure with .gitkeep

**Files:**
- Create: `.claude/visual-qa/baselines/.gitkeep`
- Create: `.claude/visual-qa/screenshots/regression/.gitkeep`
- Create: `.claude/visual-qa/diffs/regression/.gitkeep`

**Step 1: Create the directories and .gitkeep files**

```bash
mkdir -p .claude/visual-qa/baselines
mkdir -p .claude/visual-qa/screenshots/regression
mkdir -p .claude/visual-qa/diffs/regression
touch .claude/visual-qa/baselines/.gitkeep
touch .claude/visual-qa/screenshots/regression/.gitkeep
touch .claude/visual-qa/diffs/regression/.gitkeep
```

**Step 2: Update .gitignore to track baselines but ignore transient screenshots**

Check if `.gitignore` exists. Add rules so that:
- `.claude/visual-qa/baselines/` IS tracked (baselines are committed)
- `.claude/visual-qa/screenshots/regression/` is NOT tracked (transient capture)
- `.claude/visual-qa/diffs/regression/` is NOT tracked (transient diffs)

Add to `.gitignore`:

```
# Regression testing — track baselines, ignore transient captures
.claude/visual-qa/screenshots/regression/*.png
.claude/visual-qa/diffs/regression/*.png
```

**Step 3: Commit**

```bash
git add .claude/visual-qa/baselines/.gitkeep .claude/visual-qa/screenshots/regression/.gitkeep .claude/visual-qa/diffs/regression/.gitkeep .gitignore
git commit -m "feat: add baseline and regression screenshot directories"
```

---

## Task 3: Create `scripts/capture-baselines.sh` — baseline screenshot capture

**Files:**
- Create: `scripts/capture-baselines.sh`

**Step 1: Write the baseline capture script**

This script captures screenshots at configured breakpoints/routes and saves them as baselines. It reads config from `pipeline.config.json`.

```bash
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
import { mkdirSync, writeFileSync } from 'fs';
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
```

**Step 2: Make the script executable**

Run: `chmod +x scripts/capture-baselines.sh`

**Step 3: Verify syntax**

Run: `bash -n scripts/capture-baselines.sh`
Expected: no output (valid syntax)

**Step 4: Commit**

```bash
git add scripts/capture-baselines.sh
git commit -m "feat: add capture-baselines.sh for visual regression baseline management"
```

---

## Task 4: Create `scripts/regression-test.sh` — regression comparison runner

**Files:**
- Create: `scripts/regression-test.sh`

**Step 1: Write the regression test script**

This script captures current screenshots, compares them against baselines using `visual-diff.js`, and generates a report.

```bash
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
rm -rf "$SCREENSHOT_DIR"/*.png 2>/dev/null || true

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
  DIFF_EXIT=$?

  # Parse mismatch from JSON output
  MISMATCH=$(echo "$DIFF_OUTPUT" | node -e "
    let data='';
    process.stdin.on('data',d=>data+=d);
    process.stdin.on('end',()=>{
      try { const j=JSON.parse(data); console.log(j.mismatchPercentage||'?'); }
      catch { console.log('?'); }
    });
  " 2>/dev/null || echo "?")

  STATUS=$(echo "$DIFF_OUTPUT" | node -e "
    let data='';
    process.stdin.on('data',d=>data+=d);
    process.stdin.on('end',()=>{
      try { const j=JSON.parse(data); console.log(j.status||'unknown'); }
      catch { console.log('unknown'); }
    });
  " 2>/dev/null || echo "unknown")

  if [ "$STATUS" = "pass" ]; then
    echo "PASS: $rel_path (${MISMATCH}%)"
    PASS_COUNT=$((PASS_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | PASS | ${MISMATCH}% | - |"
  elif [ "$STATUS" = "warn" ]; then
    echo "WARN: $rel_path (${MISMATCH}%)"
    WARN_COUNT=$((WARN_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | WARN | ${MISMATCH}% | Close to threshold |"
  else
    echo "FAIL: $rel_path (${MISMATCH}%)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    RESULTS="$RESULTS\n| $rel_path | FAIL | ${MISMATCH}% | Exceeds ${THRESHOLD} threshold |"
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
**Threshold:** $THRESHOLD ($(echo "$THRESHOLD * 100" | bc)%)
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
$(echo -e "$RESULTS")

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
```

**Step 2: Make the script executable**

Run: `chmod +x scripts/regression-test.sh`

**Step 3: Verify syntax**

Run: `bash -n scripts/regression-test.sh`
Expected: no output (valid syntax)

**Step 4: Commit**

```bash
git add scripts/regression-test.sh
git commit -m "feat: add regression-test.sh for visual regression comparison"
```

---

## Task 5: Add visual regression CI workflow job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Read the current CI workflow**

Verify the existing job structure.

**Step 2: Add the visual-regression job**

Append a new job after the existing `token-verification` job:

```yaml
  visual-regression:
    name: Visual Regression Test
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Check for baselines
        id: baselines
        run: |
          BASELINE_COUNT=$(find .claude/visual-qa/baselines -name "*.png" 2>/dev/null | wc -l)
          echo "count=$BASELINE_COUNT" >> "$GITHUB_OUTPUT"
          if [ "$BASELINE_COUNT" -eq 0 ]; then
            echo "No baselines found — skipping regression test"
          else
            echo "Found $BASELINE_COUNT baseline screenshots"
          fi

      - name: Install app dependencies
        if: steps.baselines.outputs.count != '0' && hashFiles('app/package.json') != ''
        working-directory: app
        run: pnpm install --frozen-lockfile

      - name: Build app
        if: steps.baselines.outputs.count != '0' && hashFiles('app/package.json') != ''
        working-directory: app
        run: pnpm build

      - name: Start app server
        if: steps.baselines.outputs.count != '0' && hashFiles('app/package.json') != ''
        working-directory: app
        run: |
          pnpm start &
          sleep 5

      - name: Run visual regression tests
        if: steps.baselines.outputs.count != '0'
        run: bash scripts/regression-test.sh http://localhost:3000 --json
        continue-on-error: true
        id: regression

      - name: Upload diff artifacts
        if: steps.baselines.outputs.count != '0' && always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-regression-diffs
          path: |
            .claude/visual-qa/diffs/regression/
            .claude/visual-qa/regression-report.md
          retention-days: 14
          if-no-files-found: ignore

      - name: Comment PR with regression results
        if: steps.baselines.outputs.count != '0' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const reportPath = '.claude/visual-qa/regression-report.md';
            let body = '## Visual Regression Results\n\nNo report generated.';
            if (fs.existsSync(reportPath)) {
              body = fs.readFileSync(reportPath, 'utf-8');
            }
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c =>
              c.user.type === 'Bot' && c.body.includes('Visual Regression Results')
            );
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }
```

**Step 3: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` (or use `yq` if available)

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add visual regression testing job to CI workflow"
```

---

## Task 6: Add regression test hook to settings.json

**Files:**
- Modify: `.claude/settings.json`

**Step 1: Read the current settings.json**

Check the existing hooks array structure.

**Step 2: Add a PostToolUse hook for regression reminders**

Add a new hook that triggers after `pnpm build` to remind about regression testing:

```json
{
  "type": "PostToolUse",
  "matcher": "Bash",
  "hooks": [
    {
      "command": "bash .claude/hooks/regression-reminder.sh \"$TOOL_INPUT\" \"$TOOL_OUTPUT\"",
      "description": "Reminds to run visual regression tests after successful builds"
    }
  ]
}
```

**Step 3: Create the hook script `.claude/hooks/regression-reminder.sh`**

```bash
#!/usr/bin/env bash
# regression-reminder.sh — PostToolUse hook: remind about regression tests
TOOL_INPUT="$1"
TOOL_OUTPUT="$2"

# Only trigger on pnpm build success
if echo "$TOOL_INPUT" | grep -q "pnpm build" && echo "$TOOL_OUTPUT" | grep -q "Build\|build.*complete\|Successfully compiled"; then
  BASELINE_COUNT=$(find .claude/visual-qa/baselines -name "*.png" 2>/dev/null | wc -l)
  if [ "$BASELINE_COUNT" -gt 0 ]; then
    echo "REGRESSION: $BASELINE_COUNT baselines exist. Run ./scripts/regression-test.sh to check for visual regressions."
  fi
fi
```

**Step 4: Make the hook executable**

Run: `chmod +x .claude/hooks/regression-reminder.sh`

**Step 5: Commit**

```bash
git add .claude/settings.json .claude/hooks/regression-reminder.sh
git commit -m "feat: add regression test reminder hook"
```

---

## Task 7: Update CLAUDE.md with regression testing documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add regression test commands to the Development Scripts section**

Add to the script reference list:

```bash
# Capture baseline screenshots for visual regression
./scripts/capture-baselines.sh [url] [--routes /,/about]

# Run visual regression tests against baselines
./scripts/regression-test.sh [url] [--update-baselines] [--json]
```

**Step 2: Add regression testing to the pipeline phase list**

Update the pipeline phases to include regression testing between Phase 7 (Cross-Browser) and Phase 8 (Quality Gate):

```
Phase 7.5→ Regression (regression-test.sh, compare against baselines, non-blocking)
```

**Step 3: Update the hook table**

Add the regression reminder hook:

```
| Regression reminder | `pnpm build` succeeds | Suggests running `./scripts/regression-test.sh` if baselines exist |
```

**Step 4: Update the architecture summary line**

Update the "Last Updated" date and counts (8 hooks, 21 scripts).

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add visual regression testing to CLAUDE.md"
```

---

## Task 8: Create regression testing documentation

**Files:**
- Create: `docs/regression-testing/README.md`

**Step 1: Write the documentation**

```markdown
# Screenshot-Based Visual Regression Testing

Automated screenshot comparison testing that captures pipeline output and compares
against committed baseline screenshots to catch visual regressions.

## Quick Start

```bash
# 1. Capture baselines (one-time, with app running)
./scripts/capture-baselines.sh http://localhost:3000

# 2. Commit baselines
git add .claude/visual-qa/baselines/
git commit -m "test: add visual regression baselines"

# 3. Run regression tests (after code changes)
./scripts/regression-test.sh http://localhost:3000
```

## How It Works

1. **Baselines** are committed PNGs in `.claude/visual-qa/baselines/`
2. **Regression tests** capture new screenshots and compare pixel-by-pixel using `pixelmatch`
3. **Diffs** are generated as magenta-highlighted PNGs showing changed regions
4. **Reports** are generated in Markdown with pass/fail/warn per screenshot
5. **CI** runs automatically on PRs, uploads diff artifacts, and comments results

## Configuration

All settings in `.claude/pipeline.config.json` under `regressionTesting`:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable regression testing |
| `baselineDir` | `.claude/visual-qa/baselines` | Where baselines are stored (git-tracked) |
| `threshold` | `0.02` | Max mismatch ratio (2%) before failing |
| `failOnMissingBaseline` | `false` | Fail if no baselines exist |
| `updateBaselinesOnPass` | `false` | Auto-update baselines when tests pass |
| `breakpoints` | `{mobile: 375, desktop: 1440}` | Viewport widths to capture |
| `routes` | `["/"]` | App routes to screenshot |
| `browsers` | `["chromium"]` | Browsers for capture |
| `waitAfterLoadMs` | `1500` | Wait time after page load |
| `fullPage` | `true` | Capture full page or viewport only |

## Updating Baselines

When visual changes are intentional:

```bash
# Option 1: Re-capture baselines
./scripts/capture-baselines.sh http://localhost:3000
git add .claude/visual-qa/baselines/
git commit -m "test: update visual regression baselines"

# Option 2: Auto-update on passing tests
./scripts/regression-test.sh http://localhost:3000 --update-baselines
```

## CI Integration

The `visual-regression` job in `.github/workflows/ci.yml`:
- Runs on PRs only
- Skips if no baselines exist
- Uploads diff images as artifacts (14-day retention)
- Posts/updates a PR comment with the regression report

## Directory Structure

```
.claude/visual-qa/
├── baselines/                    # Git-tracked baseline PNGs
│   └── chromium/
│       └── home/
│           ├── mobile_375px.png
│           └── desktop_1440px.png
├── screenshots/regression/       # Transient current captures (gitignored)
├── diffs/regression/             # Transient diff images (gitignored)
└── regression-report.md          # Latest report
```

## Thresholds

- **Pass:** < 2% mismatch (configurable via `threshold`)
- **Warn:** 2-5% mismatch (borderline, investigate)
- **Fail:** > threshold mismatch (regression detected)

The threshold accounts for anti-aliasing and sub-pixel rendering differences.
Adjust via `pipeline.config.json` if cross-platform rendering causes false positives.
```

**Step 2: Commit**

```bash
git add docs/regression-testing/README.md
git commit -m "docs: add regression testing documentation"
```

---

## Execution Summary

| Task | What | Key Files |
|------|------|-----------|
| 1 | Config section | `pipeline.config.json` |
| 2 | Directory structure | `.claude/visual-qa/baselines/`, `.gitignore` |
| 3 | Baseline capture script | `scripts/capture-baselines.sh` |
| 4 | Regression test script | `scripts/regression-test.sh` |
| 5 | CI workflow job | `.github/workflows/ci.yml` |
| 6 | Reminder hook | `.claude/settings.json`, `.claude/hooks/regression-reminder.sh` |
| 7 | CLAUDE.md updates | `CLAUDE.md` |
| 8 | Documentation | `docs/regression-testing/README.md` |

**Total new files:** 4 (capture-baselines.sh, regression-test.sh, regression-reminder.sh, docs README)
**Modified files:** 4 (pipeline.config.json, ci.yml, settings.json, CLAUDE.md)
