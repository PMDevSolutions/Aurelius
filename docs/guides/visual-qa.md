# Visual QA Deep Dive

The visual QA system provides pixel-level screenshot comparison using [pixelmatch](https://github.com/mapbox/pixelmatch). Instead of manual eyeballing, it programmatically compares actual and expected PNG files, outputs a diff image with magenta highlights, reports a mismatch percentage, and runs multi-layer analysis covering regions, sub-pixel artifacts, typography, and layout drift.

## Usage

### Single comparison

```bash
node scripts/visual-diff.js <actual.png> <expected.png> [options]
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--output <file>` | none | Path to save the diff image |
| `--threshold <n>` | `0.02` | Maximum mismatch ratio to pass (0.02 = 2%) |
| `--json` | off | Output JSON instead of human-readable text |
| `--region-grid <n>` | `4` | Grid divisions for region analysis (4 = 4x4 = 16 regions) |
| `--antialiasing <bool>` | `true` | Ignore antialiasing differences |

### Batch comparison

```bash
node scripts/visual-diff.js --batch <actual-dir> <expected-dir> [options]
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--output-dir <dir>` | `.claude/visual-qa/diffs` | Directory for diff images |
| `--threshold <n>` | `0.02` | Threshold applied to each file |

Batch mode compares every `.png` in the actual directory against the file with the same name in the expected directory. Files present in only one directory are reported as SKIP or MISSING.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Pass -- mismatch is at or below the threshold |
| 1 | Fail -- mismatch exceeds the threshold |
| 2 | Error -- missing files, invalid arguments, or runtime failure |

## How It Works

1. Both PNGs are loaded via `pngjs`.
2. If the images differ in size, both are scaled up to the larger dimensions. The extra area is filled with white.
3. `pixelmatch` runs with a per-pixel color distance threshold of `0.1`. Diff pixels are colored magenta (`[255, 0, 255]`) by default.
4. The overall mismatch percentage is calculated as `diffPixels / totalPixels`.
5. Four analysis layers run on the result: region grid, sub-pixel classification, typography, and layout drift.

## Region Grid Analysis

The diff image is divided into a grid (default 4x4 = 16 regions). Each region receives a human-readable name (e.g., `top-left`, `upper-center-right`, `bottom-left`) and an individual mismatch percentage.

Region status thresholds:

| Status | Condition |
|--------|-----------|
| pass | mismatch <= 1% |
| warn | mismatch 1--5% |
| fail | mismatch > 5% |

Regions are sorted by mismatch descending, so the worst areas appear first. Example output:

```
Problem Regions:
  FAIL  top-left — 8.42% diff
  FAIL  upper-center-left — 6.11% diff
Warning Regions:
  WARN  bottom-right — 2.30% diff
```

Configure the grid size with `--region-grid` or `iterationLoop.regionGridSize` in `pipeline.config.json`.

## Sub-Pixel Classification

Not every diff pixel represents a real visual difference. The sub-pixel classifier uses connected-component labeling (4-connected flood fill) to group diff pixels into clusters, then classifies each cluster:

- **Sub-pixel artifact**: cluster size <= `subPixelMaxClusterSize` (default 2 pixels)
- **Real difference**: cluster size > `subPixelMaxClusterSize`

The report includes total clusters, sub-pixel vs real counts, and the percentage of the diff that is sub-pixel noise. When more than 50% of diff pixels are sub-pixel artifacts, the output flags it:

```
Sub-Pixel Analysis:
  Total diff clusters: 142 (118 sub-pixel, 24 real)
  Sub-pixel artifacts: 62.3% of diff pixels
  Real differences:    0.08% of image
  NOTE: Majority of differences are sub-pixel rendering artifacts
```

Disable with `visualDiff.subPixelClassification: false` in `pipeline.config.json`.

## Typography Analysis

Detects font weight mismatches and font fallback issues by analyzing luminance patterns in horizontal bands (4px tall).

### Font weight detection

Compares the average dark-pixel luminance between actual and expected text bands. If the difference exceeds `fontWeightThreshold` (default 15), it reports a mismatch and the direction (`heavier` or `lighter`):

```
Typography Analysis:
  WARN  Font weight mismatch detected (expected is heavier, delta: 18.5)
```

### Font fallback detection

Compares dark-pixel density between corresponding text bands. If the density difference exceeds `fontFallbackDensityThreshold` (default 0.05 = 5%), it flags a likely font fallback:

```
  WARN  Font fallback likely (character density diff: 7.2%)
```

### Text line count mismatch

If the number of detected text bands differs between actual and expected, this is also reported:

```
  WARN  Text line count differs (actual: 12, expected: 14)
```

Disable with `visualDiff.typographyAnalysis: false`.

## Layout Drift Detection

Detects element shifts by building projection profiles -- the sum of dark pixels per row (horizontal profile) and per column (vertical profile) -- and using cross-correlation to find the offset that maximizes similarity.

The result includes estimated `dx` and `dy` in pixels and the overall shift magnitude. If the magnitude exceeds `layoutShiftThresholdPx` (default 2px), a warning is emitted:

```
Layout Analysis:
  WARN  Layout shift detected: dx=3px, dy=-1px (magnitude: 3.16px)
```

Disable with `visualDiff.layoutDriftAnalysis: false`.

## Threshold Tuning

The default threshold is `0.02` (2%), loaded from `pipeline.config.json` at `visualDiff.threshold`. Override per-run with `--threshold`.

When to adjust:

| Scenario | Recommendation |
|----------|----------------|
| Cross-platform font rendering differences | Raise to 0.03--0.05 |
| Anti-aliasing noise | Enable `--antialiasing true` (on by default) |
| Retina vs standard screenshots | Ensure both screenshots use the same resolution |
| Strict pixel-perfect requirement | Lower to 0.01 |

## Pipeline Integration

Visual diff runs as **Phase 5** of the build pipeline in an iteration loop:

1. Capture screenshots of the built components.
2. Compare against expected screenshots using `visual-diff.js`.
3. If the result is FAIL, fix the identified differences.
4. Re-screenshot and compare again.
5. Repeat up to `iterationLoop.maxVisualIterations` (default 5) times.

Two thresholds control the outcome:

| Setting | Default | Meaning |
|---------|---------|---------|
| `iterationLoop.diffPassThreshold` | `0.02` | At or below = PASS |
| `iterationLoop.diffWarnThreshold` | `0.05` | Between pass and warn = WARN, above = FAIL |

Diff images are saved to `visualDiff.outputDir` (default `.claude/visual-qa/diffs`).

## Default Breakpoints

Screenshots are captured at each configured breakpoint for responsive comparison. From `pipeline.config.json`:

| Name | Width |
|------|-------|
| mobile | 375px |
| tablet | 768px |
| desktop | 1440px |
| wide | 1920px |

The `requiredBreakpoints` setting (`["mobile", "tablet", "desktop"]`) controls which breakpoints must pass for the pipeline to proceed.

## Dark Mode Verification

After the visual diff phase passes, the automated hook suggests running dark mode screenshot comparison via `check-dark-mode.sh`. This runs as a separate non-blocking phase (5.5) in the pipeline. It captures dark-theme screenshots and compares them using the same pixelmatch engine.

## Batch Mode Summary

In batch mode, the report includes aggregate analysis alongside per-file results:

```
=== Visual Diff Report (Batch) ===
Actual:   /project/screenshots/actual
Expected: /project/screenshots/expected
Diffs:    /project/.claude/visual-qa/diffs

Total: 8 | Pass: 5 | Fail: 2 | Skip: 1
Overall: FAIL

  PASS hero.png — 0.41% diff (1205 pixels)
  FAIL nav.png — 4.82% diff (14230 pixels)
       Problem areas: top-left, top-center-left
       Font: weight mismatch (heavier)
  FAIL footer.png — 3.15% diff (9100 pixels)
       Layout: shift dx=4px dy=0px
  SKIP splash.png — No matching expected file: splash.png
```

The JSON output additionally includes `analysisSummary` with counts and file lists for font issues, layout shifts, and sub-pixel dominant files.

## Configuration Reference

All settings live in `.claude/pipeline.config.json`:

### `visualDiff` section

| Key | Default | Description |
|-----|---------|-------------|
| `threshold` | `0.02` | Overall mismatch ratio to pass |
| `diffColorRgb` | `[255, 0, 255]` | RGB color for diff pixels (magenta) |
| `antialiasing` | `true` | Ignore antialiasing differences |
| `subPixelClassification` | `true` | Enable sub-pixel artifact detection |
| `subPixelMaxClusterSize` | `2` | Max cluster size to classify as sub-pixel |
| `typographyAnalysis` | `true` | Enable font weight/fallback detection |
| `fontWeightThreshold` | `15` | Luminance delta to flag weight mismatch |
| `fontFallbackDensityThreshold` | `0.05` | Density delta to flag fallback (5%) |
| `layoutDriftAnalysis` | `true` | Enable layout shift detection |
| `layoutShiftThresholdPx` | `2` | Pixel shift magnitude to flag drift |
| `outputDir` | `.claude/visual-qa/diffs` | Directory for diff images |

### `iterationLoop` section

| Key | Default | Description |
|-----|---------|-------------|
| `maxVisualIterations` | `5` | Max fix-and-recheck cycles |
| `regionGridSize` | `4` | Grid divisions (4 = 4x4 = 16 regions) |
| `diffPassThreshold` | `0.02` | Mismatch ratio for PASS |
| `diffWarnThreshold` | `0.05` | Mismatch ratio for WARN (above = FAIL) |

## Troubleshooting

### Diff too high due to font rendering

Different operating systems and browsers render fonts differently. Solutions:

- Enable the antialiasing filter (`--antialiasing true`, on by default).
- Raise the threshold slightly (0.03--0.05).
- Normalize fonts by ensuring the same font files are loaded in both environments.

### Region shows drift but looks identical

Likely sub-pixel rendering artifacts. Check the sub-pixel analysis section of the output. If more than 50% of the diff is sub-pixel, the differences are noise and can be safely ignored by raising the threshold or increasing `subPixelMaxClusterSize`.

### Layout shift detected but design is correct

Cross-platform layout engines can produce small positional differences. Verify that both screenshots use the same viewport size, then adjust `layoutShiftThresholdPx` if the shift is within acceptable tolerance.

### Batch mode missing files

Ensure the actual and expected directories contain `.png` files with matching filenames. Files present in only one directory are reported as SKIP (no expected match) or MISSING (no actual match).

### Font weight mismatch warning

Verify that the correct font weights are loaded. A weight of 400 on one platform can render differently than on another. Check your `@font-face` declarations and ensure font files are not being substituted by the browser.
