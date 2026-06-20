/**
 * Map an InDesign {@link Document} IR to Aurelius {@link DesignTokens}.
 *
 * - Colors: swatch hex de-duplicated within a configurable tolerance; CMYK/Lab
 *   colors outside the sRGB gamut are warned about.
 * - Typography: paragraph styles clustered into heading / body / caption roles,
 *   preserving InDesign names; sizes, line heights, and letter spacing emitted
 *   under aligned token keys.
 * - Spacing: paragraph spacing and indents quantized to a grid (default 4px).
 * - Fonts: families resolved to web font stacks via the font map, with fallback
 *   warnings for unmapped families.
 *
 * The pure sub-functions are exported for focused unit testing.
 */
import { convertColor } from "../indesign/colors.js";
import type { Document, Style, Swatch } from "../indesign/ir.js";
import { ptToPx } from "../indesign/units.js";
import { WarningCollector } from "../indesign/warnings.js";
import { resolveFontStack, type FontMapOverrides } from "./font-map.js";
import type {
  DesignTokens,
  FontMapping,
  TokenMapResult,
  TypeStyle,
  TypographyScale,
} from "./model.js";

export interface MapOptions {
  /** DPI for point→pixel conversion of raw spacing attributes. */
  dpi?: number;
  /** Spacing quantization grid in pixels (default 4). */
  grid?: number;
  /** Per-call font fallback overrides merged over `config/font-map.json`. */
  fontMap?: FontMapOverrides;
  /** sRGB distance under which two swatches are treated as the same color. */
  colorTolerance?: number;
}

export const MapWarningCode = {
  FONT_FALLBACK: "FONT_FALLBACK",
  OUT_OF_GAMUT: "OUT_OF_GAMUT",
  DUPLICATE_COLOR: "DUPLICATE_COLOR",
  EMPTY_TYPOGRAPHY: "EMPTY_TYPOGRAPHY",
} as const;

const SPACING_ATTRS = ["SpaceBefore", "SpaceAfter", "LeftIndent", "RightIndent", "FirstLineIndent"];
const SCALE_NAMES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl"];

/** Map a document IR to design tokens plus classification metadata + warnings. */
export function mapDocumentToTokens(document: Document, options: MapOptions = {}): TokenMapResult {
  const collector = new WarningCollector();
  const dpi = options.dpi ?? document.meta.dpi ?? 96;
  const grid = options.grid ?? 4;
  const tolerance = options.colorTolerance ?? 0;

  // One token name per paragraph style, shared across size/line-height/spacing.
  const used = new Set<string>();
  const styleToken = new Map<string, string>();
  for (const style of document.paragraphStyles) {
    styleToken.set(style.id, uniqueKey(slug(style.name), used));
  }

  const colors = buildColorPalette(document.swatches, tolerance, collector);
  const typography = clusterTypography(document.paragraphStyles, styleToken);
  if (typography.headings.length === 0 && typography.body.length === 0) {
    collector.info(MapWarningCode.EMPTY_TYPOGRAPHY, "No sized paragraph styles found");
  }
  const fontSizes = buildFontSizes(typography);
  const lineHeights = buildLineHeights(document.paragraphStyles, styleToken);
  const letterSpacing = buildLetterSpacing(document.paragraphStyles, styleToken);
  const spacing = deriveSpacing(document.paragraphStyles, grid, dpi);
  const { fontFamilies, mappings } = buildFontFamilies(document, options.fontMap ?? {}, collector);

  const tokens: DesignTokens = {
    colors,
    fontFamilies,
    fontSizes,
    lineHeights,
    letterSpacing,
    spacing,
  };

  return {
    tokens,
    typography,
    fonts: mappings,
    warnings: collector.all(),
    meta: {
      dpi,
      grid,
      sourceSwatches: document.swatches.length,
      sourceParagraphStyles: document.paragraphStyles.length,
      sourceFonts: document.fonts.length,
    },
  };
}

/* ── Colors ──────────────────────────────────────────────────────────────── */

export function buildColorPalette(
  swatches: Swatch[],
  tolerance: number,
  collector: WarningCollector,
): Record<string, string> {
  const colors: Record<string, string> = {};
  const used = new Set<string>();
  const accepted: string[] = [];

  for (const swatch of swatches) {
    if (!swatch.hex) continue;
    if (swatch.space && swatch.colorValue) {
      const converted = convertColor(swatch.space, swatch.colorValue);
      if (converted && !converted.inGamut) {
        collector.warn(
          MapWarningCode.OUT_OF_GAMUT,
          `Swatch "${swatch.name}" (${swatch.space}) is outside the sRGB gamut; clamped to ${swatch.hex}`,
        );
      }
    }
    const duplicate = accepted.find((hex) => colorDistance(hex, swatch.hex!) <= tolerance);
    if (duplicate) {
      collector.info(
        MapWarningCode.DUPLICATE_COLOR,
        `Swatch "${swatch.name}" (${swatch.hex}) duplicates ${duplicate}; skipped`,
      );
      continue;
    }
    colors[uniqueKey(slug(swatch.name), used)] = swatch.hex;
    accepted.push(swatch.hex);
  }
  return colors;
}

/* ── Typography ──────────────────────────────────────────────────────────── */

export function clusterTypography(
  styles: Style[],
  styleToken: Map<string, string>,
): TypographyScale {
  const sized = styles.filter((s) => typeof s.properties.pointSize === "number");
  if (sized.length === 0) {
    return { headings: [], body: [], captions: [], bodySizePx: 0 };
  }
  const bodySizePx = pickBodySize(sized);
  const headings: TypeStyle[] = [];
  const body: TypeStyle[] = [];
  const captions: TypeStyle[] = [];

  for (const style of sized) {
    const size = style.properties.pointSize!;
    const token = styleToken.get(style.id) ?? slug(style.name);
    const entry: TypeStyle = { token, styleName: style.name, fontSizePx: size, role: "body" };
    if (size > bodySizePx * 1.05) {
      entry.role = "heading";
      headings.push(entry);
    } else if (size < bodySizePx * 0.95) {
      entry.role = "caption";
      captions.push(entry);
    } else {
      body.push(entry);
    }
  }
  headings.sort((a, b) => b.fontSizePx - a.fontSizePx).forEach((h, i) => (h.level = i + 1));
  return { headings, body, captions, bodySizePx };
}

function pickBodySize(styles: Style[]): number {
  const bodyLike = styles.find(
    (s) =>
      /\b(body|normal|text|paragraph|default|regular)\b/i.test(s.name) &&
      !/no paragraph/i.test(s.name),
  );
  if (typeof bodyLike?.properties.pointSize === "number") return bodyLike.properties.pointSize;

  const counts = new Map<number, number>();
  for (const style of styles) {
    const size = style.properties.pointSize!;
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  let best = styles[0]!.properties.pointSize!;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size < best)) {
      best = size;
      bestCount = count;
    }
  }
  return best;
}

function buildFontSizes(typography: TypographyScale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of [...typography.headings, ...typography.body, ...typography.captions]) {
    out[entry.token] = pxStr(entry.fontSizePx);
  }
  return out;
}

function buildLineHeights(
  styles: Style[],
  styleToken: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const style of styles) {
    const leading = style.properties.leading;
    if (leading === undefined) continue;
    const token = styleToken.get(style.id);
    if (!token) continue;
    out[token] = leading === "auto" ? "normal" : pxStr(leading);
  }
  return out;
}

function buildLetterSpacing(
  styles: Style[],
  styleToken: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const style of styles) {
    const tracking = style.properties.tracking;
    if (tracking === undefined || tracking === 0) continue;
    const token = styleToken.get(style.id);
    if (!token) continue;
    out[token] = `${trimNum(tracking / 1000)}em`;
  }
  return out;
}

/* ── Spacing ─────────────────────────────────────────────────────────────── */

export function deriveSpacing(styles: Style[], grid: number, dpi: number): Record<string, string> {
  const values = new Set<number>();
  for (const style of styles) {
    for (const attr of SPACING_ATTRS) {
      const raw = style.properties.raw[attr];
      if (raw === undefined) continue;
      const points = Number(raw);
      if (!Number.isFinite(points) || points <= 0) continue;
      const px = ptToPx(points, dpi);
      values.add(Math.max(grid, Math.round(px / grid) * grid));
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  const out: Record<string, string> = {};
  sorted.forEach((value, index) => {
    out[scaleName(index)] = `${value}px`;
  });
  return out;
}

/* ── Fonts ───────────────────────────────────────────────────────────────── */

export function buildFontFamilies(
  document: Document,
  overrides: FontMapOverrides,
  collector: WarningCollector,
): { fontFamilies: Record<string, string>; mappings: FontMapping[] } {
  const families = new Set<string>();
  for (const font of document.fonts) if (font.family) families.add(font.family);
  for (const style of document.paragraphStyles) {
    if (style.properties.fontFamily) families.add(style.properties.fontFamily);
  }

  const fontFamilies: Record<string, string> = {};
  const mappings: FontMapping[] = [];
  const used = new Set<string>();

  for (const family of [...families].sort()) {
    const { stack, mapped } = resolveFontStack(family, overrides);
    fontFamilies[uniqueKey(slug(family), used)] = stack;
    mappings.push({ family, stack, mapped });
    if (!mapped) {
      collector.warn(
        MapWarningCode.FONT_FALLBACK,
        `Font "${family}" is not in the font map; using generic fallback "${stack}"`,
      );
    }
  }
  return { fontFamilies, mappings };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "token"
  );
}

function uniqueKey(base: string, used: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) candidate = `${base}-${n++}`;
  used.add(candidate);
  return candidate;
}

function scaleName(index: number): string {
  return SCALE_NAMES[index] ?? `s${index + 1}`;
}

function pxStr(value: number): string {
  return `${trimNum(value)}px`;
}

function trimNum(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.sqrt((x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2);
}
