/**
 * Top-level IDML parser.
 *
 * Orchestrates the package, resource, story, and spread parsers into a single
 * validated {@link Document} intermediate representation. Recoverable issues are
 * accumulated as warnings; only truly unrecoverable conditions (not a zip,
 * missing `designmap.xml`) throw {@link IdmlParseError}.
 */
import { IdmlParseError } from "./errors.js";
import type { Asset, Document, Frame, Story } from "./ir.js";
import { IDML_MIMETYPE, IdmlPackage } from "./package.js";
import { parseFonts, parseGraphic, parseStyles } from "./resources.js";
import { validateDocument } from "./schema.js";
import { parseMasterSpread, parseSpread } from "./spreads.js";
import { parseStory } from "./stories.js";
import { WarningCode, WarningCollector } from "./warnings.js";
import { getAttr, getChild, getChildren, parseXml, type XmlNode } from "./xml.js";

/** Default DPI used to convert IDML points to pixels. */
export const DEFAULT_DPI = 96;

export interface ParseOptions {
  /** Dots per inch for point→pixel conversion. Default 96. */
  dpi?: number;
  /** Run zod validation on the produced IR (default true). */
  validate?: boolean;
  /** Recorded on `document.meta.sourcePath`. */
  sourcePath?: string;
}

export interface ParseResult {
  document: Document;
  warnings: Document["warnings"];
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "tif",
  "tiff",
  "bmp",
  "webp",
  "svg",
  "eps",
  "pdf",
  "ai",
  "psd",
]);

/** Parse an in-memory IDML buffer. */
export function parseIdml(buffer: Uint8Array, options: ParseOptions = {}): ParseResult {
  return parsePackage(IdmlPackage.fromBuffer(buffer), options);
}

/** Read and parse an IDML file from disk. */
export function parseIdmlFile(path: string, options: ParseOptions = {}): ParseResult {
  const pkg = IdmlPackage.fromFile(path);
  return parsePackage(pkg, { sourcePath: path, ...options });
}

/** Parse an already-unzipped {@link IdmlPackage}. */
export function parsePackage(pkg: IdmlPackage, options: ParseOptions = {}): ParseResult {
  const dpi = options.dpi ?? DEFAULT_DPI;
  const validate = options.validate ?? true;
  const collector = new WarningCollector();

  const mimetypeValid = pkg.hasValidMimetype();
  if (!mimetypeValid) {
    collector.warn(
      WarningCode.MIMETYPE_MISMATCH,
      `mimetype is "${pkg.mimetype() ?? "(absent)"}", expected "${IDML_MIMETYPE}"`,
      "mimetype",
    );
  }

  const designmapText = pkg.readText("designmap.xml");
  if (designmapText === undefined) {
    throw new IdmlParseError("Package is missing designmap.xml", "MISSING_DESIGNMAP");
  }
  let designmap: XmlNode;
  try {
    designmap = parseXml(designmapText);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new IdmlParseError(`designmap.xml is malformed: ${reason}`, "MALFORMED_DESIGNMAP");
  }
  const documentEl = getChild(designmap, "Document") ?? designmap;

  // ── Resources ──────────────────────────────────────────────────────────
  const graphicXml = readResource(
    pkg,
    collector,
    documentEl,
    "idPkg:Graphic",
    "Resources/Graphic.xml",
  );
  const fontsXml = readResource(pkg, collector, documentEl, "idPkg:Fonts", "Resources/Fonts.xml");
  const stylesXml = readResource(
    pkg,
    collector,
    documentEl,
    "idPkg:Styles",
    "Resources/Styles.xml",
  );

  const swatches = graphicXml ? parseGraphic(graphicXml.text, collector, graphicXml.path) : [];
  const fonts = fontsXml ? parseFonts(fontsXml.text, collector, fontsXml.path) : [];
  const styles = stylesXml
    ? parseStyles(stylesXml.text, collector, stylesXml.path, dpi)
    : { paragraphStyles: [], characterStyles: [] };

  // ── Stories ────────────────────────────────────────────────────────────
  const storyPaths = resolveSrcs(documentEl, "idPkg:Story", pkg, "Stories/");
  const stories: Story[] = [];
  for (const path of storyPaths) {
    const text = pkg.readText(path);
    if (text === undefined) {
      collector.warn(WarningCode.MISSING_RESOURCE_FILE, `Story file "${path}" is missing`, path);
      continue;
    }
    const story = parseStory(text, collector, path);
    if (story) stories.push(story);
  }

  // ── Spreads & master spreads ─────────────────────────────────────────────
  const resolveAsset = (uri: string): string | undefined => pkg.resolveAssetUri(uri);

  const spreadPaths = resolveSrcs(documentEl, "idPkg:Spread", pkg, "Spreads/");
  const spreads = spreadPaths
    .map((path) => {
      const text = pkg.readText(path);
      if (text === undefined) {
        collector.warn(WarningCode.MISSING_RESOURCE_FILE, `Spread file "${path}" is missing`, path);
        return undefined;
      }
      return parseSpread(text, collector, dpi, resolveAsset, path);
    })
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const masterPaths = resolveSrcs(documentEl, "idPkg:MasterSpread", pkg, "MasterSpreads/");
  const masterSpreads = masterPaths
    .map((path) => {
      const text = pkg.readText(path);
      if (text === undefined) {
        collector.warn(
          WarningCode.MISSING_RESOURCE_FILE,
          `Master spread "${path}" is missing`,
          path,
        );
        return undefined;
      }
      return parseMasterSpread(text, collector, dpi, resolveAsset, path);
    })
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  // ── Cross-reference resolution: TextFrame.ParentStory → Story.Self ───────
  const storyIds = new Set(stories.map((s) => s.id));
  const allFrames: Frame[][] = [
    ...spreads.map((s) => s.frames),
    ...masterSpreads.map((s) => s.frames),
  ];
  for (const frames of allFrames) {
    resolveStoryRefs(frames, storyIds, collector);
  }

  // ── Assets ───────────────────────────────────────────────────────────────
  const assets = gatherAssets(pkg, [
    ...spreads.flatMap((s) => s.frames),
    ...masterSpreads.flatMap((s) => s.frames),
  ]);

  const meta: Document["meta"] = { source: "idml", dpi, mimetypeValid };
  const idmlVersion = getAttr(documentEl, "DOMVersion");
  if (idmlVersion) meta.idmlVersion = idmlVersion;
  if (options.sourcePath) meta.sourcePath = options.sourcePath;

  const document: Document = {
    meta,
    spreads,
    masterSpreads,
    stories,
    swatches,
    fonts,
    paragraphStyles: styles.paragraphStyles,
    characterStyles: styles.characterStyles,
    assets,
    warnings: collector.all(),
  };

  const finalDoc = validate ? validateOrThrow(document) : document;
  return { document: finalDoc, warnings: finalDoc.warnings };
}

interface ResourceText {
  text: string;
  path: string;
}

function readResource(
  pkg: IdmlPackage,
  collector: WarningCollector,
  documentEl: XmlNode,
  tag: string,
  fallback: string,
): ResourceText | undefined {
  const src = getChildren(documentEl, tag)
    .map((n) => getAttr(n, "src"))
    .find((s): s is string => Boolean(s));
  const candidates = src ? [src, fallback] : [fallback];
  for (const path of candidates) {
    const text = pkg.readText(path);
    if (text !== undefined) return { text, path };
  }
  collector.warn(
    WarningCode.MISSING_RESOURCE_FILE,
    `Resource "${tag}" (${src ?? fallback}) not found in package`,
    src ?? fallback,
  );
  return undefined;
}

function resolveSrcs(
  documentEl: XmlNode,
  tag: string,
  pkg: IdmlPackage,
  fallbackDir: string,
): string[] {
  const declared = getChildren(documentEl, tag)
    .map((n) => getAttr(n, "src"))
    .filter((s): s is string => Boolean(s));
  if (declared.length > 0) return declared;
  // Fallback: enumerate the conventional directory deterministically.
  return pkg.filter((p) => p.startsWith(fallbackDir) && p.toLowerCase().endsWith(".xml")).sort();
}

function resolveStoryRefs(
  frames: Frame[],
  storyIds: Set<string>,
  collector: WarningCollector,
): void {
  for (const frame of frames) {
    if (frame.type === "text" && frame.storyId && !storyIds.has(frame.storyId)) {
      collector.warn(
        WarningCode.MISSING_PARENT_STORY,
        `TextFrame "${frame.id}" references unknown story "${frame.storyId}"`,
      );
    }
    if (frame.type === "group") resolveStoryRefs(frame.children, storyIds, collector);
  }
}

function gatherAssets(pkg: IdmlPackage, frames: Frame[]): Asset[] {
  const paths = new Set<string>();
  for (const entry of pkg.list()) {
    if (entry.startsWith("Links/")) {
      paths.add(entry);
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf(".") + 1).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) paths.add(entry);
  }
  collectResolvedPaths(frames, paths);
  return [...paths].sort().map((path) => ({ path, bytes: pkg.byteLength(path) }));
}

function collectResolvedPaths(frames: Frame[], out: Set<string>): void {
  for (const frame of frames) {
    if (frame.type === "image" && frame.image.resolvedPath) out.add(frame.image.resolvedPath);
    if (frame.type === "group") collectResolvedPaths(frame.children, out);
  }
}

function validateOrThrow(document: Document): Document {
  try {
    return validateDocument(document);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new IdmlParseError(`Internal IR validation failed: ${reason}`, "IR_VALIDATION_FAILED");
  }
}
