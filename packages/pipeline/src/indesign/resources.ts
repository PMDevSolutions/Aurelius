/**
 * Parsers for `Resources/Graphic.xml` (swatches), `Resources/Fonts.xml`
 * (fonts), and `Resources/Styles.xml` (paragraph & character styles).
 *
 * Each parser is defensive: malformed XML is downgraded to a warning and an
 * empty result rather than aborting the whole package parse.
 */
import { colorToRgb, rgbToHex } from "./colors.js";
import type { Font, Style, StyleKind, StyleProperties, Swatch } from "./ir.js";
import { ptToPx, round } from "./units.js";
import { WarningCode, type WarningCollector } from "./warnings.js";
import {
  getAttr,
  getAttributes,
  getChild,
  getChildren,
  getNumAttr,
  getTextContent,
  isRecord,
  parseXml,
  type XmlNode,
} from "./xml.js";

/** Strip InDesign's `$ID/` localization prefix from a name. */
function cleanName(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  return name.replace(/^\$ID\//, "");
}

function numberList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/** Parse swatches (colors, tints, gradients) from `Resources/Graphic.xml`. */
export function parseGraphic(xml: string, collector: WarningCollector, path: string): Swatch[] {
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    collector.error(WarningCode.MALFORMED_XML, `Failed to parse graphics: ${asMessage(err)}`, path);
    return [];
  }
  const graphic = getChild(root, "idPkg:Graphic") ?? root;
  const swatches: Swatch[] = [];

  for (const color of getChildren(graphic, "Color")) {
    const id = getAttr(color, "Self");
    if (!id) continue;
    const space = getAttr(color, "Space");
    const colorValue = numberList(getAttr(color, "ColorValue"));
    const swatch: Swatch = {
      id,
      name: cleanName(getAttr(color, "Name"), id),
      type: "color",
    };
    const model = getAttr(color, "Model");
    if (model) swatch.model = model;
    if (space) swatch.space = space;
    if (colorValue.length > 0) swatch.colorValue = colorValue;
    const rgb = colorToRgb(space, colorValue);
    if (rgb) {
      swatch.rgb = rgb;
      swatch.hex = rgbToHex(rgb);
    } else if (space) {
      collector.info(
        WarningCode.UNKNOWN_COLOR_SPACE,
        `Color "${id}" uses unconvertible space "${space}"`,
        path,
      );
    }
    swatches.push(swatch);
  }

  for (const tint of getChildren(graphic, "Tint")) {
    const id = getAttr(tint, "Self");
    if (!id) continue;
    const tintValue = getNumAttr(tint, "TintValue");
    swatches.push({
      id,
      name: cleanName(getAttr(tint, "Name"), id),
      type: "tint",
      ...(tintValue !== undefined ? { colorValue: [tintValue] } : {}),
    });
  }

  for (const gradient of getChildren(graphic, "Gradient")) {
    const id = getAttr(gradient, "Self");
    if (!id) continue;
    swatches.push({ id, name: cleanName(getAttr(gradient, "Name"), id), type: "gradient" });
  }

  for (const swatch of getChildren(graphic, "Swatch")) {
    const id = getAttr(swatch, "Self");
    if (!id) continue;
    swatches.push({ id, name: cleanName(getAttr(swatch, "Name"), id), type: "unknown" });
  }

  return swatches;
}

/** Parse fonts from `Resources/Fonts.xml`. */
export function parseFonts(xml: string, collector: WarningCollector, path: string): Font[] {
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    collector.error(WarningCode.MALFORMED_XML, `Failed to parse fonts: ${asMessage(err)}`, path);
    return [];
  }
  const fontsRoot = getChild(root, "idPkg:Fonts") ?? root;
  const fonts: Font[] = [];

  for (const family of getChildren(fontsRoot, "FontFamily")) {
    const familyName = getAttr(family, "Name") ?? "";
    for (const font of getChildren(family, "Font")) {
      const name = getAttr(font, "Name");
      if (!name) continue;
      const entry: Font = {
        family: getAttr(font, "FontFamily") ?? familyName,
        name,
      };
      const id = getAttr(font, "Self");
      if (id) entry.id = id;
      const styleName = getAttr(font, "FontStyleName");
      if (styleName) entry.styleName = styleName;
      const postScriptName = getAttr(font, "PostScriptName");
      if (postScriptName) entry.postScriptName = postScriptName;
      const status = getAttr(font, "Status");
      if (status) entry.status = status;
      fonts.push(entry);
    }
  }

  return fonts;
}

interface StyleAccumulator {
  paragraphStyles: Style[];
  characterStyles: Style[];
}

/** Parse paragraph and character styles from `Resources/Styles.xml`. */
export function parseStyles(
  xml: string,
  collector: WarningCollector,
  path: string,
  dpi: number,
): StyleAccumulator {
  const acc: StyleAccumulator = { paragraphStyles: [], characterStyles: [] };
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    collector.error(WarningCode.MALFORMED_XML, `Failed to parse styles: ${asMessage(err)}`, path);
    return acc;
  }
  const stylesRoot = getChild(root, "idPkg:Styles") ?? root;

  const paragraphRoot = getChild(stylesRoot, "RootParagraphStyleGroup");
  if (paragraphRoot) {
    collectStyles(
      paragraphRoot,
      "paragraph",
      "ParagraphStyle",
      "ParagraphStyleGroup",
      [],
      dpi,
      acc,
    );
  }
  const characterRoot = getChild(stylesRoot, "RootCharacterStyleGroup");
  if (characterRoot) {
    collectStyles(
      characterRoot,
      "character",
      "CharacterStyle",
      "CharacterStyleGroup",
      [],
      dpi,
      acc,
    );
  }

  return acc;
}

function collectStyles(
  group: XmlNode,
  kind: StyleKind,
  styleTag: string,
  groupTag: string,
  groupPath: string[],
  dpi: number,
  acc: StyleAccumulator,
): void {
  for (const node of getChildren(group, styleTag)) {
    const style = toStyle(node, kind, groupPath, dpi);
    if (!style) continue;
    if (kind === "paragraph") acc.paragraphStyles.push(style);
    else acc.characterStyles.push(style);
  }
  for (const nested of getChildren(group, groupTag)) {
    const name = cleanName(getAttr(nested, "Name"), getAttr(nested, "Self") ?? "");
    collectStyles(nested, kind, styleTag, groupTag, [...groupPath, name], dpi, acc);
  }
}

function toStyle(
  node: XmlNode,
  kind: StyleKind,
  groupPath: string[],
  dpi: number,
): Style | undefined {
  const id = getAttr(node, "Self");
  if (!id) return undefined;
  const properties = readStyleProperties(node, dpi);
  const style: Style = {
    id,
    name: cleanName(getAttr(node, "Name"), id),
    kind,
    properties,
  };
  if (groupPath.length > 0) style.group = groupPath.join("/");
  const basedOn = readBasedOn(node);
  if (basedOn) style.basedOn = basedOn;
  return style;
}

function readBasedOn(node: XmlNode): string | undefined {
  const props = getChild(node, "Properties");
  const fromProps = getTextContent(getChild(props, "BasedOn"));
  if (fromProps) return fromProps;
  return getAttr(node, "BasedOn");
}

function readStyleProperties(node: XmlNode, dpi: number): StyleProperties {
  const raw = getAttributes(node);
  const properties: StyleProperties = { raw };

  const props = getChild(node, "Properties");
  const appliedFont = getTextContent(getChild(props, "AppliedFont"));
  if (appliedFont) properties.fontFamily = appliedFont;

  const fontStyle = getAttr(node, "FontStyle");
  if (fontStyle) properties.fontStyle = fontStyle;

  const pointSize = getNumAttr(node, "PointSize");
  if (pointSize !== undefined) properties.pointSize = round(ptToPx(pointSize, dpi));

  const leading = readLeading(props, dpi);
  if (leading !== undefined) properties.leading = leading;

  const tracking = getNumAttr(node, "Tracking");
  if (tracking !== undefined) properties.tracking = tracking;

  const fillColor = getAttr(node, "FillColor");
  if (fillColor) properties.fillColor = fillColor;

  const strokeColor = getAttr(node, "StrokeColor");
  if (strokeColor) properties.strokeColor = strokeColor;

  const alignment = getAttr(node, "Justification");
  if (alignment) properties.alignment = alignment;

  return properties;
}

function readLeading(props: XmlNode | undefined, dpi: number): number | "auto" | undefined {
  if (!props) return undefined;
  const leadingNode = props["Leading"];
  if (leadingNode === undefined) return undefined;
  const node = Array.isArray(leadingNode) ? leadingNode[0] : leadingNode;
  const type = isRecord(node) ? getAttr(node, "type") : undefined;
  if (type === "enumeration") return "auto";
  const text = getTextContent(node);
  const value = Number(text);
  if (Number.isFinite(value)) return round(ptToPx(value, dpi));
  return undefined;
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
