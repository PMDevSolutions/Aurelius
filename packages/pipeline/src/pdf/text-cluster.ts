/**
 * Cluster positioned PDF text runs into logical text blocks.
 *
 * Runs → lines (same baseline, split on large horizontal gaps so columns don't
 * merge) → columns (lines grouped by left edge) → blocks (vertically contiguous
 * lines of compatible size within a column). Bounds are in PDF user space
 * (points, y-up); the parser flips them to the IR's top-left pixel space.
 */
import type { RawTextRun } from "./pdf-document.js";

export interface ClusterLine {
  runs: RawTextRun[];
  baseline: number;
  x0: number;
  x1: number;
  /** Dominant font size on the line (points). */
  size: number;
  text: string;
}

export interface TextBlock {
  lines: ClusterLine[];
  /** Bounds in PDF user space (points, y-up; `y` is the bottom edge). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Dominant font size across the block (points). */
  size: number;
  fontFamily?: string;
  columnIndex: number;
  text: string;
}

export interface ClusterResult {
  blocks: TextBlock[];
  columnCount: number;
}

const BASELINE_TOL = 0.5; // × line height
const GAP_SPLIT_MIN = 24; // pt — min horizontal gap that splits a line into columns
const GAP_SPLIT_RATIO = 3; // × line height
const COLUMN_BAND_GAP = 80; // pt — min separation between column left edges
const BLOCK_VGAP_RATIO = 1.9; // × line height — max vertical gap within a block
const SIZE_BREAK_RATIO = 1.35; // font-size ratio that starts a new block
const ASCENT = 0.8;
const DESCENT = 0.2;

/** Cluster raw text runs into blocks and report the detected column count. */
export function clusterTextRuns(runs: RawTextRun[]): ClusterResult {
  const lines = buildLines(runs);
  if (lines.length === 0) return { blocks: [], columnCount: 0 };

  const bands = detectColumnBands(lines);
  const blocks: TextBlock[] = [];
  bands.forEach((bandLines, columnIndex) => {
    for (const block of splitIntoBlocks(bandLines, columnIndex)) blocks.push(block);
  });
  return { blocks, columnCount: bands.length };
}

function buildLines(runs: RawTextRun[]): ClusterLine[] {
  const sorted = [...runs].sort((a, b) => b.baseline - a.baseline || a.x - b.x);
  const baselineGroups: RawTextRun[][] = [];
  for (const run of sorted) {
    const group = baselineGroups[baselineGroups.length - 1];
    const ref = group?.[0];
    if (group && ref && Math.abs(run.baseline - ref.baseline) <= BASELINE_TOL * run.height) {
      group.push(run);
    } else {
      baselineGroups.push([run]);
    }
  }

  const lines: ClusterLine[] = [];
  for (const group of baselineGroups) {
    const byX = [...group].sort((a, b) => a.x - b.x);
    let segment: RawTextRun[] = [];
    const flush = (): void => {
      if (segment.length > 0) lines.push(makeLine(segment));
      segment = [];
    };
    for (const run of byX) {
      const prev = segment[segment.length - 1];
      if (prev) {
        const gap = run.x - (prev.x + prev.width);
        const threshold = Math.max(GAP_SPLIT_MIN, GAP_SPLIT_RATIO * run.height);
        if (gap > threshold) flush();
      }
      segment.push(run);
    }
    flush();
  }
  return lines;
}

function makeLine(runs: RawTextRun[]): ClusterLine {
  const x0 = Math.min(...runs.map((r) => r.x));
  const x1 = Math.max(...runs.map((r) => r.x + r.width));
  const size = mode(runs.map((r) => round1(r.height)));
  const baseline = runs[0]?.baseline ?? 0;
  return { runs, baseline, x0, x1, size, text: joinRuns(runs) };
}

function joinRuns(runs: RawTextRun[]): string {
  let text = "";
  let prevEnd: number | undefined;
  for (const run of runs) {
    if (prevEnd !== undefined && run.x - prevEnd > 0.25 * run.height && !text.endsWith(" ")) {
      text += " ";
    }
    text += run.text;
    prevEnd = run.x + run.width;
  }
  return text;
}

function detectColumnBands(lines: ClusterLine[]): ClusterLine[][] {
  const edges = [...new Set(lines.map((l) => Math.round(l.x0)))].sort((a, b) => a - b);
  const bands: number[][] = [];
  for (const edge of edges) {
    const last = bands[bands.length - 1];
    if (last && edge - (last[last.length - 1] ?? edge) <= COLUMN_BAND_GAP) last.push(edge);
    else bands.push([edge]);
  }

  // Count lines whose left edge falls in each band; require ≥2 bands with ≥2 lines.
  const bandLeft = bands.map((b) => Math.min(...b));
  const assigned: ClusterLine[][] = bands.map(() => []);
  for (const line of lines) {
    let bi = 0;
    for (let i = bands.length - 1; i >= 0; i--) {
      if (line.x0 + 0.5 >= (bandLeft[i] ?? 0)) {
        bi = i;
        break;
      }
    }
    assigned[bi]?.push(line);
  }
  const populated = assigned.filter((b) => b.length >= 2);
  if (populated.length >= 2) return assigned.filter((b) => b.length > 0);
  return [lines];
}

function splitIntoBlocks(lines: ClusterLine[], columnIndex: number): TextBlock[] {
  const sorted = [...lines].sort((a, b) => b.baseline - a.baseline);
  const blocks: TextBlock[] = [];
  let current: ClusterLine[] = [];

  const flush = (): void => {
    if (current.length > 0) blocks.push(makeBlock(current, columnIndex));
    current = [];
  };

  for (const line of sorted) {
    const prev = current[current.length - 1];
    if (prev) {
      const vGap = prev.baseline - line.baseline;
      const sizeRatio =
        Math.max(prev.size, line.size) / Math.max(1, Math.min(prev.size, line.size));
      const xOverlap = line.x0 < prev.x1 + 4 && line.x1 > current[0]!.x0 - 4;
      if (vGap > BLOCK_VGAP_RATIO * line.size || sizeRatio >= SIZE_BREAK_RATIO || !xOverlap) {
        flush();
      }
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function makeBlock(lines: ClusterLine[], columnIndex: number): TextBlock {
  const x0 = Math.min(...lines.map((l) => l.x0));
  const x1 = Math.max(...lines.map((l) => l.x1));
  const top = Math.max(...lines.map((l) => l.baseline + ASCENT * l.size));
  const bottom = Math.min(...lines.map((l) => l.baseline - DESCENT * l.size));
  const size = mode(lines.map((l) => l.size));
  const family = lines[0]?.runs[0]?.fontFamily;
  const block: TextBlock = {
    lines,
    x: x0,
    y: bottom,
    width: x1 - x0,
    height: top - bottom,
    size,
    columnIndex,
    text: lines.map((l) => l.text).join("\n"),
  };
  if (family) block.fontFamily = family;
  return block;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
