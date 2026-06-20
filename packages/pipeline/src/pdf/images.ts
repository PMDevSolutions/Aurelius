/**
 * Encode raster images extracted from a PDF.
 *
 * pdfjs hands back decoded pixel buffers in one of a few `ImageKind` layouts;
 * this module normalizes them to RGBA, encodes a PNG via `pngjs`, and computes
 * an average color used to seed the swatch palette with dominant image colors.
 */
import { PNG } from "pngjs";
import { rgbToHex } from "../indesign/colors.js";
import type { RawPixels } from "./pdf-document.js";

const RGB_24BPP = 2;
const RGBA_32BPP = 3;
const GRAYSCALE_1BPP = 1;

/** Normalize pdfjs pixel data to a tightly-packed RGBA byte array. */
function toRgba(pixels: RawPixels): Uint8Array | undefined {
  const { width, height, kind, data } = pixels;
  if (width <= 0 || height <= 0) return undefined;
  const count = width * height;
  const out = new Uint8Array(count * 4);

  const at = (i: number): number => data[i] ?? 0;

  if (kind === RGBA_32BPP || (kind === 0 && data.length >= count * 4)) {
    if (data.length < count * 4) return undefined;
    for (let i = 0; i < count * 4; i++) out[i] = at(i);
    return out;
  }
  if (kind === RGB_24BPP || (kind === 0 && data.length >= count * 3)) {
    if (data.length < count * 3) return undefined;
    for (let i = 0, j = 0; i < count; i++) {
      out[j++] = at(i * 3);
      out[j++] = at(i * 3 + 1);
      out[j++] = at(i * 3 + 2);
      out[j++] = 255;
    }
    return out;
  }
  if (kind === GRAYSCALE_1BPP) {
    const rowBytes = Math.ceil(width / 8);
    if (data.length < rowBytes * height) return undefined;
    let j = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = at(y * rowBytes + (x >> 3));
        const value = (byte >> (7 - (x & 7))) & 1 ? 255 : 0;
        out[j++] = value;
        out[j++] = value;
        out[j++] = value;
        out[j++] = 255;
      }
    }
    return out;
  }
  return undefined;
}

/** Encode extracted pixels to a PNG buffer, or `undefined` if unsupported. */
export function encodeImageToPng(pixels: RawPixels): Uint8Array | undefined {
  const rgba = toRgba(pixels);
  if (!rgba) return undefined;
  const png = new PNG({ width: pixels.width, height: pixels.height });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png);
}

/** Average color of an image as `#rrggbb`, sampling for large images. */
export function averageColor(pixels: RawPixels): string | undefined {
  const rgba = toRgba(pixels);
  if (!rgba) return undefined;
  const pixelCount = rgba.length / 4;
  const step = Math.max(1, Math.floor(pixelCount / 4096));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < pixelCount; i += step) {
    r += rgba[i * 4] ?? 0;
    g += rgba[i * 4 + 1] ?? 0;
    b += rgba[i * 4 + 2] ?? 0;
    n++;
  }
  if (n === 0) return undefined;
  return rgbToHex({ r: r / n, g: g / n, b: b / n });
}
