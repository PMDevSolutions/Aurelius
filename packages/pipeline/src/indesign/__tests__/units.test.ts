import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  boundsFromPoints,
  compose,
  containsCenter,
  IDENTITY,
  normalizeMatrix,
  parseGeometricBounds,
  parseTransform,
  ptToPx,
  round,
} from "../units.js";

describe("ptToPx", () => {
  it("converts points to pixels at the given DPI", () => {
    expect(ptToPx(72, 96)).toBe(96);
    expect(ptToPx(72, 72)).toBe(72);
    expect(ptToPx(12, 96)).toBe(16);
  });
});

describe("round", () => {
  it("rounds to two places and avoids negative zero", () => {
    expect(round(37.33333)).toBe(37.33);
    expect(round(-0.0001)).toBe(0);
    expect(round(1.236, 2)).toBe(1.24);
  });

  it("returns 0 for non-finite input", () => {
    expect(round(Number.NaN)).toBe(0);
    expect(round(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parseTransform", () => {
  it("parses six-component transforms", () => {
    expect(parseTransform("1 0 0 1 72 144")).toEqual([1, 0, 0, 1, 72, 144]);
  });

  it("falls back to identity on malformed input", () => {
    expect(parseTransform(undefined)).toEqual(IDENTITY);
    expect(parseTransform("1 2 3")).toEqual(IDENTITY);
    expect(parseTransform("a b c d e f")).toEqual(IDENTITY);
  });
});

describe("applyMatrix and compose", () => {
  it("applies translation and scale", () => {
    expect(applyMatrix([1, 0, 0, 1, 10, 20], 5, 5)).toEqual({ x: 15, y: 25 });
    expect(applyMatrix([2, 0, 0, 3, 0, 0], 5, 5)).toEqual({ x: 10, y: 15 });
  });

  it("composes parent ∘ child so child is applied first", () => {
    const parent = [1, 0, 0, 1, 100, 0] as const;
    const child = [1, 0, 0, 1, 0, 50] as const;
    const combined = compose([...parent], [...child]);
    // A local origin maps through child (0,50) then parent (+100 x) → (100,50).
    expect(applyMatrix(combined, 0, 0)).toEqual({ x: 100, y: 50 });
  });

  it("composes scale and translation correctly", () => {
    const combined = compose([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 10, 10]);
    expect(applyMatrix(combined, 0, 0)).toEqual({ x: 20, y: 20 });
  });
});

describe("boundsFromPoints", () => {
  it("computes an axis-aligned bounding box", () => {
    expect(
      boundsFromPoints([
        { x: 10, y: 5 },
        { x: 30, y: 5 },
        { x: 30, y: 25 },
        { x: 10, y: 25 },
      ]),
    ).toEqual({ x: 10, y: 5, width: 20, height: 20 });
  });

  it("returns undefined for an empty set", () => {
    expect(boundsFromPoints([])).toBeUndefined();
  });
});

describe("parseGeometricBounds", () => {
  it("parses top-left-bottom-right into a rect", () => {
    expect(parseGeometricBounds("0 0 792 612")).toEqual({ x: 0, y: 0, width: 612, height: 792 });
    expect(parseGeometricBounds("-10 -20 10 20")).toEqual({
      x: -20,
      y: -10,
      width: 40,
      height: 20,
    });
  });

  it("returns undefined for malformed bounds", () => {
    expect(parseGeometricBounds("0 0 792")).toBeUndefined();
    expect(parseGeometricBounds(undefined)).toBeUndefined();
  });
});

describe("normalizeMatrix", () => {
  it("converts translation to pixels and preserves scale", () => {
    expect(normalizeMatrix([1, 0, 0, 1, 72, 36], 96)).toEqual([1, 0, 0, 1, 96, 48]);
  });
});

describe("containsCenter", () => {
  const page = { x: 0, y: 0, width: 100, height: 100 };
  it("detects a frame whose center is inside the page", () => {
    expect(containsCenter(page, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
  });
  it("rejects a frame whose center is outside the page", () => {
    expect(containsCenter(page, { x: 200, y: 200, width: 20, height: 20 })).toBe(false);
  });
});
