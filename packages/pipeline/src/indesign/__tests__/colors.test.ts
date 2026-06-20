import { describe, expect, it } from "vitest";
import { cmykToRgb, convertColor, grayToRgb, rgbToHex } from "../colors.js";

describe("cmykToRgb", () => {
  it("converts known CMYK values to sRGB hex (naive device conversion)", () => {
    expect(rgbToHex(cmykToRgb(0, 0, 0, 100))).toBe("#000000"); // black
    expect(rgbToHex(cmykToRgb(0, 0, 0, 0))).toBe("#ffffff"); // white
    expect(rgbToHex(cmykToRgb(0, 100, 100, 0))).toBe("#ff0000"); // red
    expect(rgbToHex(cmykToRgb(100, 0, 100, 0))).toBe("#00ff00"); // green
    expect(rgbToHex(cmykToRgb(100, 100, 0, 0))).toBe("#0000ff"); // blue
    expect(rgbToHex(cmykToRgb(0, 0, 0, 50))).toBe("#808080"); // 50% black
  });
});

describe("grayToRgb", () => {
  it("maps 0 to white and 100 to black", () => {
    expect(rgbToHex(grayToRgb(0))).toBe("#ffffff");
    expect(rgbToHex(grayToRgb(100))).toBe("#000000");
  });
});

describe("convertColor (gamut detection)", () => {
  it("treats CMYK and in-range RGB as in gamut", () => {
    expect(convertColor("CMYK", [0, 0, 0, 100])?.inGamut).toBe(true);
    expect(convertColor("RGB", [20, 90, 200])?.inGamut).toBe(true);
  });

  it("flags an RGB value outside 0-255 as out of gamut", () => {
    expect(convertColor("RGB", [300, 0, 0])?.inGamut).toBe(false);
  });

  it("treats a neutral Lab gray as in gamut", () => {
    expect(convertColor("LAB", [50, 0, 0])?.inGamut).toBe(true);
  });

  it("flags a maximally saturated Lab color as out of gamut", () => {
    const converted = convertColor("LAB", [50, 127, 127]);
    expect(converted).toBeDefined();
    expect(converted!.inGamut).toBe(false);
    // Still returns a clamped, valid hex.
    expect(converted!.rgb).toBeDefined();
  });

  it("returns undefined for unknown spaces", () => {
    expect(convertColor("HSB", [1, 2, 3])).toBeUndefined();
    expect(convertColor(undefined, [1])).toBeUndefined();
  });
});
