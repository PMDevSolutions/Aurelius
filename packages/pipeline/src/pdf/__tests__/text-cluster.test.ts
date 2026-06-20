import { describe, expect, it } from "vitest";
import type { RawTextRun } from "../pdf-document.js";
import { clusterTextRuns } from "../text-cluster.js";

function run(text: string, x: number, baseline: number, width: number, height: number): RawTextRun {
  return { text, x, baseline, width, height, fontName: "f1" };
}

describe("clusterTextRuns", () => {
  it("returns an empty result for no runs", () => {
    expect(clusterTextRuns([])).toEqual({ blocks: [], columnCount: 0 });
  });

  it("splits a single column into blocks at a font-size change", () => {
    const { blocks, columnCount } = clusterTextRuns([
      run("Heading", 72, 700, 200, 28),
      run("Body line one", 72, 660, 150, 11),
      run("Body line two", 72, 644, 150, 11),
    ]);
    expect(columnCount).toBe(1);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.text).toContain("Heading");
    expect(blocks[1]!.lines).toHaveLength(2);
  });

  it("separates same-baseline runs with a large gap into two columns", () => {
    const { blocks, columnCount } = clusterTextRuns([
      run("L1", 72, 660, 100, 10),
      run("R1", 360, 660, 100, 10),
      run("L2", 72, 646, 100, 10),
      run("R2", 360, 646, 100, 10),
    ]);
    expect(columnCount).toBe(2);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.lines.length === 2)).toBe(true);
  });
});
