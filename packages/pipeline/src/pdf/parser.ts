/**
 * Top-level PDF parser.
 *
 * Produces the same {@link Document} IR as the IDML parser, so the token mapper
 * and component generator are source-agnostic. Per page it clusters text into
 * frames, synthesizes paragraph styles from font sizes, derives a swatch palette
 * from fills and image colors, and (when an asset directory is given) extracts
 * embedded images to PNG. Fidelity warnings record what was inferred vs. read.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IdmlParseError } from "../indesign/errors.js";
import type {
  Document,
  Font,
  Frame,
  ImageFrame,
  Matrix,
  Page,
  Rect,
  Story,
  TextFrame,
} from "../indesign/ir.js";
import type { ParseResult } from "../indesign/parser.js";
import { validateDocument } from "../indesign/schema.js";
import { rectPtToPx } from "../indesign/units.js";
import { WarningCollector } from "../indesign/warnings.js";
import { averageColor, encodeImageToPng } from "./images.js";
import { derivePalette } from "./palette.js";
import { loadPdfPages, type RawImage, type RawPage } from "./pdf-document.js";
import { buildStyleBuckets } from "./style-buckets.js";
import { clusterTextRuns, type TextBlock } from "./text-cluster.js";

export const DEFAULT_DPI = 96;
const IDENTITY6: Matrix = [1, 0, 0, 1, 0, 0];
const DEFAULT_CHARACTER_STYLE = "CharacterStyle/[No character style]";

export const PdfWarningCode = {
  NO_EMBEDDED_FONTS: "NO_EMBEDDED_FONTS",
  TEXT_FROM_GLYPHS: "TEXT_FROM_GLYPHS",
  VECTOR_ONLY_PAGE: "VECTOR_ONLY_PAGE",
  IMAGE_NOT_EXTRACTED: "IMAGE_NOT_EXTRACTED",
  MULTI_COLUMN_DETECTED: "MULTI_COLUMN_DETECTED",
} as const;

export interface PdfParseOptions {
  /** DPI for point→pixel conversion. Default 96. */
  dpi?: number;
  /** Run zod validation on the produced IR (default true). */
  validate?: boolean;
  /** Recorded on `document.meta.sourcePath`. */
  sourcePath?: string;
  /** Directory to write extracted images into; enables image asset extraction. */
  assetDir?: string;
  /** Maximum number of palette swatches to derive. */
  maxColors?: number;
}

/** Parse a PDF buffer into the IR. */
export async function parsePdf(
  data: Uint8Array,
  options: PdfParseOptions = {},
): Promise<ParseResult> {
  const dpi = options.dpi ?? DEFAULT_DPI;
  const validate = options.validate ?? true;
  const collector = new WarningCollector();

  let rawPages: RawPage[];
  try {
    rawPages = await loadPdfPages(data);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new IdmlParseError(`Could not parse PDF: ${reason}`, "PDF_LOAD_ERROR");
  }
  if (rawPages.length === 0) {
    throw new IdmlParseError("PDF has no pages", "PDF_EMPTY");
  }

  const pages = rawPages.map((raw, index) => ({ raw, index, ...clusterTextRuns(raw.runs) }));

  const allBlocks = pages.flatMap((p) => p.blocks);
  const { paragraphStyles, styleIdForSize } = buildStyleBuckets(allBlocks, dpi);

  const fonts = collectFonts(rawPages);
  const swatches = derivePalette(
    rawPages.flatMap((p) => p.colors),
    rawPages.flatMap((p) =>
      p.images.map((im) => (im.pixels ? averageColor(im.pixels) : undefined)).filter(isString),
    ),
    options.maxColors ? { maxColors: options.maxColors } : {},
  );

  if (options.assetDir) mkdirSync(options.assetDir, { recursive: true });

  const stories: Story[] = [];
  const assets: Document["assets"] = [];
  const spreads: Document["spreads"] = [];
  let storyCounter = 0;
  let imageCounter = 0;

  for (const page of pages) {
    const pageId = `page-${page.index + 1}`;
    const pageHeightPt = page.raw.heightPt;
    const pageBounds = rectPtToPx(
      { x: 0, y: 0, width: page.raw.widthPt, height: pageHeightPt },
      dpi,
    );
    const irPage: Page = {
      id: pageId,
      name: String(page.index + 1),
      bounds: pageBounds,
      geometricBounds: pageBounds,
      transform: IDENTITY6,
    };

    const frames: Frame[] = [];
    for (const block of page.blocks) {
      const storyId = `Story/p${page.index + 1}-${++storyCounter}`;
      const styleId = styleIdForSize.get(block.size) ?? "ParagraphStyle/Body";
      stories.push(buildStory(storyId, block, styleId));
      frames.push(buildTextFrame(storyId, block, pageId, pageHeightPt, dpi));
    }
    for (const image of page.raw.images) {
      frames.push(
        buildImageFrame(
          image,
          pageId,
          pageHeightPt,
          dpi,
          ++imageCounter,
          options,
          assets,
          collector,
        ),
      );
    }

    if (page.blocks.length === 0 && (page.raw.images.length > 0 || page.raw.colors.length > 0)) {
      collector.warn(
        PdfWarningCode.VECTOR_ONLY_PAGE,
        `Page ${page.index + 1} has no extractable text (vector or outlined content only)`,
        pageId,
      );
    }
    if (page.columnCount > 1) {
      collector.info(
        PdfWarningCode.MULTI_COLUMN_DETECTED,
        `Page ${page.index + 1} reconstructed as ${page.columnCount} columns`,
        pageId,
      );
    }

    spreads.push({ id: `Spread/${page.index + 1}`, pages: [irPage], frames, transform: IDENTITY6 });
  }

  if (allBlocks.length > 0) {
    collector.info(
      PdfWarningCode.TEXT_FROM_GLYPHS,
      "Text was reconstructed from positioned glyph runs; line and paragraph grouping is heuristic",
    );
  }
  if (fonts.some((f) => !f.embedded)) {
    const names = fonts.filter((f) => !f.embedded).map((f) => f.family);
    collector.warn(
      PdfWarningCode.NO_EMBEDDED_FONTS,
      `Fonts are not embedded (${names.join(", ")}); mapped by name with web fallbacks`,
    );
  }

  const document: Document = {
    meta: buildMeta(dpi, options.sourcePath),
    spreads,
    masterSpreads: [],
    stories,
    swatches,
    fonts: fonts.map((f): Font => ({ family: f.family, name: f.family })),
    paragraphStyles,
    characterStyles: [],
    assets,
    warnings: collector.all(),
  };

  const finalDoc = validate ? validateOrThrow(document) : document;
  return { document: finalDoc, warnings: finalDoc.warnings };
}

/** Read and parse a PDF file from disk. */
export async function parsePdfFile(
  path: string,
  options: PdfParseOptions = {},
): Promise<ParseResult> {
  let data: Uint8Array;
  try {
    data = readFileSync(path);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new IdmlParseError(`Cannot read PDF file "${path}": ${reason}`, "FILE_READ_ERROR");
  }
  return parsePdf(data, { sourcePath: path, ...options });
}

function buildMeta(dpi: number, sourcePath?: string): Document["meta"] {
  const meta: Document["meta"] = { source: "pdf", dpi, mimetypeValid: true };
  if (sourcePath) meta.sourcePath = sourcePath;
  return meta;
}

function buildStory(storyId: string, block: TextBlock, styleId: string): Story {
  const paragraphs = block.lines.map((line) => ({
    appliedParagraphStyle: styleId,
    overrides: {},
    runs: [{ text: line.text, appliedCharacterStyle: DEFAULT_CHARACTER_STYLE, overrides: {} }],
    text: line.text,
  }));
  return {
    id: storyId,
    paragraphs,
    plainText: block.text,
    appliedStyles: { paragraph: [styleId], character: [DEFAULT_CHARACTER_STYLE] },
  };
}

function flipBounds(
  x: number,
  yBottom: number,
  width: number,
  height: number,
  pageHeightPt: number,
  dpi: number,
): Rect {
  const top = pageHeightPt - (yBottom + height);
  return rectPtToPx({ x, y: top, width, height }, dpi);
}

function buildTextFrame(
  storyId: string,
  block: TextBlock,
  pageId: string,
  pageHeightPt: number,
  dpi: number,
): TextFrame {
  const frame: TextFrame = {
    id: storyId.replace("Story/", "TextFrame/"),
    type: "text",
    pageId,
    bounds: flipBounds(block.x, block.y, block.width, block.height, pageHeightPt, dpi),
    transform: IDENTITY6,
    visible: true,
    storyId,
  };
  const name = block.lines[0]?.text.slice(0, 48);
  if (name) frame.name = name;
  return frame;
}

function buildImageFrame(
  image: RawImage,
  pageId: string,
  pageHeightPt: number,
  dpi: number,
  index: number,
  options: PdfParseOptions,
  assets: Document["assets"],
  collector: WarningCollector,
): ImageFrame {
  const frame: ImageFrame = {
    id: `ImageFrame/${index}`,
    type: "image",
    pageId,
    bounds: flipBounds(image.x, image.y, image.width, image.height, pageHeightPt, dpi),
    transform: IDENTITY6,
    visible: true,
    image: { kind: "image", embedded: true },
  };

  if (image.pixels && options.assetDir) {
    const png = encodeImageToPng(image.pixels);
    if (png) {
      const filename = `image-${index}.png`;
      writeFileSync(join(options.assetDir, filename), png);
      frame.image.resolvedPath = filename;
      assets.push({ path: filename, bytes: png.length });
      return frame;
    }
  }
  collector.warn(
    PdfWarningCode.IMAGE_NOT_EXTRACTED,
    `Image ${index} could not be extracted to an asset file`,
    pageId,
  );
  return frame;
}

interface CollectedFont {
  family: string;
  embedded: boolean;
}

function collectFonts(pages: RawPage[]): CollectedFont[] {
  const fonts = new Map<string, CollectedFont>();
  for (const page of pages) {
    for (const font of page.fonts.values()) {
      const existing = fonts.get(font.family);
      if (!existing) fonts.set(font.family, { family: font.family, embedded: font.embedded });
      else if (font.embedded) existing.embedded = true;
    }
  }
  return [...fonts.values()];
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function validateOrThrow(document: Document): Document {
  try {
    return validateDocument(document);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new IdmlParseError(`Internal IR validation failed: ${reason}`, "IR_VALIDATION_FAILED");
  }
}
