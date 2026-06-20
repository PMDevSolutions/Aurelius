/**
 * Unit conversion and 2D affine geometry for the IDML parser.
 *
 * IDML expresses coordinates in points (1/72 inch). The parser normalizes every
 * geometric value to pixels at a configurable DPI: `px = pt · dpi / 72`.
 */
import type { Matrix, Rect } from "./ir.js";

/** A point in a 2D coordinate space. */
export interface Point {
  x: number;
  y: number;
}

/** Points per inch — the IDML coordinate unit. */
export const POINTS_PER_INCH = 72;

/** The identity affine transform. */
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Convert a length in points to pixels at the given DPI. */
export function ptToPx(value: number, dpi: number): number {
  return (value * dpi) / POINTS_PER_INCH;
}

/** Round to a fixed number of decimal places, avoiding `-0`. */
export function round(value: number, places = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Parse an `ItemTransform` attribute (`"a b c d tx ty"`) into a {@link Matrix}.
 * Returns the identity transform when the input is missing or malformed.
 */
export function parseTransform(value: string | undefined): Matrix {
  if (!value) return [...IDENTITY];
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) {
    return [...IDENTITY];
  }
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!, parts[4]!, parts[5]!];
}

/** Apply an affine transform to a point. */
export function applyMatrix(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/**
 * Compose two transforms so the result maps a point through `child` and then
 * `parent` (i.e. `result · p = parent · (child · p)`). Used to flatten nested
 * group/page transforms into spread coordinates.
 */
export function compose(parent: Matrix, child: Matrix): Matrix {
  const [pa, pb, pc, pd, ptx, pty] = parent;
  const [ca, cb, cc, cd, ctx, cty] = child;
  return [
    pa * ca + pc * cb,
    pb * ca + pd * cb,
    pa * cc + pc * cd,
    pb * cc + pd * cd,
    pa * ctx + pc * cty + ptx,
    pb * ctx + pd * cty + pty,
  ];
}

/** Axis-aligned bounding box of a set of points, or `undefined` when empty. */
export function boundsFromPoints(points: Point[]): Rect | undefined {
  if (points.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Parse a `GeometricBounds` attribute (`"y1 x1 y2 x2"` = top left bottom right,
 * in points) into a {@link Rect} in points. Returns `undefined` when malformed.
 */
export function parseGeometricBounds(value: string | undefined): Rect | undefined {
  if (!value) return undefined;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [top, left, bottom, right] = parts as [number, number, number, number];
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Convert a rectangle from points to rounded pixels. */
export function rectPtToPx(rect: Rect, dpi: number): Rect {
  return {
    x: round(ptToPx(rect.x, dpi)),
    y: round(ptToPx(rect.y, dpi)),
    width: round(ptToPx(rect.width, dpi)),
    height: round(ptToPx(rect.height, dpi)),
  };
}

/**
 * Normalize a transform for the IR: translation components are converted to
 * pixels; scale/shear components are preserved. All components are rounded.
 */
export function normalizeMatrix(m: Matrix, dpi: number): Matrix {
  return [
    round(m[0], 6),
    round(m[1], 6),
    round(m[2], 6),
    round(m[3], 6),
    round(ptToPx(m[4], dpi)),
    round(ptToPx(m[5], dpi)),
  ];
}

/** Whether `inner`'s center lies within `outer`. */
export function containsCenter(outer: Rect, inner: Rect): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height
  );
}
