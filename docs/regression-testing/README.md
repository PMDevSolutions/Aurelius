# Screenshot-Based Visual Regression Testing

Automated screenshot comparison testing that captures pipeline output and compares
against committed baseline screenshots to catch visual regressions.

> **Cross-browser baselines** (firefox/webkit, pinned-container capture,
> provenance manifest, pluggable storage backends) are the RFC 0002 flow
> documented in [cross-browser.md](cross-browser.md). This page covers the
> same-browser chromium regression flow; the two share the baseline directory
> but each walks only its own engines.

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
│   ├── manifest.json             # Cross-browser provenance (see cross-browser.md)
│   ├── chromium/                 # This flow (regressionTesting.browsers)
│   │   └── home/
│   │       ├── mobile_375px.png
│   │       └── desktop_1440px.png
│   ├── firefox/                  # Cross-browser flow (visualBaselines)
│   └── webkit/                   # Cross-browser flow (visualBaselines)
├── screenshots/regression/       # Transient current captures (gitignored)
├── diffs/regression/             # Transient diff images (gitignored)
└── regression-report.md          # Latest report
```

When `--update-baselines` (or `capture-baselines.sh`) rewrites chromium
baselines and a cross-browser provenance manifest exists, the affected entries
are refreshed automatically so provenance stays truthful.

## Thresholds

- **Pass:** < 2% mismatch (configurable via `threshold`)
- **Warn:** 2-5% mismatch (borderline, investigate)
- **Fail:** > threshold mismatch (regression detected)

The threshold accounts for anti-aliasing and sub-pixel rendering differences.
Adjust via `pipeline.config.json` if cross-platform rendering causes false positives.
