/**
 * Derive a swatch palette from a PDF.
 *
 * Clusters the fill/stroke colors collected from the operator list together with
 * dominant image colors, ranks them by frequency, and emits {@link Swatch}
 * entries in the IR shape so the token mapper can build a color palette without
 * a companion IDML file.
 */
import type { RGB, Swatch } from "../indesign/ir.js";

export interface PaletteOptions {
  /** Maximum number of swatches to emit. */
  maxColors?: number;
  /** sRGB distance under which two colors are merged. */
  tolerance?: number;
}

interface Cluster {
  hex: string;
  rgb: RGB;
  weight: number;
}

/** Build a frequency-ranked, de-duplicated swatch palette. */
export function derivePalette(
  fillColors: string[],
  imageColors: string[],
  options: PaletteOptions = {},
): Swatch[] {
  const maxColors = options.maxColors ?? 12;
  const tolerance = options.tolerance ?? 12;

  const clusters: Cluster[] = [];
  const add = (hex: string, weight: number): void => {
    const normalized = hex.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalized)) return;
    const rgb = hexToRgb(normalized);
    const match = clusters.find((c) => distance(c.rgb, rgb) <= tolerance);
    if (match) {
      match.weight += weight;
    } else {
      clusters.push({ hex: normalized, rgb, weight });
    }
  };

  for (const hex of fillColors) add(hex, 1);
  for (const hex of imageColors) add(hex, 1);

  clusters.sort((a, b) => b.weight - a.weight);

  return clusters.slice(0, maxColors).map((cluster, i) => ({
    id: `Color/pdf-${i + 1}`,
    name: `Color ${i + 1}`,
    type: "color" as const,
    space: "RGB",
    colorValue: [cluster.rgb.r, cluster.rgb.g, cluster.rgb.b],
    hex: cluster.hex,
    rgb: cluster.rgb,
  }));
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function distance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}
