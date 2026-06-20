/**
 * Low-level PDF extraction via the Node-friendly legacy pdfjs build.
 *
 * Loads a PDF and produces, per page, the raw material the parser needs: text
 * runs (with positions, sizes, and resolved font names), fill/stroke colors from
 * the operator list, and placed images (bounds via CTM tracking, plus decoded
 * pixels when pdfjs exposes them). All coordinates are PDF user space (points,
 * y-up); the parser flips them to the IR's top-left pixel space.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { cmykToRgb, grayToRgb, rgbToHex } from "../indesign/colors.js";
import type { Matrix } from "../indesign/ir.js";
import { applyMatrix, boundsFromPoints, compose, IDENTITY, type Point } from "../indesign/units.js";

export interface RawTextRun {
  text: string;
  /** Glyph-run origin x (PDF user space, points). */
  x: number;
  /** Glyph-run baseline y (PDF user space, points, y-up). */
  baseline: number;
  /** Advance width (points). */
  width: number;
  /** Font size (points). */
  height: number;
  fontName: string;
  fontFamily?: string;
}

export interface RawPixels {
  width: number;
  height: number;
  /** pdfjs ImageKind: 1 = gray 1bpp, 2 = RGB 24bpp, 3 = RGBA 32bpp. */
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface RawImage {
  id: string;
  /** Bounding box in PDF user space (points, y-up; `y` is the bottom edge). */
  x: number;
  y: number;
  width: number;
  height: number;
  pixels?: RawPixels;
}

export interface RawFont {
  family: string;
  embedded: boolean;
}

export interface RawPage {
  widthPt: number;
  heightPt: number;
  runs: RawTextRun[];
  images: RawImage[];
  /** All fill/stroke colors encountered, as `#rrggbb` (with repeats). */
  colors: string[];
  fonts: Map<string, RawFont>;
}

const STANDARD_14 =
  /^(Helvetica|Arial|Times|Times New Roman|Courier|Symbol|ZapfDingbats)(-?(Bold|Italic|Oblique|BoldItalic|BoldOblique|Roman|MT|PSMT|PS))*$/i;

/** Load a PDF buffer and extract every page's raw material. */
export async function loadPdfPages(data: Uint8Array): Promise<RawPage[]> {
  // pdfjs rejects Node `Buffer`; pass a plain Uint8Array view of the bytes.
  const bytes =
    data.constructor === Uint8Array
      ? data
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    const pages: RawPage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        pages.push(await extractPage(page));
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

async function extractPage(page: pdfjs.PDFPageProxy): Promise<RawPage> {
  const viewport = page.getViewport({ scale: 1 });
  const [textContent, opList] = await Promise.all([page.getTextContent(), page.getOperatorList()]);

  const fonts = new Map<string, RawFont>();
  const runs: RawTextRun[] = [];
  for (const item of textContent.items) {
    if (!("str" in item) || item.str.length === 0) continue;
    const fontName = item.fontName;
    if (!fonts.has(fontName)) fonts.set(fontName, resolveFont(page, fontName));
    const run: RawTextRun = {
      text: item.str,
      x: item.transform[4] ?? 0,
      baseline: item.transform[5] ?? 0,
      width: item.width,
      height: item.height || fontSizeFromTransform(item.transform),
      fontName,
    };
    const family = fonts.get(fontName)?.family;
    if (family) run.fontFamily = family;
    runs.push(run);
  }

  const { colors, images, xobjectIds } = walkOperators(opList);
  await resolveImagePixels(page, images, xobjectIds);
  return { widthPt: viewport.width, heightPt: viewport.height, runs, images, colors, fonts };
}

/** Resolve image XObject pixels asynchronously (pdfjs populates them lazily). */
async function resolveImagePixels(
  page: pdfjs.PDFPageProxy,
  images: RawImage[],
  xobjectIds: Map<number, string>,
): Promise<void> {
  for (const [index, objId] of xobjectIds) {
    const image = images[index];
    if (!image) continue;
    const raw = (await getObj(page.objs, objId)) ?? (await getObj(page.commonObjs, objId));
    if (raw && typeof raw === "object" && "data" in raw && "width" in raw && "height" in raw) {
      const r = raw as RawPixels;
      if (r.data && r.width && r.height) {
        image.pixels = { width: r.width, height: r.height, kind: r.kind ?? 0, data: r.data };
      }
    }
  }
}

/** Get a pdfjs object, awaiting its lazy resolution via the callback form. */
function getObj(store: pdfjs.ObjStore, id: string): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      if (store.has(id)) {
        resolve(store.get(id));
        return;
      }
    } catch {
      // not ready synchronously — fall through to the callback form
    }
    let settled = false;
    const finish = (value: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 3000);
    try {
      store.get(id, (obj) => finish(obj));
    } catch {
      finish(null);
    }
  });
}

function resolveFont(page: pdfjs.PDFPageProxy, fontName: string): RawFont {
  try {
    if (page.commonObjs.has(fontName)) {
      const font = page.commonObjs.get(fontName) as { name?: string; loadedName?: string } | null;
      const name = font?.name ?? fontName;
      return { family: cleanFontName(name), embedded: !STANDARD_14.test(name) };
    }
  } catch {
    // fall through to the raw id
  }
  return { family: cleanFontName(fontName), embedded: false };
}

function cleanFontName(name: string): string {
  // Subset fonts are tagged "ABCDEF+FamilyName"; drop the tag.
  return name.replace(/^[A-Z]{6}\+/, "").replace(/[-_](Regular|MT|PS|PSMT)$/i, "");
}

function fontSizeFromTransform(transform: number[]): number {
  const a = transform[0] ?? 1;
  const b = transform[1] ?? 0;
  return Math.hypot(a, b);
}

interface WalkResult {
  colors: string[];
  images: RawImage[];
  /** Map of image index → XObject id, resolved to pixels after the walk. */
  xobjectIds: Map<number, string>;
}

function walkOperators(opList: pdfjs.OperatorList): WalkResult {
  const OPS = pdfjs.OPS;
  const colors: string[] = [];
  const images: RawImage[] = [];
  const xobjectIds = new Map<number, string>();
  let ctm: Matrix = [...IDENTITY];
  const stack: Matrix[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push([...ctm]);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? [...IDENTITY];
        break;
      case OPS.transform:
        ctm = compose(ctm, argsToMatrix(args));
        break;
      case OPS.setFillRGBColor:
      case OPS.setStrokeRGBColor: {
        const hex = rgbArgToHex(args);
        if (hex) colors.push(hex);
        break;
      }
      case OPS.setFillCMYKColor:
      case OPS.setStrokeCMYKColor: {
        const hex = cmykArgToHex(args);
        if (hex) colors.push(hex);
        break;
      }
      case OPS.setFillGray:
      case OPS.setStrokeGray: {
        const hex = grayArgToHex(args);
        if (hex) colors.push(hex);
        break;
      }
      case OPS.paintImageXObject:
      case OPS.paintImageXObjectRepeat: {
        const objId = String((Array.isArray(args) ? args[0] : undefined) ?? "");
        if (objId) {
          xobjectIds.set(images.length, objId);
          images.push({ id: objId, ...imageBounds(ctm) });
        }
        break;
      }
      case OPS.paintInlineImage: {
        const image = imageFromInline(Array.isArray(args) ? args[0] : args, ctm, images.length);
        if (image) images.push(image);
        break;
      }
      default:
        break;
    }
  }
  return { colors, images, xobjectIds };
}

function imageBounds(ctm: Matrix): { x: number; y: number; width: number; height: number } {
  const corners: Point[] = [
    applyMatrix(ctm, 0, 0),
    applyMatrix(ctm, 1, 0),
    applyMatrix(ctm, 1, 1),
    applyMatrix(ctm, 0, 1),
  ];
  const box = boundsFromPoints(corners) ?? { x: 0, y: 0, width: 0, height: 0 };
  return box;
}

function imageFromInline(raw: unknown, ctm: Matrix, index: number): RawImage | undefined {
  const box = imageBounds(ctm);
  const image: RawImage = { id: `inline-${index}`, ...box };
  if (raw && typeof raw === "object" && "data" in raw && "width" in raw && "height" in raw) {
    const r = raw as RawPixels;
    if (r.data && r.width && r.height) {
      image.pixels = { width: r.width, height: r.height, kind: r.kind ?? 0, data: r.data };
    }
  }
  return image;
}

function num(args: unknown[], i: number): number {
  const v = args[i];
  return typeof v === "number" ? v : 0;
}

function argsToMatrix(args: unknown): Matrix {
  if (Array.isArray(args) && args.length >= 6 && args.every((n) => typeof n === "number")) {
    return [num(args, 0), num(args, 1), num(args, 2), num(args, 3), num(args, 4), num(args, 5)];
  }
  return [...IDENTITY];
}

function rgbArgToHex(args: unknown): string | undefined {
  const first = Array.isArray(args) ? args[0] : args;
  if (typeof first === "string" && /^#[0-9a-f]{6}$/i.test(first)) return first.toLowerCase();
  if (Array.isArray(args) && args.length >= 3 && args.every((n) => typeof n === "number")) {
    const r = num(args, 0);
    const g = num(args, 1);
    const b = num(args, 2);
    const scale = r > 1 || g > 1 || b > 1 ? 1 : 255;
    return rgbToHex({ r: r * scale, g: g * scale, b: b * scale });
  }
  return undefined;
}

function cmykArgToHex(args: unknown): string | undefined {
  if (Array.isArray(args) && args.length >= 4 && args.every((n) => typeof n === "number")) {
    return rgbToHex(
      cmykToRgb(num(args, 0) * 100, num(args, 1) * 100, num(args, 2) * 100, num(args, 3) * 100),
    );
  }
  return undefined;
}

function grayArgToHex(args: unknown): string | undefined {
  const g = Array.isArray(args) ? args[0] : args;
  if (typeof g === "number") return rgbToHex(grayToRgb((1 - g) * 100));
  return undefined;
}
