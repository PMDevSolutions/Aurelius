/**
 * Design-token model produced by the InDesign → tokens mapper.
 *
 * {@link DesignTokens} is the flat, emittable shape (every value a string so it
 * drops straight into `tokens.ts`, CSS custom properties, and a Tailwind theme).
 * {@link TokenMapResult} wraps it with classification metadata, font mappings,
 * and warnings used by the CLI report.
 */
import type { ParseWarning } from "../indesign/warnings.js";

/**
 * The serializable design-token set. Keys are stable, slugified token names;
 * values are CSS-ready strings (`"#145ac8"`, `"32px"`, `"0.01em"`, font stacks).
 */
export interface DesignTokens {
  /** Color palette: token → `#rrggbb`. */
  colors: Record<string, string>;
  /** Font family stacks: token → `"Minion Pro, Georgia, serif"`. */
  fontFamilies: Record<string, string>;
  /** Type scale: token → `"32px"`. */
  fontSizes: Record<string, string>;
  /** Line heights: token → `"37.33px"` or `"normal"`. */
  lineHeights: Record<string, string>;
  /** Letter spacing: token → `"0.01em"`. */
  letterSpacing: Record<string, string>;
  /** Spacing scale: token → `"4px"`. */
  spacing: Record<string, string>;
}

export type TypeRole = "heading" | "body" | "caption";

/** One classified entry of the typography scale. */
export interface TypeStyle {
  /** Token name in {@link DesignTokens.fontSizes}. */
  token: string;
  /** Original InDesign paragraph style name. */
  styleName: string;
  /** Font size in pixels. */
  fontSizePx: number;
  role: TypeRole;
  /** Heading level (1 = largest) when `role` is `"heading"`. */
  level?: number;
}

/** Heading/body clustering of paragraph styles. */
export interface TypographyScale {
  headings: TypeStyle[];
  body: TypeStyle[];
  captions: TypeStyle[];
  /** The size (px) treated as the body baseline. */
  bodySizePx: number;
}

/** How an InDesign font family resolved to a web font stack. */
export interface FontMapping {
  /** InDesign family name. */
  family: string;
  /** Resolved CSS font-family stack. */
  stack: string;
  /** True when the family was found in the font map; false when guessed. */
  mapped: boolean;
}

/** Provenance + configuration echoed back from the mapper. */
export interface TokenMeta {
  dpi: number;
  /** Spacing quantization grid in pixels. */
  grid: number;
  sourceSwatches: number;
  sourceParagraphStyles: number;
  sourceFonts: number;
}

/** Full result of mapping a {@link import("../indesign/ir.js").Document} to tokens. */
export interface TokenMapResult {
  tokens: DesignTokens;
  typography: TypographyScale;
  fonts: FontMapping[];
  warnings: ParseWarning[];
  meta: TokenMeta;
}
