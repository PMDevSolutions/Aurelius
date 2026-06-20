/**
 * Synthesize paragraph styles from PDF font-size clusters.
 *
 * A PDF carries no named styles, so the parser infers them: distinct font sizes
 * become heading / body / caption buckets (the most line-heavy size is the body
 * baseline), each emitted as a synthetic {@link Style} with a pixel `pointSize`.
 * Downstream, the token mapper clusters these exactly as it does IDML styles.
 */
import type { Style } from "../indesign/ir.js";
import { ptToPx, round } from "../indesign/units.js";
import type { TextBlock } from "./text-cluster.js";

export interface StyleBuckets {
  paragraphStyles: Style[];
  /** Map from a block's font size (points, 1-dp) to a synthetic style id. */
  styleIdForSize: Map<number, string>;
  bodySizePt: number;
}

const HEADING_RATIO = 1.05;
const CAPTION_RATIO = 0.95;

/** Build synthetic paragraph styles from clustered text blocks. */
export function buildStyleBuckets(blocks: TextBlock[], dpi: number): StyleBuckets {
  const sizes = collectSizes(blocks);
  const styleIdForSize = new Map<number, string>();
  if (sizes.size === 0) return { paragraphStyles: [], styleIdForSize, bodySizePt: 0 };

  const bodySizePt = pickBodySize(sizes);
  const distinct = [...sizes.keys()].sort((a, b) => b - a);

  const headings = distinct.filter((s) => s > bodySizePt * HEADING_RATIO);
  const captions = distinct.filter((s) => s < bodySizePt * CAPTION_RATIO);

  const families = dominantFamilies(blocks);
  const paragraphStyles: Style[] = [];

  headings.forEach((sizePt, i) => {
    const name = headings.length === 1 ? "Heading" : `Heading ${i + 1}`;
    paragraphStyles.push(makeStyle(name, sizePt, dpi, families.get(sizePt)));
    styleIdForSize.set(sizePt, `ParagraphStyle/${name}`);
  });

  paragraphStyles.push(makeStyle("Body", bodySizePt, dpi, families.get(bodySizePt)));
  styleIdForSize.set(bodySizePt, "ParagraphStyle/Body");

  captions.forEach((sizePt, i) => {
    const name = captions.length === 1 ? "Caption" : `Caption ${i + 1}`;
    paragraphStyles.push(makeStyle(name, sizePt, dpi, families.get(sizePt)));
    styleIdForSize.set(sizePt, `ParagraphStyle/${name}`);
  });

  return { paragraphStyles, styleIdForSize, bodySizePt };
}

function makeStyle(
  name: string,
  sizePt: number,
  dpi: number,
  fontFamily: string | undefined,
): Style {
  const style: Style = {
    id: `ParagraphStyle/${name}`,
    name,
    kind: "paragraph",
    properties: { pointSize: round(ptToPx(sizePt, dpi)), raw: {} },
  };
  if (fontFamily) style.properties.fontFamily = fontFamily;
  return style;
}

/** Distinct sizes (points, 1-dp) → total line count at that size. */
function collectSizes(blocks: TextBlock[]): Map<number, number> {
  const sizes = new Map<number, number>();
  for (const block of blocks) {
    sizes.set(block.size, (sizes.get(block.size) ?? 0) + block.lines.length);
  }
  return sizes;
}

function pickBodySize(sizes: Map<number, number>): number {
  let best = 0;
  let bestWeight = -1;
  for (const [size, weight] of sizes) {
    if (weight > bestWeight || (weight === bestWeight && size < best)) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

function dominantFamilies(blocks: TextBlock[]): Map<number, string> {
  const perSize = new Map<number, Map<string, number>>();
  for (const block of blocks) {
    if (!block.fontFamily) continue;
    const counts = perSize.get(block.size) ?? new Map<string, number>();
    counts.set(block.fontFamily, (counts.get(block.fontFamily) ?? 0) + block.lines.length);
    perSize.set(block.size, counts);
  }
  const out = new Map<number, string>();
  for (const [size, counts] of perSize) {
    let best = "";
    let bestCount = 0;
    for (const [family, count] of counts) {
      if (count > bestCount) {
        best = family;
        bestCount = count;
      }
    }
    if (best) out.set(size, best);
  }
  return out;
}
