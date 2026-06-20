/**
 * Color-space conversion for IDML swatches.
 *
 * IDML colors carry a `Space` (`CMYK`, `RGB`, `LAB`, `Gray`) and a raw
 * `ColorValue`. This module converts those to an sRGB triple and `#rrggbb` hex
 * so downstream token mapping has a usable web color. Conversions are
 * deterministic approximations (no ICC profiles); unknown spaces return
 * `undefined` and the caller records a warning.
 */
import type { RGB } from "./ir.js";

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Format an sRGB triple as `#rrggbb`. */
export function rgbToHex(rgb: RGB): string {
  const hex = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

/** CMYK (each component 0–100) to sRGB. */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  const cc = c / 100;
  const mm = m / 100;
  const yy = y / 100;
  const kk = k / 100;
  return {
    r: clamp255(255 * (1 - cc) * (1 - kk)),
    g: clamp255(255 * (1 - mm) * (1 - kk)),
    b: clamp255(255 * (1 - yy) * (1 - kk)),
  };
}

/** Single-channel gray (0 = white, 100 = black) to sRGB. */
export function grayToRgb(value: number): RGB {
  const channel = clamp255(255 * (1 - value / 100));
  return { r: channel, g: channel, b: channel };
}

/** CIE L*a*b* (D50 reference white, as InDesign uses) to sRGB. */
export function labToRgb(l: number, a: number, b: number): RGB {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number): number => {
    const t3 = t ** 3;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  // D50 reference white.
  const x = 0.96422 * inv(fx);
  const y = 1.0 * inv(fy);
  const z = 0.82521 * inv(fz);
  // D50-adapted XYZ → linear sRGB.
  const rl = x * 3.1338561 + y * -1.6168667 + z * -0.4906146;
  const gl = x * -0.9787684 + y * 1.9161415 + z * 0.033454;
  const bl = x * 0.0719453 + y * -0.2289914 + z * 1.4052427;
  const gamma = (ch: number): number =>
    ch <= 0.0031308 ? 12.92 * ch : 1.055 * Math.pow(Math.max(ch, 0), 1 / 2.4) - 0.055;
  return {
    r: clamp255(gamma(rl) * 255),
    g: clamp255(gamma(gl) * 255),
    b: clamp255(gamma(bl) * 255),
  };
}

/**
 * Convert a swatch color space + raw component values to sRGB. Returns
 * `undefined` for unknown spaces or insufficient component counts.
 */
export function colorToRgb(space: string | undefined, values: number[]): RGB | undefined {
  if (!space) return undefined;
  switch (space.toUpperCase()) {
    case "CMYK":
      if (values.length < 4) return undefined;
      return cmykToRgb(values[0]!, values[1]!, values[2]!, values[3]!);
    case "RGB":
      if (values.length < 3) return undefined;
      return { r: clamp255(values[0]!), g: clamp255(values[1]!), b: clamp255(values[2]!) };
    case "LAB":
      if (values.length < 3) return undefined;
      return labToRgb(values[0]!, values[1]!, values[2]!);
    case "GRAY":
      if (values.length < 1) return undefined;
      return grayToRgb(values[0]!);
    default:
      return undefined;
  }
}

/**
 * Convert a swatch color to sRGB and report whether it lies inside the sRGB
 * gamut. CMYK and Gray are representable by construction; an RGB input outside
 * 0–255, or a Lab color whose linear sRGB lands outside [0, 1], is flagged out
 * of gamut so the token mapper can warn.
 */
export function convertColor(
  space: string | undefined,
  values: number[],
): { rgb: RGB; inGamut: boolean } | undefined {
  const rgb = colorToRgb(space, values);
  if (!rgb || !space) return undefined;
  return { rgb, inGamut: isInGamut(space, values) };
}

function isInGamut(space: string, values: number[]): boolean {
  switch (space.toUpperCase()) {
    case "RGB":
      return values.slice(0, 3).every((v) => v >= 0 && v <= 255);
    case "LAB": {
      if (values.length < 3) return true;
      const linear = labToLinearSrgb(values[0]!, values[1]!, values[2]!);
      const eps = 1e-4;
      return [linear.r, linear.g, linear.b].every((c) => c >= -eps && c <= 1 + eps);
    }
    default:
      return true;
  }
}

function labToLinearSrgb(l: number, a: number, b: number): RGB {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number): number => {
    const t3 = t ** 3;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const x = 0.96422 * inv(fx);
  const y = 1.0 * inv(fy);
  const z = 0.82521 * inv(fz);
  return {
    r: x * 3.1338561 + y * -1.6168667 + z * -0.4906146,
    g: x * -0.9787684 + y * 1.9161415 + z * 0.033454,
    b: x * 0.0719453 + y * -0.2289914 + z * 1.4052427,
  };
}
