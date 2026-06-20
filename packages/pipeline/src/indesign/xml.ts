/**
 * Thin wrapper around `fast-xml-parser` configured for IDML, plus small
 * traversal helpers that tolerate the parser's "single value or array" shape.
 *
 * IDML stores almost everything in attributes, preserves namespace prefixes
 * (`idPkg:Spread`), and relies on text content whitespace inside `<Content>`,
 * so the parser is configured to keep attributes as raw strings, keep prefixes,
 * and not trim text.
 */
import { XMLParser } from "fast-xml-parser";

/** A parsed XML element: attributes are keyed `@_name`, text is `#text`. */
export type XmlNode = Record<string, unknown>;

const ATTR_PREFIX = "@_";
const TEXT_KEY = "#text";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_KEY,
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  processEntities: true,
});

/**
 * Parse an XML string into a plain object tree. Throws when the input is not
 * well-formed; callers convert that into a recoverable warning.
 */
export function parseXml(text: string): XmlNode {
  const result = parser.parse(text) as unknown;
  if (!isRecord(result)) {
    throw new Error("XML did not parse to an element tree");
  }
  return result;
}

/** Narrow an unknown value to a plain object. */
export function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce a "missing | single | array" value into an array. */
export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Read a string attribute (`@_name`) from a node. */
export function getAttr(node: unknown, name: string): string | undefined {
  if (!isRecord(node)) return undefined;
  const value = node[ATTR_PREFIX + name];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

/** Read a numeric attribute, returning `undefined` when absent or non-numeric. */
export function getNumAttr(node: unknown, name: string): number | undefined {
  const raw = getAttr(node, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a boolean attribute (`"true"`/`"false"`), with a default. */
export function getBoolAttr(node: unknown, name: string, fallback = false): boolean {
  const raw = getAttr(node, name);
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === "true";
}

/** All child elements with the given tag name, as an array. */
export function getChildren(node: unknown, name: string): XmlNode[] {
  if (!isRecord(node)) return [];
  return toArray(node[name]).filter(isRecord);
}

/** The first child element with the given tag name, if any. */
export function getChild(node: unknown, name: string): XmlNode | undefined {
  return getChildren(node, name)[0];
}

/**
 * Collect the plain-text content of a node, concatenating any `#text` values
 * and the text of nested `Content` elements.
 */
export function getTextContent(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(getTextContent).join("");
  if (isRecord(value)) {
    const text = value[TEXT_KEY];
    if (typeof text === "string") return text;
    if (text !== undefined) return getTextContent(text);
  }
  return "";
}

/**
 * Return every attribute of a node as a verbatim `{ name: value }` map,
 * stripping the `@_` prefix. Useful for "raw passthrough" of style/override data.
 */
export function getAttributes(node: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(ATTR_PREFIX) && value !== undefined && value !== null) {
      out[key.slice(ATTR_PREFIX.length)] = String(value);
    }
  }
  return out;
}
