import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

export function createPNG(width, height, fillFn) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fillFn(x, y, width, height);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return png;
}

export function savePNG(filename, png) {
  const filepath = join(FIXTURES, filename);
  mkdirSync(dirname(filepath), { recursive: true });
  writeFileSync(filepath, PNG.sync.write(png));
  return filepath;
}

// Solid color fill
export function solid(r, g, b, a = 255) {
  return () => [r, g, b, a];
}

// Simulate text-like horizontal bands (dark on light)
export function textBands(weight = 400) {
  const darkness = Math.round(255 - (weight / 900) * 200);
  return (x, y) => {
    const inBand = y % 20 < 12;
    const inChar = x % 10 < 6;
    if (inBand && inChar) return [darkness, darkness, darkness, 255];
    return [255, 255, 255, 255];
  };
}

// Simulate sub-pixel noise (scattered single pixels)
export function withSubPixelNoise(baseFn, density = 0.001) {
  return (x, y, w, h) => {
    if (Math.random() < density) {
      const base = baseFn(x, y, w, h);
      return [
        Math.min(255, base[0] + 50),
        Math.min(255, base[1] + 50),
        Math.min(255, base[2] + 50),
        base[3],
      ];
    }
    return baseFn(x, y, w, h);
  };
}

// Simulate layout shift (offset content by dx, dy pixels)
export function withShift(baseFn, dx, dy) {
  return (x, y, w, h) => {
    const sx = x - dx;
    const sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [255, 255, 255, 255];
    return baseFn(sx, sy, w, h);
  };
}

// Simulate font fallback: different character widths
export function textBandsFallback() {
  return (x, y) => {
    const inBand = y % 20 < 12;
    const inChar = x % 10 < 8;
    if (inBand && inChar) return [50, 50, 50, 255];
    return [255, 255, 255, 255];
  };
}
