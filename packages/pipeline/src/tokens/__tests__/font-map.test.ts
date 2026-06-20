import { describe, expect, it } from "vitest";
import { formatFontStack, loadDefaultFontMap, resolveFontStack } from "../font-map.js";

describe("loadDefaultFontMap", () => {
  it("loads the committed config/font-map.json", () => {
    const map = loadDefaultFontMap();
    expect(Object.keys(map).length).toBeGreaterThan(5);
    expect(map["Minion Pro"]).toContain("serif");
  });
});

describe("formatFontStack", () => {
  it("quotes multi-word families but not generics", () => {
    expect(formatFontStack(["Minion Pro", "Georgia", "serif"])).toBe(
      '"Minion Pro", Georgia, serif',
    );
  });
});

describe("resolveFontStack", () => {
  it("maps a known family from the default map", () => {
    const resolved = resolveFontStack("Minion Pro");
    expect(resolved.mapped).toBe(true);
    expect(resolved.stack.startsWith('"Minion Pro"')).toBe(true);
    expect(resolved.stack).toContain("serif");
  });

  it("matches case-insensitively", () => {
    expect(resolveFontStack("helvetica").mapped).toBe(true);
  });

  it("falls back to a generic stack for unmapped families and flags them", () => {
    const resolved = resolveFontStack("Totally Made Up Sans");
    expect(resolved.mapped).toBe(false);
    expect(resolved.stack).toContain('"Totally Made Up Sans"');
    expect(resolved.stack).toContain("sans-serif");
  });

  it("infers serif from the family name", () => {
    expect(resolveFontStack("Imaginary Roman").stack).toContain("serif");
  });

  it("infers monospace from the family name", () => {
    expect(resolveFontStack("Hacker Mono").stack).toContain("monospace");
  });

  it("honors overrides, accepting a comma-delimited string", () => {
    const resolved = resolveFontStack("Brand Sans", {
      "Brand Sans": "Brand Sans, Inter, sans-serif",
    });
    expect(resolved.mapped).toBe(true);
    expect(resolved.stack).toBe('"Brand Sans", Inter, sans-serif');
  });
});
