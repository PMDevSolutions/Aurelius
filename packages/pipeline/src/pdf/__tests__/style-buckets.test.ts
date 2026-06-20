import { describe, expect, it } from "vitest";
import { buildStyleBuckets } from "../style-buckets.js";
import type { ClusterLine, TextBlock } from "../text-cluster.js";

function line(size: number): ClusterLine {
  return { runs: [], baseline: 0, x0: 0, x1: 0, size, text: "" };
}

function block(size: number, lineCount: number, fontFamily?: string): TextBlock {
  const b: TextBlock = {
    lines: Array.from({ length: lineCount }, () => line(size)),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    size,
    columnIndex: 0,
    text: "",
  };
  if (fontFamily) b.fontFamily = fontFamily;
  return b;
}

describe("buildStyleBuckets", () => {
  it("classifies sizes into heading/body/caption with the most line-heavy size as body", () => {
    const { paragraphStyles, bodySizePt } = buildStyleBuckets(
      [block(28, 1, "Helvetica"), block(11, 10, "Helvetica"), block(8, 1)],
      96,
    );
    expect(bodySizePt).toBe(11);
    const names = paragraphStyles.map((s) => s.name);
    expect(names).toEqual(["Heading", "Body", "Caption"]);

    const heading = paragraphStyles.find((s) => s.name === "Heading");
    expect(heading?.properties.pointSize).toBeCloseTo((28 * 96) / 72, 1); // ~37.33px
    expect(heading?.properties.fontFamily).toBe("Helvetica");
  });

  it("numbers multiple heading levels largest-first", () => {
    const { paragraphStyles } = buildStyleBuckets([block(48, 1), block(32, 1), block(12, 10)], 96);
    expect(paragraphStyles.map((s) => s.name)).toEqual(["Heading 1", "Heading 2", "Body"]);
  });

  it("returns an empty result when no block carries a size", () => {
    expect(buildStyleBuckets([], 96).paragraphStyles).toHaveLength(0);
  });
});
