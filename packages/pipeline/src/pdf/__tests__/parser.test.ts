import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSampleIdml } from "../../indesign/__tests__/idml-fixtures.js";
import { parseIdml } from "../../indesign/parser.js";
import { safeValidateDocument } from "../../indesign/schema.js";
import type { ImageFrame } from "../../indesign/ir.js";
import { mapDocumentToTokens } from "../../tokens/mapper.js";
import { parsePdf, PdfWarningCode } from "../parser.js";
import * as fx from "./pdf-fixtures.js";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pdf-test-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const textFrames = (doc: Awaited<ReturnType<typeof parsePdf>>["document"]) =>
  doc.spreads.flatMap((s) => s.frames).filter((f) => f.type === "text");
const imageFrames = (doc: Awaited<ReturnType<typeof parsePdf>>["document"]) =>
  doc.spreads.flatMap((s) => s.frames).filter((f): f is ImageFrame => f.type === "image");

describe("parsePdf — text-heavy", () => {
  it("produces a valid IR with heading/body/caption style buckets", async () => {
    const { document, warnings } = await parsePdf(await fx.textHeavyPdf());

    expect(safeValidateDocument(document).success).toBe(true);
    expect(document.meta.source).toBe("pdf");
    expect(document.spreads).toHaveLength(1);
    expect(document.spreads[0]!.pages).toHaveLength(1);

    const names = document.paragraphStyles.map((s) => s.name).sort();
    expect(names).toEqual(["Body", "Caption", "Heading"]);
    expect(textFrames(document).length).toBeGreaterThanOrEqual(3);

    expect(warnings.some((w) => w.code === PdfWarningCode.NO_EMBEDDED_FONTS)).toBe(true);
    expect(warnings.some((w) => w.code === PdfWarningCode.TEXT_FROM_GLYPHS)).toBe(true);
  });

  it("feeds the token mapper (PDF → IR → tokens) without an IDML file", async () => {
    const { document } = await parsePdf(await fx.textHeavyPdf());
    const { tokens } = mapDocumentToTokens(document);
    expect(Object.keys(tokens.fontSizes)).toContain("heading");
    expect(Object.keys(tokens.fontSizes)).toContain("body");
    expect(Object.keys(tokens.fontFamilies).length).toBeGreaterThan(0);
  });
});

describe("parsePdf — image-heavy", () => {
  it("extracts embedded images to the asset dir and references them from the IR", async () => {
    const assetDir = tempDir();
    const { document } = await parsePdf(await fx.imageHeavyPdf(), { assetDir });

    const images = imageFrames(document);
    expect(images.length).toBe(2);
    for (const frame of images) {
      expect(frame.image.resolvedPath).toBeDefined();
      expect(existsSync(join(assetDir, frame.image.resolvedPath!))).toBe(true);
    }
    expect(document.assets.length).toBe(2);
    expect(document.assets.every((a) => a.bytes > 0)).toBe(true);
  });

  it("warns when no asset dir is supplied (images detected but not written)", async () => {
    const { document, warnings } = await parsePdf(await fx.imageHeavyPdf());
    expect(imageFrames(document).length).toBe(2);
    expect(warnings.some((w) => w.code === PdfWarningCode.IMAGE_NOT_EXTRACTED)).toBe(true);
  });
});

describe("parsePdf — multi-column", () => {
  it("detects columns and reconstructs separate frames", async () => {
    const { document, warnings } = await parsePdf(await fx.multiColumnPdf());
    expect(warnings.some((w) => w.code === PdfWarningCode.MULTI_COLUMN_DETECTED)).toBe(true);
    expect(textFrames(document).length).toBeGreaterThanOrEqual(3);
    expect(safeValidateDocument(document).success).toBe(true);
  });
});

describe("parsePdf — single-page brochure", () => {
  it("produces text frames, an image, and a derived palette", async () => {
    const assetDir = tempDir();
    const { document } = await parsePdf(await fx.brochurePdf(), { assetDir });
    expect(document.spreads).toHaveLength(1);
    expect(textFrames(document).length).toBeGreaterThanOrEqual(2);
    expect(imageFrames(document).length).toBe(1);
    expect(document.swatches.length).toBeGreaterThanOrEqual(3);
    expect(document.swatches[0]!.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("parsePdf — vector-only", () => {
  it("warns about no extractable text and still derives a palette", async () => {
    const { document, warnings } = await parsePdf(await fx.vectorOnlyPdf());
    expect(textFrames(document)).toHaveLength(0);
    expect(warnings.some((w) => w.code === PdfWarningCode.VECTOR_ONLY_PAGE)).toBe(true);
    expect(document.swatches.length).toBeGreaterThanOrEqual(2);
    expect(safeValidateDocument(document).success).toBe(true);
  });
});

describe("PDF / IDML parity", () => {
  it("agrees on page count and produces comparable style buckets", async () => {
    const pdf = (await parsePdf(await fx.brochurePdf())).document;
    const idml = parseIdml(buildSampleIdml()).document;

    // Page count parity (both single-page documents).
    const pdfPages = pdf.spreads.reduce((n, s) => n + s.pages.length, 0);
    const idmlPages = idml.spreads.reduce((n, s) => n + s.pages.length, 0);
    expect(pdfPages).toBe(idmlPages);

    // Both detect a heading bucket larger than their body bucket.
    const headingOf = (doc: typeof pdf) => {
      const sizes = doc.paragraphStyles
        .map((s) => s.properties.pointSize)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => b - a);
      return sizes[0] ?? 0;
    };
    expect(headingOf(pdf)).toBeGreaterThan(0);
    expect(headingOf(idml)).toBeGreaterThan(0);
  });
});
