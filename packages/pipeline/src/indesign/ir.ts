/**
 * Intermediate representation (IR) for parsed InDesign IDML packages.
 *
 * These are the canonical, framework-agnostic types that downstream pipeline
 * stages (the style/token mapper and the React component generator) consume.
 * Every geometric value is expressed in **pixels**, normalized from the points
 * native to IDML at a configurable DPI (default 96) — see {@link DocumentMeta.dpi}.
 *
 * The runtime zod schema in `./schema.ts` mirrors these types exactly; a
 * compile-time assertion there keeps the two in lockstep.
 */
import type { ParseWarning } from "./warnings.js";

/** An axis-aligned rectangle in pixels. `x`/`y` are the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A 2D affine transform in IDML's `ItemTransform` component order
 * `[a, b, c, d, tx, ty]`, mapping a local point `(x, y)` to its parent space via
 * `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`. Translation components are
 * normalized to pixels; the scale/shear components are unitless.
 */
export type Matrix = [number, number, number, number, number, number];

/** An sRGB color with 8-bit channels. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Top-level facts about the parsed document. */
export interface DocumentMeta {
  /** IDML DOM version from `designmap.xml` (`@DOMVersion`), when present. */
  idmlVersion?: string;
  /** Dots per inch used to convert IDML points to pixels. */
  dpi: number;
  /** Whether the package `mimetype` entry matched the IDML media type. */
  mimetypeValid: boolean;
  /** Absolute path the package was read from, when parsed from a file. */
  sourcePath?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * Resources: swatches, fonts, styles
 * ──────────────────────────────────────────────────────────────────────── */

export type SwatchType = "color" | "tint" | "gradient" | "mixedInk" | "unknown";

/** A color, tint, or gradient enumerated from `Resources/Graphic.xml`. */
export interface Swatch {
  /** `Self` identifier, e.g. `"Color/Black"`. */
  id: string;
  name: string;
  type: SwatchType;
  /** Color model: `Process`, `Spot`, `Registration`, … */
  model?: string;
  /** Color space: `CMYK`, `RGB`, `LAB`, … */
  space?: string;
  /** Raw numeric components exactly as authored in `ColorValue`. */
  colorValue?: number[];
  /** Six-digit `#rrggbb` hex, computed when the space is convertible. */
  hex?: string;
  /** Resolved sRGB triple, computed alongside {@link Swatch.hex}. */
  rgb?: RGB;
}

/** A font enumerated from `Resources/Fonts.xml`. */
export interface Font {
  /** `Self` identifier, when present. */
  id?: string;
  family: string;
  /** Full font name, e.g. `"Minion Pro Regular"`. */
  name: string;
  /** Style/weight name, e.g. `"Regular"`, `"Bold Italic"`. */
  styleName?: string;
  postScriptName?: string;
  /** Availability status reported by InDesign, e.g. `"Installed"`. */
  status?: string;
}

export type StyleKind = "paragraph" | "character";

/** A normalized, frequently-used subset of style attributes plus raw passthrough. */
export interface StyleProperties {
  fontFamily?: string;
  fontStyle?: string;
  /** Type size in pixels. */
  pointSize?: number;
  /** Leading in pixels, or the literal `"auto"`. */
  leading?: number | "auto";
  tracking?: number;
  /** Swatch id reference for the fill. */
  fillColor?: string;
  /** Swatch id reference for the stroke. */
  strokeColor?: string;
  /** Paragraph justification, e.g. `"LeftAlign"`. */
  alignment?: string;
  /** Every attribute from the source element, verbatim, for the mapper. */
  raw: Record<string, string>;
}

/** A paragraph or character style from `Resources/Styles.xml`. */
export interface Style {
  /** `Self` identifier, e.g. `"ParagraphStyle/Heading"`. */
  id: string;
  name: string;
  kind: StyleKind;
  /** Slash-delimited group path when the style is nested in style groups. */
  group?: string;
  /** `BasedOn` style reference. */
  basedOn?: string;
  properties: StyleProperties;
}

/* ────────────────────────────────────────────────────────────────────────
 * Stories: text content
 * ──────────────────────────────────────────────────────────────────────── */

/** A run of text sharing a single applied character style. */
export interface TextRun {
  text: string;
  /** `AppliedCharacterStyle` reference. */
  appliedCharacterStyle: string;
  /** Local character-level attribute overrides, verbatim. */
  overrides: Record<string, string>;
}

/** A paragraph sharing a single applied paragraph style. */
export interface Paragraph {
  /** `AppliedParagraphStyle` reference. */
  appliedParagraphStyle: string;
  /** Local paragraph-level attribute overrides, verbatim. */
  overrides: Record<string, string>;
  runs: TextRun[];
  /** Concatenated text of all runs in this paragraph. */
  text: string;
}

/** A story from `Stories/Story_*.xml`. */
export interface Story {
  /** `Self` identifier. */
  id: string;
  paragraphs: Paragraph[];
  /** All paragraphs joined with newlines. */
  plainText: string;
  /** Distinct style references used anywhere in the story. */
  appliedStyles: { paragraph: string[]; character: string[] };
}

/* ────────────────────────────────────────────────────────────────────────
 * Layout: spreads, pages, frames
 * ──────────────────────────────────────────────────────────────────────── */

export type FrameType = "text" | "image" | "graphic" | "group" | "unknown";

/** Properties shared by every page item. Bounds are in spread space, pixels. */
export interface FrameBase {
  /** `Self` identifier. */
  id: string;
  type: FrameType;
  name?: string;
  /** Resolved containing page id, when the frame sits on a page. */
  pageId?: string;
  /** Axis-aligned bounding box in spread coordinates, pixels. */
  bounds: Rect;
  /** The item's own `ItemTransform` (translation normalized to pixels). */
  transform: Matrix;
  visible: boolean;
  /** Swatch id reference for the fill. */
  fillColor?: string;
  /** Swatch id reference for the stroke. */
  strokeColor?: string;
}

/** A text frame, linked to a story via {@link TextFrame.storyId}. */
export interface TextFrame extends FrameBase {
  type: "text";
  /** Resolved `ParentStory`. Present even when unresolved (a warning is emitted). */
  storyId?: string;
  /** `NextTextFrame` in the threading chain, when threaded. */
  nextFrameId?: string;
  /** `PreviousTextFrame` in the threading chain, when threaded. */
  previousFrameId?: string;
}

export type ImageKind = "image" | "eps" | "pdf" | "unknown";

/** A placed graphic inside an {@link ImageFrame}. */
export interface ImageRef {
  kind: ImageKind;
  /** True when pixel data is embedded in the IDML rather than externally linked. */
  embedded: boolean;
  /** Original `LinkResourceURI`. */
  linkUri?: string;
  /** Package-relative path when the link resolves to a bundled asset. */
  resolvedPath?: string;
  /** Effective resolution reported by InDesign, when present. */
  actualPpi?: number;
  /** The graphic's own `ItemTransform` (translation normalized to pixels). */
  itemTransform?: Matrix;
}

/** A frame whose content is a placed image, EPS, or PDF. */
export interface ImageFrame extends FrameBase {
  type: "image";
  image: ImageRef;
}

/** A geometric frame (rectangle, oval, polygon, line) with no placed content. */
export interface GraphicFrame extends FrameBase {
  type: "graphic";
}

/** A group of nested page items. */
export interface GroupFrame extends FrameBase {
  type: "group";
  children: Frame[];
}

export type Frame = TextFrame | ImageFrame | GraphicFrame | GroupFrame;

/** A page within a spread or master spread. */
export interface Page {
  /** `Self` identifier. */
  id: string;
  /** Page name/number, e.g. `"1"`. */
  name?: string;
  /** Page rectangle in spread coordinates, pixels. */
  bounds: Rect;
  /** Raw `GeometricBounds` rectangle in pixels (pre-transform). */
  geometricBounds: Rect;
  /** The page's own `ItemTransform` (translation normalized to pixels). */
  transform: Matrix;
}

/** A spread from `Spreads/Spread_*.xml`. */
export interface Spread {
  /** `Self` identifier. */
  id: string;
  pages: Page[];
  frames: Frame[];
  /** The spread's own `ItemTransform` (translation normalized to pixels). */
  transform: Matrix;
}

/** A master spread from `MasterSpreads/MasterSpread_*.xml`. */
export interface MasterSpread {
  /** `Self` identifier. */
  id: string;
  /** Master name, e.g. `"A-Master"`. */
  name?: string;
  /** Master name prefix, e.g. `"A"`. */
  namePrefix?: string;
  pages: Page[];
  frames: Frame[];
  /** The master spread's own `ItemTransform` (translation normalized to pixels). */
  transform: Matrix;
}

/** A binary asset bundled inside the IDML package (typically under `Links/`). */
export interface Asset {
  /** Package-relative path. */
  path: string;
  /** Size in bytes. */
  bytes: number;
}

/** The complete intermediate representation of a parsed IDML package. */
export interface Document {
  meta: DocumentMeta;
  spreads: Spread[];
  masterSpreads: MasterSpread[];
  stories: Story[];
  swatches: Swatch[];
  fonts: Font[];
  paragraphStyles: Style[];
  characterStyles: Style[];
  /** Bundled binary assets discovered in the package. */
  assets: Asset[];
  /** Non-fatal issues collected during parsing. */
  warnings: ParseWarning[];
}
