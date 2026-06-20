/**
 * Parser for `Stories/Story_*.xml`.
 *
 * A story is a tree of `ParagraphStyleRange` → `CharacterStyleRange` →
 * `Content`. Each paragraph range becomes a {@link Paragraph}; each character
 * range becomes a {@link TextRun} carrying its applied style reference and any
 * local attribute overrides.
 *
 * Known limitation: forced line breaks (`<Br/>`) interleaved with `<Content>`
 * are not order-preserved, so within-paragraph hard breaks are dropped. Para-
 * graph boundaries (the `ParagraphStyleRange` elements) are preserved exactly.
 */
import type { Paragraph, Story, TextRun } from "./ir.js";
import { WarningCode, type WarningCollector } from "./warnings.js";
import {
  getAttr,
  getAttributes,
  getChild,
  getChildren,
  getTextContent,
  parseXml,
  toArray,
  type XmlNode,
} from "./xml.js";

const DEFAULT_PARAGRAPH_STYLE = "ParagraphStyle/$ID/[No paragraph style]";
const DEFAULT_CHARACTER_STYLE = "CharacterStyle/$ID/[No character style]";

/** Parse a single story document. Returns `undefined` on malformed XML. */
export function parseStory(
  xml: string,
  collector: WarningCollector,
  path: string,
): Story | undefined {
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    collector.error(WarningCode.MALFORMED_XML, `Failed to parse story: ${reason}`, path);
    return undefined;
  }

  const storyRoot = getChild(root, "idPkg:Story") ?? root;
  const story = getChild(storyRoot, "Story");
  if (!story) {
    collector.warn(WarningCode.MALFORMED_XML, "Story file has no <Story> element", path);
    return undefined;
  }

  const id = getAttr(story, "Self");
  if (!id) {
    collector.warn(WarningCode.MISSING_IDENTIFIER, "Story is missing a Self id", path);
    return undefined;
  }

  const paragraphs: Paragraph[] = [];
  const paragraphStyleRefs = new Set<string>();
  const characterStyleRefs = new Set<string>();

  for (const psr of getChildren(story, "ParagraphStyleRange")) {
    const appliedParagraphStyle = getAttr(psr, "AppliedParagraphStyle") ?? DEFAULT_PARAGRAPH_STYLE;
    paragraphStyleRefs.add(appliedParagraphStyle);

    const runs: TextRun[] = [];
    for (const csr of getChildren(psr, "CharacterStyleRange")) {
      const appliedCharacterStyle =
        getAttr(csr, "AppliedCharacterStyle") ?? DEFAULT_CHARACTER_STYLE;
      characterStyleRefs.add(appliedCharacterStyle);

      const text = toArray(csr["Content"]).map(getTextContent).join("");
      runs.push({
        text,
        appliedCharacterStyle,
        overrides: stripAttr(getAttributes(csr), "AppliedCharacterStyle"),
      });
    }

    paragraphs.push({
      appliedParagraphStyle,
      overrides: stripAttr(getAttributes(psr), "AppliedParagraphStyle"),
      runs,
      text: runs.map((r) => r.text).join(""),
    });
  }

  return {
    id,
    paragraphs,
    plainText: paragraphs.map((p) => p.text).join("\n"),
    appliedStyles: {
      paragraph: [...paragraphStyleRefs],
      character: [...characterStyleRefs],
    },
  };
}

function stripAttr(attrs: Record<string, string>, name: string): Record<string, string> {
  if (!(name in attrs)) return attrs;
  const { [name]: _omit, ...rest } = attrs;
  return rest;
}
