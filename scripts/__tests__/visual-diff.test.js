import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import {
  createPNG,
  savePNG,
  solid,
  textBands,
  withSubPixelNoise,
  withShift,
  textBandsFallback,
} from "./generate-fixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "visual-diff.js");
const FIXTURES = join(__dirname, "fixtures");

function runDiff(args) {
  try {
    const result = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result);
  } catch (err) {
    // visual-diff.js exits with code 1 when diff exceeds threshold — parse stdout anyway
    if (err.stdout) {
      return JSON.parse(err.stdout);
    }
    throw err;
  }
}

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
});

describe("visual-diff.js — existing behavior", () => {
  it("identical images produce 0% diff", () => {
    const img = createPNG(100, 100, solid(200, 100, 50));
    const a = savePNG("identical-a.png", img);
    const b = savePNG("identical-b.png", img);
    const result = runDiff([a, b, "--json"]);
    expect(result.mismatchPct).toBe(0);
    expect(result.pass).toBe(true);
  });

  it("completely different images produce high diff", () => {
    const a = savePNG("diff-a.png", createPNG(100, 100, solid(255, 0, 0)));
    const b = savePNG("diff-b.png", createPNG(100, 100, solid(0, 0, 255)));
    const result = runDiff([a, b, "--json"]);
    expect(result.mismatchPct).toBeGreaterThan(0.5);
    expect(result.pass).toBe(false);
  });
});

describe("visual-diff.js — sub-pixel detection", () => {
  it("classifies scattered single-pixel diffs as sub-pixel artifacts", () => {
    const base = solid(200, 200, 200);
    const a = savePNG("subpixel-a.png", createPNG(200, 200, base));
    const b = savePNG("subpixel-b.png", createPNG(200, 200, withSubPixelNoise(base, 0.005)));
    const result = runDiff([a, b, "--json"]);
    expect(result.subPixelAnalysis).toBeDefined();
    expect(result.subPixelAnalysis.subPixelPct).toBeGreaterThan(0.5);
    expect(result.subPixelAnalysis.realDiffPct).toBeLessThan(0.01);
  });

  it("does NOT classify clustered diffs as sub-pixel", () => {
    const base = solid(200, 200, 200);
    const withBlock = (x, y, w, h) => {
      if (x >= 50 && x < 70 && y >= 50 && y < 70) return [255, 0, 0, 255];
      return base(x, y, w, h);
    };
    const a = savePNG("cluster-a.png", createPNG(200, 200, base));
    const b = savePNG("cluster-b.png", createPNG(200, 200, withBlock));
    const result = runDiff([a, b, "--json"]);
    expect(result.subPixelAnalysis.subPixelPct).toBeLessThan(0.1);
  });
});

describe("visual-diff.js — font weight detection", () => {
  it("detects font weight mismatch between 400 and 700", () => {
    const a = savePNG("weight-400.png", createPNG(200, 200, textBands(400)));
    const b = savePNG("weight-700.png", createPNG(200, 200, textBands(700)));
    const result = runDiff([a, b, "--json"]);
    expect(result.typographyAnalysis).toBeDefined();
    expect(result.typographyAnalysis.fontWeightMismatch).toBe(true);
    expect(result.typographyAnalysis.weightDirection).toBe("heavier");
  });

  it("no font weight mismatch for identical text", () => {
    const img = createPNG(200, 200, textBands(400));
    const a = savePNG("weight-same-a.png", img);
    const b = savePNG("weight-same-b.png", img);
    const result = runDiff([a, b, "--json"]);
    expect(result.typographyAnalysis.fontWeightMismatch).toBe(false);
  });
});

describe("visual-diff.js — font fallback detection", () => {
  it("detects font fallback from character width differences", () => {
    const a = savePNG("font-primary.png", createPNG(200, 200, textBands(400)));
    const b = savePNG("font-fallback.png", createPNG(200, 200, textBandsFallback()));
    const result = runDiff([a, b, "--json"]);
    expect(result.typographyAnalysis).toBeDefined();
    expect(result.typographyAnalysis.fontFallbackDetected).toBe(true);
  });
});

describe("visual-diff.js — responsive layout comparison", () => {
  it("detects layout shift when content moves", () => {
    const base = textBands(400);
    const a = savePNG("layout-a.png", createPNG(200, 200, base));
    const b = savePNG("layout-b.png", createPNG(200, 200, withShift(base, 10, 5)));
    const result = runDiff([a, b, "--json"]);
    expect(result.layoutAnalysis).toBeDefined();
    expect(result.layoutAnalysis.layoutShiftDetected).toBe(true);
    expect(result.layoutAnalysis.estimatedShift.dx).toBeGreaterThan(0);
  });

  it("no layout shift for identical images", () => {
    const img = createPNG(200, 200, textBands(400));
    const a = savePNG("layout-same-a.png", img);
    const b = savePNG("layout-same-b.png", img);
    const result = runDiff([a, b, "--json"]);
    expect(result.layoutAnalysis.layoutShiftDetected).toBe(false);
  });

  it("responsive batch mode compares breakpoint pairs", () => {
    mkdirSync(join(FIXTURES, "responsive-actual"), { recursive: true });
    mkdirSync(join(FIXTURES, "responsive-expected"), { recursive: true });

    const base = textBands(400);
    savePNG("responsive-actual/desktop-1440px.png", createPNG(1440, 200, base));
    savePNG("responsive-expected/desktop-1440px.png", createPNG(1440, 200, base));
    savePNG("responsive-actual/mobile-375px.png", createPNG(375, 200, base));
    savePNG("responsive-expected/mobile-375px.png", createPNG(375, 200, withShift(base, 5, 0)));

    const result = runDiff([
      "--batch",
      join(FIXTURES, "responsive-actual"),
      join(FIXTURES, "responsive-expected"),
      "--output-dir",
      join(FIXTURES, "responsive-diffs"),
      "--json",
    ]);
    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(2);
    const desktop = result.results.find((r) => r.file.includes("desktop"));
    expect(desktop.layoutAnalysis).toBeDefined();
  });
});
