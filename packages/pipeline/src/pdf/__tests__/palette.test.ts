import { describe, expect, it } from "vitest";
import { derivePalette } from "../palette.js";

describe("derivePalette", () => {
  it("ranks colors by frequency and emits IR swatches", () => {
    const swatches = derivePalette(["#ff0000", "#ff0000", "#0000ff"], []);
    expect(swatches[0]!.hex).toBe("#ff0000");
    expect(swatches.map((s) => s.hex)).toContain("#0000ff");
    expect(swatches[0]!.type).toBe("color");
    expect(swatches[0]!.space).toBe("RGB");
    expect(swatches[0]!.colorValue).toEqual([255, 0, 0]);
  });

  it("merges near-duplicate colors within tolerance", () => {
    const swatches = derivePalette(["#ff0000", "#ff0001", "#ff0000"], [], { tolerance: 5 });
    expect(swatches).toHaveLength(1);
    expect(swatches[0]!.hex).toBe("#ff0000");
  });

  it("includes dominant image colors", () => {
    const swatches = derivePalette([], ["#00ff00"]);
    expect(swatches[0]!.hex).toBe("#00ff00");
  });

  it("caps the palette at maxColors", () => {
    const colors = ["#111111", "#222222", "#333333", "#444444"];
    expect(derivePalette(colors, [], { maxColors: 2 })).toHaveLength(2);
  });
});
