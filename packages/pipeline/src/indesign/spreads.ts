/**
 * Parsers for `Spreads/Spread_*.xml` and `MasterSpreads/MasterSpread_*.xml`.
 *
 * Walks pages and page items, computing axis-aligned bounding boxes in spread
 * (pasteboard) coordinates by applying each item's `ItemTransform` to its
 * `PathGeometry` anchor points, then normalizing points → pixels. Items are
 * classified into text / image / graphic / group frames, and assigned to the
 * page whose rectangle contains their center.
 */
import type {
  Frame,
  GraphicFrame,
  GroupFrame,
  ImageFrame,
  ImageKind,
  ImageRef,
  Matrix,
  Page,
  Rect,
  Spread,
  MasterSpread,
  TextFrame,
} from "./ir.js";
import type { Point } from "./units.js";
import {
  IDENTITY,
  applyMatrix,
  boundsFromPoints,
  compose,
  containsCenter,
  normalizeMatrix,
  parseGeometricBounds,
  parseTransform,
  rectPtToPx,
  round,
} from "./units.js";
import { WarningCode, type WarningCollector } from "./warnings.js";
import { getAttr, getBoolAttr, getChild, getChildren, parseXml, type XmlNode } from "./xml.js";

/** Resolves a link URI to a package-relative path, or `undefined` if external. */
export type LinkResolver = (uri: string) => string | undefined;

interface ParseContext {
  dpi: number;
  collector: WarningCollector;
  path: string;
  resolveAsset: LinkResolver;
}

/** Page item tags that contain placed graphics when they wrap an image element. */
const SHAPE_TAGS = ["Rectangle", "Oval", "Polygon", "GraphicLine"] as const;
/** Child elements that represent placed graphic content inside a shape. */
const GRAPHIC_TAGS: Record<string, ImageKind> = {
  Image: "image",
  EPS: "eps",
  PDF: "pdf",
  ImportedPage: "pdf",
  WMF: "unknown",
  PICT: "unknown",
};
/** Additional interactive/compound item tags we record as graphic frames. */
const OTHER_ITEM_TAGS = ["Button", "MultiStateObject", "FormField", "EPSText"] as const;

/** Parse a spread document. Returns `undefined` on malformed XML. */
export function parseSpread(
  xml: string,
  collector: WarningCollector,
  dpi: number,
  resolveAsset: LinkResolver,
  path: string,
): Spread | undefined {
  const ctx: ParseContext = { dpi, collector, path, resolveAsset };
  const element = readSpreadElement(xml, "idPkg:Spread", "Spread", ctx);
  if (!element) return undefined;
  const common = parseSpreadCommon(element, ctx);
  return { id: common.id, pages: common.pages, frames: common.frames, transform: common.transform };
}

/** Parse a master spread document. Returns `undefined` on malformed XML. */
export function parseMasterSpread(
  xml: string,
  collector: WarningCollector,
  dpi: number,
  resolveAsset: LinkResolver,
  path: string,
): MasterSpread | undefined {
  const ctx: ParseContext = { dpi, collector, path, resolveAsset };
  const element = readSpreadElement(xml, "idPkg:MasterSpread", "MasterSpread", ctx);
  if (!element) return undefined;
  const common = parseSpreadCommon(element, ctx);
  const master: MasterSpread = {
    id: common.id,
    pages: common.pages,
    frames: common.frames,
    transform: common.transform,
  };
  const name = getAttr(element, "Name");
  if (name) master.name = name;
  const prefix = getAttr(element, "NamePrefix");
  if (prefix) master.namePrefix = prefix;
  return master;
}

function readSpreadElement(
  xml: string,
  wrapperTag: string,
  elementTag: string,
  ctx: ParseContext,
): XmlNode | undefined {
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    ctx.collector.error(WarningCode.MALFORMED_XML, `Failed to parse spread: ${reason}`, ctx.path);
    return undefined;
  }
  const wrapper = getChild(root, wrapperTag) ?? root;
  const element = getChild(wrapper, elementTag);
  if (!element) {
    ctx.collector.warn(
      WarningCode.MALFORMED_XML,
      `Spread file has no <${elementTag}> element`,
      ctx.path,
    );
    return undefined;
  }
  return element;
}

interface SpreadCommon {
  id: string;
  pages: Page[];
  frames: Frame[];
  transform: Matrix;
}

function parseSpreadCommon(element: XmlNode, ctx: ParseContext): SpreadCommon {
  const id = getAttr(element, "Self") ?? "";
  if (!id)
    ctx.collector.warn(WarningCode.MISSING_IDENTIFIER, "Spread is missing a Self id", ctx.path);

  const pages = getChildren(element, "Page").map((node) => parsePage(node, ctx));
  const frames = parseItems(element, IDENTITY, ctx);
  assignPages(frames, pages);

  return {
    id,
    pages,
    frames,
    transform: normalizeMatrix(parseTransform(getAttr(element, "ItemTransform")), ctx.dpi),
  };
}

function parsePage(node: XmlNode, ctx: ParseContext): Page {
  const id = getAttr(node, "Self") ?? "";
  if (!id)
    ctx.collector.warn(WarningCode.MISSING_IDENTIFIER, "Page is missing a Self id", ctx.path);

  const matrix = parseTransform(getAttr(node, "ItemTransform"));
  const geom = parseGeometricBounds(getAttr(node, "GeometricBounds"));
  const page: Page = {
    id,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    geometricBounds: { x: 0, y: 0, width: 0, height: 0 },
    transform: normalizeMatrix(matrix, ctx.dpi),
  };
  const name = getAttr(node, "Name");
  if (name) page.name = name;

  if (geom) {
    page.geometricBounds = rectPtToPx(geom, ctx.dpi);
    const corners = rectCorners(geom).map((p) => applyMatrix(matrix, p.x, p.y));
    const world = boundsFromPoints(corners);
    if (world) page.bounds = rectPtToPx(world, ctx.dpi);
  } else {
    ctx.collector.warn(WarningCode.EMPTY_GEOMETRY, `Page "${id}" has no GeometricBounds`, ctx.path);
  }
  return page;
}

function parseItems(parent: XmlNode, parentMatrix: Matrix, ctx: ParseContext): Frame[] {
  const frames: Frame[] = [];

  for (const node of getChildren(parent, "TextFrame")) {
    frames.push(parseTextFrame(node, parentMatrix, ctx));
  }
  for (const tag of SHAPE_TAGS) {
    for (const node of getChildren(parent, tag)) {
      frames.push(parseShape(node, parentMatrix, ctx));
    }
  }
  for (const node of getChildren(parent, "Group")) {
    frames.push(parseGroup(node, parentMatrix, ctx));
  }
  for (const tag of OTHER_ITEM_TAGS) {
    for (const node of getChildren(parent, tag)) {
      ctx.collector.info(
        WarningCode.UNSUPPORTED_PAGE_ITEM,
        `Page item "${tag}" modelled as a generic graphic frame`,
        ctx.path,
      );
      frames.push(makeGraphicFrame(node, parentMatrix, ctx));
    }
  }

  return frames;
}

function baseFrame(
  node: XmlNode,
  parentMatrix: Matrix,
  ctx: ParseContext,
): {
  id: string;
  bounds: Rect;
  transform: Matrix;
  visible: boolean;
  fillColor?: string;
  strokeColor?: string;
} {
  const id = getAttr(node, "Self") ?? "";
  const itemTransform = parseTransform(getAttr(node, "ItemTransform"));
  const world = compose(parentMatrix, itemTransform);
  const localPoints = extractAnchorPoints(node);
  let bounds: Rect;
  if (localPoints.length > 0) {
    const worldPoints = localPoints.map((p) => applyMatrix(world, p.x, p.y));
    bounds = rectPtToPx(boundsFromPoints(worldPoints)!, ctx.dpi);
  } else {
    ctx.collector.info(
      WarningCode.EMPTY_GEOMETRY,
      `Page item "${id}" has no path geometry; bounds derived from origin`,
      ctx.path,
    );
    bounds = {
      x: round((world[4] * ctx.dpi) / 72),
      y: round((world[5] * ctx.dpi) / 72),
      width: 0,
      height: 0,
    };
  }
  const result = {
    id,
    bounds,
    transform: normalizeMatrix(itemTransform, ctx.dpi),
    visible: getBoolAttr(node, "Visible", true),
  } as {
    id: string;
    bounds: Rect;
    transform: Matrix;
    visible: boolean;
    fillColor?: string;
    strokeColor?: string;
  };
  const fill = getAttr(node, "FillColor");
  if (fill) result.fillColor = fill;
  const stroke = getAttr(node, "StrokeColor");
  if (stroke) result.strokeColor = stroke;
  return result;
}

function parseTextFrame(node: XmlNode, parentMatrix: Matrix, ctx: ParseContext): TextFrame {
  const base = baseFrame(node, parentMatrix, ctx);
  const frame: TextFrame = { ...base, type: "text" };
  const parentStory = getAttr(node, "ParentStory");
  if (parentStory && parentStory !== "n") frame.storyId = parentStory;
  const next = getAttr(node, "NextTextFrame");
  if (next && next !== "n") frame.nextFrameId = next;
  const prev = getAttr(node, "PreviousTextFrame");
  if (prev && prev !== "n") frame.previousFrameId = prev;
  const name = getAttr(node, "Name");
  if (name) frame.name = name;
  return frame;
}

function parseShape(
  node: XmlNode,
  parentMatrix: Matrix,
  ctx: ParseContext,
): ImageFrame | GraphicFrame {
  const graphic = findGraphicChild(node);
  if (!graphic) return makeGraphicFrame(node, parentMatrix, ctx);

  const base = baseFrame(node, parentMatrix, ctx);
  const image = readImageRef(graphic.node, graphic.kind, ctx);
  const frame: ImageFrame = { ...base, type: "image", image };
  const name = getAttr(node, "Name");
  if (name) frame.name = name;
  return frame;
}

function makeGraphicFrame(node: XmlNode, parentMatrix: Matrix, ctx: ParseContext): GraphicFrame {
  const base = baseFrame(node, parentMatrix, ctx);
  const frame: GraphicFrame = { ...base, type: "graphic" };
  const name = getAttr(node, "Name");
  if (name) frame.name = name;
  return frame;
}

function parseGroup(node: XmlNode, parentMatrix: Matrix, ctx: ParseContext): GroupFrame {
  const base = baseFrame(node, parentMatrix, ctx);
  const world = compose(parentMatrix, parseTransform(getAttr(node, "ItemTransform")));
  const frame: GroupFrame = { ...base, type: "group", children: parseItems(node, world, ctx) };
  const name = getAttr(node, "Name");
  if (name) frame.name = name;
  return frame;
}

function findGraphicChild(node: XmlNode): { node: XmlNode; kind: ImageKind } | undefined {
  for (const [tag, kind] of Object.entries(GRAPHIC_TAGS)) {
    const child = getChild(node, tag);
    if (child) return { node: child, kind };
  }
  return undefined;
}

function readImageRef(graphic: XmlNode, kind: ImageKind, ctx: ParseContext): ImageRef {
  const link = getChild(graphic, "Link");
  const linkUri = getAttr(link, "LinkResourceURI");
  const storedState = getAttr(link, "StoredState");
  const embedded = !linkUri || storedState === "Embedded";

  const ref: ImageRef = { kind, embedded };
  if (linkUri) {
    ref.linkUri = linkUri;
    const resolved = ctx.resolveAsset(linkUri);
    if (resolved) {
      ref.resolvedPath = resolved;
    } else if (!embedded) {
      ctx.collector.warn(
        WarningCode.UNRESOLVED_LINK,
        `Image link "${linkUri}" does not resolve to a file inside the package`,
        ctx.path,
      );
    }
  }
  const ppi = firstNumber(getAttr(graphic, "ActualPpi"));
  if (ppi !== undefined) ref.actualPpi = ppi;
  const transform = getAttr(graphic, "ItemTransform");
  if (transform) ref.itemTransform = normalizeMatrix(parseTransform(transform), ctx.dpi);
  return ref;
}

function extractAnchorPoints(node: XmlNode): Point[] {
  const props = getChild(node, "Properties");
  const geometry = getChild(props, "PathGeometry");
  const points: Point[] = [];
  for (const geoPath of getChildren(geometry, "GeometryPathType")) {
    const array = getChild(geoPath, "PathPointArray");
    for (const pointType of getChildren(array, "PathPointType")) {
      const anchor = numberPair(getAttr(pointType, "Anchor"));
      if (anchor) points.push(anchor);
    }
  }
  return points;
}

function assignPages(frames: Frame[], pages: Page[]): void {
  if (pages.length === 0) return;
  for (const frame of frames) {
    const page = pages.find((p) => containsCenter(p.bounds, frame.bounds));
    if (page) frame.pageId = page.id;
    if (frame.type === "group") assignPages(frame.children, pages);
  }
}

function rectCorners(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function numberPair(value: string | undefined): Point | undefined {
  if (!value) return undefined;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]))
    return undefined;
  return { x: parts[0]!, y: parts[1]! };
}

function firstNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const first = value.trim().split(/\s+/)[0];
  if (first === undefined) return undefined;
  const n = Number(first);
  return Number.isFinite(n) ? n : undefined;
}
