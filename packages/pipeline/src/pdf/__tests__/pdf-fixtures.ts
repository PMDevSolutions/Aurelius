/**
 * Programmatic PDF fixtures built with pdf-lib.
 *
 * Covers the five document shapes the parser must handle: text-heavy,
 * image-heavy, multi-column, single-page brochure, and vector-only (no
 * extractable text). pdf-lib uses the standard-14 fonts (not embedded), which
 * naturally exercises the "no embedded fonts" fidelity path.
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { PNG } from "pngjs";

const LETTER: [number, number] = [612, 792];

/** A solid-color RGBA PNG, used for embedded-image fixtures. */
export function solidPng(
  width: number,
  height: number,
  color: [number, number, number],
): Uint8Array {
  const png = new PNG({ width, height });
  const [r, g, b] = color;
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function fonts(doc: PDFDocument) {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

/** A text-heavy single page: heading, many body lines, and a caption. */
export async function textHeavyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(LETTER);
  const { regular, bold } = await fonts(doc);

  page.drawText("Annual Report 2026", {
    x: 72,
    y: 720,
    size: 28,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  let y = 680;
  for (let i = 0; i < 24; i++) {
    page.drawText(`Body paragraph line ${i + 1} with enough text to read as flowing copy.`, {
      x: 72,
      y,
      size: 11,
      font: regular,
      color: rgb(0, 0, 0),
    });
    y -= 16;
  }
  page.drawText("Figure 1 — a small caption set in eight point type.", {
    x: 72,
    y: y - 8,
    size: 8,
    font: regular,
    color: rgb(0.3, 0.3, 0.3),
  });
  return doc.save();
}

/** An image-heavy single page: two embedded images and a caption. */
export async function imageHeavyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(LETTER);
  const { regular } = await fonts(doc);

  const hero = await doc.embedPng(solidPng(32, 24, [30, 120, 200]));
  const inset = await doc.embedPng(solidPng(16, 16, [220, 60, 40]));
  page.drawImage(hero, { x: 72, y: 480, width: 360, height: 240 });
  page.drawImage(inset, { x: 72, y: 360, width: 96, height: 96 });
  page.drawText("Photography by the studio.", { x: 72, y: 340, size: 9, font: regular });
  return doc.save();
}

/** A two-column page of body text. */
export async function multiColumnPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(LETTER);
  const { regular, bold } = await fonts(doc);

  page.drawText("Two Column Layout", { x: 72, y: 720, size: 24, font: bold });
  for (const x of [72, 320]) {
    let y = 680;
    for (let i = 0; i < 16; i++) {
      page.drawText(`Column text ${i + 1} at x=${x}.`, { x, y, size: 10, font: regular });
      y -= 14;
    }
  }
  return doc.save();
}

/** A single-page brochure: heading, body, image, and palette swatches. */
export async function brochurePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(LETTER);
  const { regular, bold } = await fonts(doc);

  page.drawRectangle({ x: 0, y: 712, width: 612, height: 80, color: rgb(0.08, 0.35, 0.78) });
  page.drawText("Spring Collection", { x: 48, y: 736, size: 30, font: bold, color: rgb(1, 1, 1) });
  page.drawText("A short introductory paragraph describing the collection.", {
    x: 48,
    y: 660,
    size: 12,
    font: regular,
    color: rgb(0.1, 0.1, 0.1),
  });
  const hero = await doc.embedPng(solidPng(40, 30, [240, 200, 60]));
  page.drawImage(hero, { x: 48, y: 400, width: 320, height: 220 });
  page.drawRectangle({ x: 48, y: 360, width: 24, height: 24, color: rgb(0.9, 0.1, 0.1) });
  page.drawText("Caption for the hero image.", {
    x: 48,
    y: 340,
    size: 8,
    font: regular,
    color: rgb(0.4, 0.4, 0.4),
  });
  return doc.save();
}

/** A vector-only page: shapes, no text. */
export async function vectorOnlyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(LETTER);
  page.drawRectangle({ x: 72, y: 500, width: 200, height: 200, color: rgb(0.2, 0.6, 0.4) });
  page.drawRectangle({ x: 320, y: 500, width: 200, height: 200, color: rgb(0.8, 0.3, 0.5) });
  page.drawCircle({ x: 300, y: 300, size: 80, color: rgb(0.1, 0.1, 0.1) });
  return doc.save();
}
