import { describe, expect, it } from "vitest";
import { buildSampleIdml } from "../../indesign/__tests__/idml-fixtures.js";
import type { Document, Style, StyleProperties, Swatch } from "../../indesign/ir.js";
import { parseIdml } from "../../indesign/parser.js";
import { WarningCollector } from "../../indesign/warnings.js";
import {
  buildColorPalette,
  buildFontFamilies,
  clusterTypography,
  deriveSpacing,
  mapDocumentToTokens,
  MapWarningCode,
  slug,
} from "../mapper.js";

function makeStyle(name: string, properties: Partial<StyleProperties> = {}): Style {
  return {
    id: `ParagraphStyle/${name}`,
    name,
    kind: "paragraph",
    properties: { raw: {}, ...properties },
  };
}

function makeSwatch(name: string, hex: string, extra: Partial<Swatch> = {}): Swatch {
  return { id: `Color/${name}`, name, type: "color", hex, ...extra };
}

function tokenMap(styles: Style[]): Map<string, string> {
  return new Map(styles.map((s) => [s.id, slug(s.name)]));
}

describe("clusterTypography", () => {
  it("clusters paragraph styles into heading/body/caption preserving names", () => {
    const styles = [
      makeStyle("H1", { pointSize: 48 }),
      makeStyle("H2", { pointSize: 36 }),
      makeStyle("H3", { pointSize: 28 }),
      makeStyle("Body", { pointSize: 16 }),
      makeStyle("Caption", { pointSize: 11 }),
    ];
    const scale = clusterTypography(styles, tokenMap(styles));

    expect(scale.bodySizePx).toBe(16);
    expect(scale.headings.map((h) => h.styleName)).toEqual(["H1", "H2", "H3"]);
    expect(scale.headings.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(scale.body.map((b) => b.styleName)).toEqual(["Body"]);
    expect(scale.captions.map((c) => c.styleName)).toEqual(["Caption"]);
  });

  it("returns an empty scale when no styles carry a size", () => {
    const styles = [makeStyle("Unsized")];
    expect(clusterTypography(styles, tokenMap(styles))).toEqual({
      headings: [],
      body: [],
      captions: [],
      bodySizePx: 0,
    });
  });
});

describe("deriveSpacing", () => {
  it("quantizes paragraph spacing/indents to a 4px grid and names the scale", () => {
    const styles = [
      makeStyle("A", { raw: { SpaceBefore: "6", SpaceAfter: "12" } }), // 8px, 16px
      makeStyle("B", { raw: { LeftIndent: "18" } }), // 24px
    ];
    expect(deriveSpacing(styles, 4, 96)).toEqual({ xs: "8px", sm: "16px", md: "24px" });
  });

  it("honors a custom grid", () => {
    const styles = [makeStyle("A", { raw: { SpaceBefore: "10" } })]; // 13.33px → 16px on an 8px grid
    expect(deriveSpacing(styles, 8, 96)).toEqual({ xs: "16px" });
  });
});

describe("buildColorPalette", () => {
  it("keeps distinct swatches at tolerance 0", () => {
    const collector = new WarningCollector();
    const palette = buildColorPalette(
      [
        makeSwatch("Red", "#ff0000"),
        makeSwatch("Crimson", "#ff0001"),
        makeSwatch("Blue", "#0000ff"),
      ],
      0,
      collector,
    );
    expect(Object.keys(palette)).toEqual(["red", "crimson", "blue"]);
  });

  it("dedupes near-identical swatches within tolerance and warns", () => {
    const collector = new WarningCollector();
    const palette = buildColorPalette(
      [makeSwatch("Red", "#ff0000"), makeSwatch("Crimson", "#ff0001")],
      2,
      collector,
    );
    expect(Object.keys(palette)).toEqual(["red"]);
    expect(collector.all().some((w) => w.code === MapWarningCode.DUPLICATE_COLOR)).toBe(true);
  });

  it("warns when a Lab swatch is out of the sRGB gamut", () => {
    const collector = new WarningCollector();
    buildColorPalette(
      [makeSwatch("Neon", "#00ffaa", { space: "LAB", colorValue: [50, 127, 127] })],
      0,
      collector,
    );
    expect(collector.all().some((w) => w.code === MapWarningCode.OUT_OF_GAMUT)).toBe(true);
  });
});

describe("buildFontFamilies", () => {
  it("warns and falls back for unmapped families", () => {
    const collector = new WarningCollector();
    const document = {
      fonts: [{ family: "Comic Unknown", name: "Comic Unknown" }],
      paragraphStyles: [],
    } as unknown as Document;
    const { fontFamilies, mappings } = buildFontFamilies(document, {}, collector);

    expect(mappings.some((m) => !m.mapped)).toBe(true);
    expect(Object.keys(fontFamilies)).toContain("comic-unknown");
    expect(collector.all().some((w) => w.code === MapWarningCode.FONT_FALLBACK)).toBe(true);
  });
});

describe("mapDocumentToTokens (end-to-end from a sample IDML)", () => {
  const { document } = parseIdml(buildSampleIdml());
  const result = mapDocumentToTokens(document);

  it("builds a color palette from swatches with computed hex", () => {
    expect(result.tokens.colors).toMatchObject({
      black: "#000000",
      "brand-blue": "#145ac8",
      paper: "#ffffff",
    });
  });

  it("derives a typography scale from paragraph styles", () => {
    expect(result.tokens.fontSizes).toEqual({ heading: "32px", body: "16px" });
    expect(result.typography.headings[0]?.styleName).toBe("Heading");
    expect(result.typography.headings[0]?.level).toBe(1);
    expect(result.typography.bodySizePx).toBe(16);
  });

  it("emits line heights and letter spacing aligned to the same token names", () => {
    expect(result.tokens.lineHeights).toMatchObject({ heading: "37.33px", body: "normal" });
    expect(result.tokens.letterSpacing).toEqual({ heading: "0.01em" });
  });

  it("resolves fonts to web stacks without fallbacks for known families", () => {
    expect(result.tokens.fontFamilies["minion-pro"]?.startsWith('"Minion Pro"')).toBe(true);
    expect(result.tokens.fontFamilies["helvetica"]).toContain("sans-serif");
    expect(result.fonts.every((f) => f.mapped)).toBe(true);
    expect(result.warnings.some((w) => w.code === MapWarningCode.FONT_FALLBACK)).toBe(false);
  });

  it("reports provenance metadata", () => {
    expect(result.meta.sourceSwatches).toBe(document.swatches.length);
    expect(result.meta.grid).toBe(4);
    expect(result.meta.dpi).toBe(96);
  });
});
