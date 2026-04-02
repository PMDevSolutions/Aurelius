#!/usr/bin/env node
/**
 * visual-diff.js — Pixel-level screenshot comparison using pixelmatch
 *
 * Usage:
 *   node scripts/visual-diff.js <actual> <expected> [--output <diff.png>] [--threshold <0.02>] [--json]
 *   node scripts/visual-diff.js --batch <dir-actual> <dir-expected> [--output-dir <diffs/>] [--threshold <0.02>]
 *
 * Outputs:
 *   - Diff image (magenta highlights)
 *   - Mismatch percentage
 *   - Region-based analysis (which quadrants differ)
 *   - Exit code: 0 = pass, 1 = fail (above threshold), 2 = error
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join, basename, extname, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load pipeline config for defaults
function loadConfig() {
  const configPath = join(__dirname, "..", ".claude", "pipeline.config.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const parsed = {
    mode: "single", // single | batch
    actual: null,
    expected: null,
    output: null,
    outputDir: null,
    threshold: null,
    json: false,
    regionGrid: null,
    antialiasing: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "--batch":
        parsed.mode = "batch";
        break;
      case "--output":
        parsed.output = args[++i];
        break;
      case "--output-dir":
        parsed.outputDir = args[++i];
        break;
      case "--threshold":
        parsed.threshold = parseFloat(args[++i]);
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--region-grid":
        parsed.regionGrid = parseInt(args[++i], 10);
        break;
      case "--antialiasing":
        parsed.antialiasing = args[++i] !== "false";
        break;
      default:
        if (!parsed.actual) parsed.actual = arg;
        else if (!parsed.expected) parsed.expected = arg;
        break;
    }
    i++;
  }

  return parsed;
}

function loadPNG(filepath) {
  const buffer = readFileSync(filepath);
  return PNG.sync.read(buffer);
}

function savePNG(filepath, png) {
  const dir = dirname(filepath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const buffer = PNG.sync.write(png);
  writeFileSync(filepath, buffer);
}

/**
 * Analyze which regions of the image have the most differences.
 * Divides the image into a grid and reports mismatch per cell.
 */
function analyzeRegions(diffData, width, height, gridSize) {
  const cellW = Math.ceil(width / gridSize);
  const cellH = Math.ceil(height / gridSize);
  const regions = [];

  const regionNames = {
    "0,0": "top-left",
    "1,0": "top-center-left",
    "2,0": "top-center-right",
    "3,0": "top-right",
    "0,1": "upper-left",
    "1,1": "upper-center-left",
    "2,1": "upper-center-right",
    "3,1": "upper-right",
    "0,2": "lower-left",
    "1,2": "lower-center-left",
    "2,2": "lower-center-right",
    "3,2": "lower-right",
    "0,3": "bottom-left",
    "1,3": "bottom-center-left",
    "2,3": "bottom-center-right",
    "3,3": "bottom-right",
  };

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const startX = gx * cellW;
      const startY = gy * cellH;
      const endX = Math.min(startX + cellW, width);
      const endY = Math.min(startY + cellH, height);
      const cellPixels = (endX - startX) * (endY - startY);

      let diffPixels = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          // Diff pixels are magenta (255, 0, 255) — check R and B channels
          if (diffData[idx] === 255 && diffData[idx + 1] === 0 && diffData[idx + 2] === 255) {
            diffPixels++;
          }
        }
      }

      const mismatchPct = cellPixels > 0 ? diffPixels / cellPixels : 0;
      const key = `${gx},${gy}`;

      regions.push({
        name: regionNames[key] || `region-${gx}-${gy}`,
        gridX: gx,
        gridY: gy,
        bounds: { x: startX, y: startY, width: endX - startX, height: endY - startY },
        diffPixels,
        totalPixels: cellPixels,
        mismatchPct: Math.round(mismatchPct * 10000) / 10000,
        status: mismatchPct <= 0.01 ? "pass" : mismatchPct <= 0.05 ? "warn" : "fail",
      });
    }
  }

  return regions.sort((a, b) => b.mismatchPct - a.mismatchPct);
}

/**
 * Classify diff pixels as sub-pixel artifacts vs real differences.
 * Sub-pixel: isolated pixels or clusters <= maxClusterSize.
 * Real: connected clusters > maxClusterSize.
 */
function analyzeSubPixel(diffData, width, height, diffColor, maxClusterSize = 2) {
  // Build a boolean grid of diff pixels
  const isDiff = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (
      diffData[idx] === diffColor[0] &&
      diffData[idx + 1] === diffColor[1] &&
      diffData[idx + 2] === diffColor[2]
    ) {
      isDiff[i] = 1;
    }
  }

  // Connected-component labeling (4-connected flood fill)
  const visited = new Uint8Array(width * height);
  const clusters = [];

  function floodFill(startIdx) {
    const stack = [startIdx];
    const pixels = [];
    visited[startIdx] = 1;

    while (stack.length > 0) {
      const idx = stack.pop();
      pixels.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);

      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);

      for (const n of neighbors) {
        if (isDiff[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    return pixels;
  }

  let subPixelCount = 0;
  let realDiffCount = 0;

  for (let i = 0; i < width * height; i++) {
    if (isDiff[i] && !visited[i]) {
      const cluster = floodFill(i);
      if (cluster.length <= maxClusterSize) {
        subPixelCount += cluster.length;
        clusters.push({ size: cluster.length, type: "sub-pixel" });
      } else {
        realDiffCount += cluster.length;
        clusters.push({ size: cluster.length, type: "real" });
      }
    }
  }

  const totalDiff = subPixelCount + realDiffCount;
  const totalPixels = width * height;

  return {
    totalDiffPixels: totalDiff,
    subPixelPixels: subPixelCount,
    realDiffPixels: realDiffCount,
    subPixelPct: totalDiff > 0 ? Math.round((subPixelCount / totalDiff) * 10000) / 10000 : 0,
    realDiffPct: totalPixels > 0 ? Math.round((realDiffCount / totalPixels) * 10000) / 10000 : 0,
    clusterCount: clusters.length,
    subPixelClusters: clusters.filter((c) => c.type === "sub-pixel").length,
    realClusters: clusters.filter((c) => c.type === "real").length,
    largestCluster: clusters.reduce((max, c) => Math.max(max, c.size), 0),
  };
}

/**
 * Detect font weight mismatches and font fallback issues.
 * Analyzes luminance patterns in text regions of both images.
 */
function analyzeTypography(actualData, expectedData, width, height, options = {}) {
  const DARK_THRESHOLD = 180;
  const BAND_HEIGHT = 4;
  const WEIGHT_THRESHOLD = options.fontWeightThreshold ?? 15;
  const FALLBACK_THRESHOLD = options.fontFallbackDensityThreshold ?? 0.05;

  function getLuminance(data, idx) {
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  function analyzeBands(data) {
    const bands = [];
    for (let bandY = 0; bandY < height; bandY += BAND_HEIGHT) {
      let darkPixels = 0;
      let darkLuminance = 0;
      let pixelCount = 0;

      for (let y = bandY; y < Math.min(bandY + BAND_HEIGHT, height); y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const lum = getLuminance(data, idx);
          pixelCount++;
          if (lum < DARK_THRESHOLD) {
            darkPixels++;
            darkLuminance += lum;
          }
        }
      }

      const darkRatio = pixelCount > 0 ? darkPixels / pixelCount : 0;
      const avgDarkLum = darkPixels > 0 ? darkLuminance / darkPixels : 255;
      bands.push({ darkRatio, avgDarkLum, darkPixels, pixelCount });
    }
    return bands;
  }

  function getTextBands(bands) {
    return bands.map((b, i) => ({ ...b, index: i })).filter((b) => b.darkRatio > 0.05);
  }

  const actualBands = analyzeBands(actualData);
  const expectedBands = analyzeBands(expectedData);
  const actualText = getTextBands(actualBands);
  const expectedText = getTextBands(expectedBands);

  // --- Font weight detection ---
  let weightDiff = 0;
  let weightSamples = 0;
  const minTextBands = Math.min(actualText.length, expectedText.length);

  for (let i = 0; i < minTextBands; i++) {
    const aIdx = actualText[i].index;
    const eIdx = expectedText[i].index;
    if (aIdx < actualBands.length && eIdx < expectedBands.length) {
      weightDiff += actualBands[aIdx].avgDarkLum - expectedBands[eIdx].avgDarkLum;
      weightSamples++;
    }
  }

  const avgWeightDiff = weightSamples > 0 ? weightDiff / weightSamples : 0;
  const fontWeightMismatch = Math.abs(avgWeightDiff) > WEIGHT_THRESHOLD;
  let weightDirection = "none";
  if (fontWeightMismatch) {
    weightDirection = avgWeightDiff > 0 ? "heavier" : "lighter";
  }

  // --- Font fallback detection ---
  let densityDiffSum = 0;
  let densitySamples = 0;

  for (let i = 0; i < minTextBands; i++) {
    const aIdx = actualText[i].index;
    const eIdx = expectedText[i].index;
    if (aIdx < actualBands.length && eIdx < expectedBands.length) {
      const aDensity = actualBands[aIdx].darkRatio;
      const eDensity = expectedBands[eIdx].darkRatio;
      densityDiffSum += Math.abs(aDensity - eDensity);
      densitySamples++;
    }
  }

  const avgDensityDiff = densitySamples > 0 ? densityDiffSum / densitySamples : 0;
  const fontFallbackDetected = avgDensityDiff > FALLBACK_THRESHOLD;

  return {
    fontWeightMismatch,
    weightDirection,
    avgWeightDifference: Math.round(Math.abs(avgWeightDiff) * 100) / 100,
    fontFallbackDetected,
    avgDensityDifference: Math.round(avgDensityDiff * 10000) / 10000,
    textBandsActual: actualText.length,
    textBandsExpected: expectedText.length,
    textBandCountMismatch: actualText.length !== expectedText.length,
  };
}

/**
 * Detect layout drift by comparing projection profiles.
 * Horizontal profile: sum of dark pixels per row (detects vertical shift).
 * Vertical profile: sum of dark pixels per column (detects horizontal shift).
 * Cross-correlation finds the best-matching offset.
 */
function analyzeLayout(actualData, expectedData, width, height, options = {}) {
  const DARK_THRESHOLD = 200;
  const SHIFT_THRESHOLD = options.layoutShiftThresholdPx ?? 2;

  function buildProfiles(data) {
    const horizontal = new Float64Array(height);
    const vertical = new Float64Array(width);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < DARK_THRESHOLD) {
          horizontal[y]++;
          vertical[x]++;
        }
      }
    }
    return { horizontal, vertical };
  }

  /**
   * Cross-correlate two 1D profiles to find the offset that maximizes similarity.
   * Returns { offset, correlation } where offset is the pixel shift.
   */
  function crossCorrelate(profileA, profileB, maxShift) {
    const len = profileA.length;
    let bestOffset = 0;
    let bestCorr = -Infinity;

    for (let shift = -maxShift; shift <= maxShift; shift++) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < len; i++) {
        const j = i + shift;
        if (j >= 0 && j < len) {
          sum += profileA[i] * profileB[j];
          count++;
        }
      }
      const corr = count > 0 ? sum / count : 0;
      // Prefer smaller absolute offset when correlations are effectively equal
      const eps = bestCorr * 1e-9;
      if (
        corr > bestCorr + eps ||
        (Math.abs(corr - bestCorr) <= eps && Math.abs(shift) < Math.abs(bestOffset))
      ) {
        bestCorr = corr;
        bestOffset = shift;
      }
    }

    let zeroCorr = 0;
    for (let i = 0; i < len; i++) {
      zeroCorr += profileA[i] * profileB[i];
    }
    zeroCorr /= len;

    return { offset: bestOffset, correlation: bestCorr, zeroCorrelation: zeroCorr };
  }

  const actualProfiles = buildProfiles(actualData);
  const expectedProfiles = buildProfiles(expectedData);

  const MAX_SHIFT = Math.min(50, Math.floor(Math.min(width, height) * 0.1));

  const hResult = crossCorrelate(actualProfiles.horizontal, expectedProfiles.horizontal, MAX_SHIFT);
  const vResult = crossCorrelate(actualProfiles.vertical, expectedProfiles.vertical, MAX_SHIFT);

  const dx = Math.abs(vResult.offset);
  const dy = Math.abs(hResult.offset);
  const layoutShiftDetected = dx > SHIFT_THRESHOLD || dy > SHIFT_THRESHOLD;

  return {
    layoutShiftDetected,
    estimatedShift: {
      dx: vResult.offset,
      dy: hResult.offset,
    },
    shiftMagnitude: Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100,
    horizontalProfile: {
      offset: hResult.offset,
      correlationImprovement:
        hResult.correlation > 0
          ? Math.round(
              ((hResult.correlation - hResult.zeroCorrelation) / hResult.correlation) * 10000,
            ) / 10000
          : 0,
    },
    verticalProfile: {
      offset: vResult.offset,
      correlationImprovement:
        vResult.correlation > 0
          ? Math.round(
              ((vResult.correlation - vResult.zeroCorrelation) / vResult.correlation) * 10000,
            ) / 10000
          : 0,
    },
  };
}

function compareSingle(actualPath, expectedPath, options) {
  const config = loadConfig();
  const vdConfig = config?.visualDiff || {};
  const iterConfig = config?.iterationLoop || {};

  const threshold = options.threshold ?? vdConfig.threshold ?? 0.02;
  const antialiasing = options.antialiasing ?? vdConfig.antialiasing ?? true;
  const regionGrid = options.regionGrid ?? iterConfig.regionGridSize ?? 4;
  const diffColor = vdConfig.diffColorRgb || [255, 0, 255];
  const subPixelEnabled = vdConfig.subPixelClassification !== false;
  const typographyEnabled = vdConfig.typographyAnalysis !== false;
  const layoutEnabled = vdConfig.layoutDriftAnalysis !== false;
  const subPixelMaxCluster = vdConfig.subPixelMaxClusterSize ?? 2;

  const actual = loadPNG(actualPath);
  const expected = loadPNG(expectedPath);

  // Handle size mismatch by scaling to the larger dimensions
  const width = Math.max(actual.width, expected.width);
  const height = Math.max(actual.height, expected.height);

  // Create canvases at the target size
  function resizeToCanvas(src, w, h) {
    if (src.width === w && src.height === h) return src.data;
    const canvas = new Uint8Array(w * h * 4);
    // Fill with white (transparent areas become white for comparison)
    canvas.fill(255);
    for (let y = 0; y < src.height && y < h; y++) {
      for (let x = 0; x < src.width && x < w; x++) {
        const srcIdx = (y * src.width + x) * 4;
        const dstIdx = (y * w + x) * 4;
        canvas[dstIdx] = src.data[srcIdx];
        canvas[dstIdx + 1] = src.data[srcIdx + 1];
        canvas[dstIdx + 2] = src.data[srcIdx + 2];
        canvas[dstIdx + 3] = src.data[srcIdx + 3];
      }
    }
    return canvas;
  }

  const actualData = resizeToCanvas(actual, width, height);
  const expectedData = resizeToCanvas(expected, width, height);

  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(actualData, expectedData, diff.data, width, height, {
    threshold: 0.1, // per-pixel color distance threshold
    includeAA: !antialiasing,
    diffColor,
    alpha: 0.3,
  });

  const totalPixels = width * height;
  const mismatchPct = totalPixels > 0 ? numDiffPixels / totalPixels : 0;
  const pass = mismatchPct <= threshold;

  // Region analysis
  const regions = analyzeRegions(diff.data, width, height, regionGrid);
  const failingRegions = regions.filter((r) => r.status === "fail");
  const warningRegions = regions.filter((r) => r.status === "warn");

  // Sub-pixel classification
  const subPixelAnalysis = subPixelEnabled
    ? analyzeSubPixel(diff.data, width, height, diffColor, subPixelMaxCluster)
    : null;

  // Typography analysis
  const typographyAnalysis = typographyEnabled
    ? analyzeTypography(actualData, expectedData, width, height, {
        fontWeightThreshold: vdConfig.fontWeightThreshold,
        fontFallbackDensityThreshold: vdConfig.fontFallbackDensityThreshold,
      })
    : null;

  // Layout drift analysis
  const layoutAnalysis = layoutEnabled
    ? analyzeLayout(actualData, expectedData, width, height, {
        layoutShiftThresholdPx: vdConfig.layoutShiftThresholdPx,
      })
    : null;

  // Save diff image if output specified
  const outputPath =
    options.output ||
    (options.outputDir ? join(options.outputDir, `diff-${basename(actualPath)}`) : null);

  if (outputPath) {
    savePNG(outputPath, diff);
  }

  return {
    actual: resolve(actualPath),
    expected: resolve(expectedPath),
    diffImage: outputPath ? resolve(outputPath) : null,
    dimensions: {
      width,
      height,
      actualSize: `${actual.width}x${actual.height}`,
      expectedSize: `${expected.width}x${expected.height}`,
    },
    totalPixels,
    diffPixels: numDiffPixels,
    mismatchPct: Math.round(mismatchPct * 10000) / 10000,
    threshold,
    pass,
    status: pass ? "PASS" : "FAIL",
    regions: {
      gridSize: regionGrid,
      failing: failingRegions,
      warning: warningRegions,
      summary:
        failingRegions.length === 0
          ? "All regions within tolerance"
          : `${failingRegions.length} region(s) exceed threshold: ${failingRegions.map((r) => r.name).join(", ")}`,
    },
    subPixelAnalysis,
    typographyAnalysis,
    layoutAnalysis,
  };
}

function compareBatch(actualDir, expectedDir, options) {
  const config = loadConfig();
  const outputDir = options.outputDir || config?.visualDiff?.outputDir || ".claude/visual-qa/diffs";

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const actualFiles = readdirSync(actualDir).filter((f) => extname(f).toLowerCase() === ".png");
  const expectedFiles = new Set(
    readdirSync(expectedDir).filter((f) => extname(f).toLowerCase() === ".png"),
  );

  const results = [];
  let overallPass = true;

  for (const file of actualFiles) {
    if (!expectedFiles.has(file)) {
      results.push({
        file,
        status: "SKIP",
        reason: `No matching expected file: ${file}`,
      });
      continue;
    }

    const result = compareSingle(join(actualDir, file), join(expectedDir, file), {
      ...options,
      output: join(outputDir, `diff-${file}`),
    });

    results.push({ file, ...result });
    if (!result.pass) overallPass = false;
  }

  // Check for expected files with no actual counterpart
  for (const file of expectedFiles) {
    if (!actualFiles.includes(file)) {
      results.push({
        file,
        status: "MISSING",
        reason: `Expected file has no actual counterpart: ${file}`,
      });
      overallPass = false;
    }
  }

  const fontIssues = results.filter(
    (r) => r.typographyAnalysis?.fontWeightMismatch || r.typographyAnalysis?.fontFallbackDetected,
  );
  const layoutIssues = results.filter((r) => r.layoutAnalysis?.layoutShiftDetected);
  const subPixelDominant = results.filter((r) => r.subPixelAnalysis?.subPixelPct > 0.5);

  return {
    mode: "batch",
    actualDir: resolve(actualDir),
    expectedDir: resolve(expectedDir),
    outputDir: resolve(outputDir),
    totalFiles: actualFiles.length,
    passed: results.filter((r) => r.pass === true).length,
    failed: results.filter((r) => r.pass === false).length,
    skipped: results.filter((r) => r.status === "SKIP" || r.status === "MISSING").length,
    overallPass,
    results,
    analysisSummary: {
      fontIssueCount: fontIssues.length,
      layoutShiftCount: layoutIssues.length,
      subPixelDominantCount: subPixelDominant.length,
      filesWithFontIssues: fontIssues.map((r) => r.file),
      filesWithLayoutShifts: layoutIssues.map((r) => r.file),
    },
  };
}

function formatHumanReadable(result) {
  const lines = [];

  if (result.mode === "batch") {
    lines.push("=== Visual Diff Report (Batch) ===");
    lines.push(`Actual:   ${result.actualDir}`);
    lines.push(`Expected: ${result.expectedDir}`);
    lines.push(`Diffs:    ${result.outputDir}`);
    lines.push("");
    lines.push(
      `Total: ${result.totalFiles} | Pass: ${result.passed} | Fail: ${result.failed} | Skip: ${result.skipped}`,
    );
    lines.push(`Overall: ${result.overallPass ? "PASS" : "FAIL"}`);
    lines.push("");

    for (const r of result.results) {
      if (r.status === "SKIP" || r.status === "MISSING") {
        lines.push(`  ${r.status} ${r.file} — ${r.reason}`);
      } else {
        const pct = (r.mismatchPct * 100).toFixed(2);
        lines.push(`  ${r.status} ${r.file} — ${pct}% diff (${r.diffPixels} pixels)`);
        if (r.regions?.failing?.length > 0) {
          lines.push(`       Problem areas: ${r.regions.failing.map((r) => r.name).join(", ")}`);
        }
        if (r.typographyAnalysis?.fontWeightMismatch) {
          lines.push(`       Font: weight mismatch (${r.typographyAnalysis.weightDirection})`);
        }
        if (r.typographyAnalysis?.fontFallbackDetected) {
          lines.push(`       Font: fallback detected`);
        }
        if (r.layoutAnalysis?.layoutShiftDetected) {
          lines.push(
            `       Layout: shift dx=${r.layoutAnalysis.estimatedShift.dx}px dy=${r.layoutAnalysis.estimatedShift.dy}px`,
          );
        }
      }
    }
  } else {
    const pct = (result.mismatchPct * 100).toFixed(2);
    lines.push("=== Visual Diff Report ===");
    lines.push(`Actual:    ${result.actual}`);
    lines.push(`Expected:  ${result.expected}`);
    if (result.diffImage) lines.push(`Diff:      ${result.diffImage}`);
    lines.push("");
    lines.push(`Dimensions:  ${result.dimensions.width}x${result.dimensions.height}`);
    if (result.dimensions.actualSize !== result.dimensions.expectedSize) {
      lines.push(
        `  (actual: ${result.dimensions.actualSize}, expected: ${result.dimensions.expectedSize})`,
      );
    }
    lines.push(`Diff pixels: ${result.diffPixels} / ${result.totalPixels} (${pct}%)`);
    lines.push(`Threshold:   ${(result.threshold * 100).toFixed(2)}%`);
    lines.push(`Status:      ${result.status}`);
    lines.push("");

    if (result.regions.failing.length > 0) {
      lines.push("Problem Regions:");
      for (const r of result.regions.failing) {
        lines.push(`  FAIL  ${r.name} — ${(r.mismatchPct * 100).toFixed(2)}% diff`);
      }
    }
    if (result.regions.warning.length > 0) {
      lines.push("Warning Regions:");
      for (const r of result.regions.warning) {
        lines.push(`  WARN  ${r.name} — ${(r.mismatchPct * 100).toFixed(2)}% diff`);
      }
    }
    if (result.regions.failing.length === 0 && result.regions.warning.length === 0) {
      lines.push("All regions within tolerance.");
    }

    // Sub-pixel analysis
    if (result.subPixelAnalysis) {
      const spa = result.subPixelAnalysis;
      lines.push("");
      lines.push("Sub-Pixel Analysis:");
      lines.push(
        `  Total diff clusters: ${spa.clusterCount} (${spa.subPixelClusters} sub-pixel, ${spa.realClusters} real)`,
      );
      lines.push(`  Sub-pixel artifacts: ${(spa.subPixelPct * 100).toFixed(1)}% of diff pixels`);
      lines.push(`  Real differences:    ${(spa.realDiffPct * 100).toFixed(2)}% of image`);
      if (spa.subPixelPct > 0.5) {
        lines.push("  NOTE: Majority of differences are sub-pixel rendering artifacts");
      }
    }

    // Typography analysis
    if (result.typographyAnalysis) {
      const ta = result.typographyAnalysis;
      lines.push("");
      lines.push("Typography Analysis:");
      if (ta.fontWeightMismatch) {
        lines.push(
          `  WARN  Font weight mismatch detected (expected is ${ta.weightDirection}, delta: ${ta.avgWeightDifference})`,
        );
      }
      if (ta.fontFallbackDetected) {
        lines.push(
          `  WARN  Font fallback likely (character density diff: ${(ta.avgDensityDifference * 100).toFixed(1)}%)`,
        );
      }
      if (ta.textBandCountMismatch) {
        lines.push(
          `  WARN  Text line count differs (actual: ${ta.textBandsActual}, expected: ${ta.textBandsExpected})`,
        );
      }
      if (!ta.fontWeightMismatch && !ta.fontFallbackDetected && !ta.textBandCountMismatch) {
        lines.push("  Typography consistent");
      }
    }

    // Layout analysis
    if (result.layoutAnalysis) {
      const la = result.layoutAnalysis;
      lines.push("");
      lines.push("Layout Analysis:");
      if (la.layoutShiftDetected) {
        lines.push(
          `  WARN  Layout shift detected: dx=${la.estimatedShift.dx}px, dy=${la.estimatedShift.dy}px (magnitude: ${la.shiftMagnitude}px)`,
        );
      } else {
        lines.push("  Layout consistent");
      }
    }
  }

  return lines.join("\n");
}

// --- Main ---
const args = parseArgs(process.argv.slice(2));

if (!args.actual || !args.expected) {
  console.error("Usage:");
  console.error("  node scripts/visual-diff.js <actual.png> <expected.png> [options]");
  console.error("  node scripts/visual-diff.js --batch <actual-dir> <expected-dir> [options]");
  console.error("");
  console.error("Options:");
  console.error("  --output <file>       Output diff image path (single mode)");
  console.error("  --output-dir <dir>    Output directory for diff images (batch mode)");
  console.error(
    "  --threshold <0.02>    Max mismatch ratio to pass (default: from pipeline config)",
  );
  console.error("  --region-grid <4>     Grid divisions for region analysis (default: 4)");
  console.error("  --antialiasing <bool> Ignore antialiasing differences (default: true)");
  console.error("  --json                Output JSON instead of human-readable");
  process.exit(2);
}

try {
  let result;

  if (args.mode === "batch") {
    result = compareBatch(args.actual, args.expected, args);
  } else {
    result = compareSingle(args.actual, args.expected, args);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHumanReadable(result));
  }

  const exitCode = args.mode === "batch" ? (result.overallPass ? 0 : 1) : result.pass ? 0 : 1;
  process.exit(exitCode);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(2);
}
