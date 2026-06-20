import { describe, expect, it } from "vitest";
import { IdmlParseError } from "../errors.js";
import type { GroupFrame, ImageFrame, TextFrame } from "../ir.js";
import { parseIdml } from "../parser.js";
import { safeValidateDocument } from "../schema.js";
import { WarningCode } from "../warnings.js";
import { buildIdml, buildSampleIdml, sampleFiles } from "./idml-fixtures.js";

function parse(files = sampleFiles()) {
  return parseIdml(buildIdml(files));
}

describe("parseIdml — happy path", () => {
  it("produces an IR that passes zod schema validation", () => {
    const { document } = parseIdml(buildSampleIdml());
    const result = safeValidateDocument(document);
    expect(result.success).toBe(true);
  });

  it("records document metadata", () => {
    const { document } = parse();
    expect(document.meta.dpi).toBe(96);
    expect(document.meta.mimetypeValid).toBe(true);
    expect(document.meta.idmlVersion).toBe("16.0");
  });

  it("enumerates all swatches with computed hex colors", () => {
    const { document } = parse();
    const names = document.swatches.map((s) => s.name).sort();
    expect(names).toEqual(["Black", "Black 50%", "Brand Blue", "Fade", "None", "Paper"]);

    const black = document.swatches.find((s) => s.id === "Color/Black");
    expect(black?.hex).toBe("#000000");
    const blue = document.swatches.find((s) => s.id === "Color/Brand Blue");
    expect(blue?.rgb).toEqual({ r: 20, g: 90, b: 200 });
    expect(blue?.hex).toBe("#145ac8");

    const types = new Set(document.swatches.map((s) => s.type));
    expect(types).toEqual(new Set(["color", "tint", "gradient", "unknown"]));
  });

  it("enumerates all fonts", () => {
    const { document } = parse();
    expect(document.fonts).toHaveLength(3);
    expect(document.fonts.map((f) => f.name)).toContain("Minion Pro Bold");
    const helvetica = document.fonts.find((f) => f.family === "Helvetica");
    expect(helvetica?.postScriptName).toBe("Helvetica");
    expect(helvetica?.status).toBe("Installed");
  });

  it("enumerates paragraph and character styles, including nested groups", () => {
    const { document } = parse();
    expect(document.paragraphStyles.map((s) => s.name).sort()).toEqual([
      "Body",
      "Heading",
      "[No paragraph style]",
    ]);
    expect(document.characterStyles.map((s) => s.name).sort()).toEqual([
      "Emphasis",
      "[No character style]",
    ]);

    const heading = document.paragraphStyles.find((s) => s.id === "ParagraphStyle/Heading");
    expect(heading?.properties.pointSize).toBe(32); // 24pt → 32px @96dpi
    expect(heading?.properties.leading).toBe(37.33); // 28pt → 37.33px
    expect(heading?.properties.fontFamily).toBe("Minion Pro");
    expect(heading?.properties.fontStyle).toBe("Bold");
    expect(heading?.properties.fillColor).toBe("Color/Black");
    expect(heading?.properties.alignment).toBe("LeftAlign");
    expect(heading?.basedOn).toBe("ParagraphStyle/$ID/[No paragraph style]");

    const body = document.paragraphStyles.find((s) => s.id === "ParagraphStyle/Body");
    expect(body?.group).toBe("Body");
    expect(body?.properties.leading).toBe("auto");
  });

  it("parses stories with paragraphs, runs, and plain text", () => {
    const { document } = parse();
    expect(document.stories).toHaveLength(1);
    const story = document.stories[0]!;
    expect(story.id).toBe("u100");
    expect(story.plainText).toBe("Welcome to Aurelius\nPrint to React, beautifully.");
    expect(story.paragraphs).toHaveLength(2);
    expect(story.paragraphs[1]!.runs).toHaveLength(2);
    expect(story.paragraphs[1]!.runs[1]!.appliedCharacterStyle).toBe("CharacterStyle/Emphasis");
    expect(story.appliedStyles.character).toContain("CharacterStyle/Emphasis");
  });

  it("parses spreads, pages, and frames with pixel geometry", () => {
    const { document } = parse();
    expect(document.spreads).toHaveLength(1);
    const spread = document.spreads[0]!;

    expect(spread.pages).toHaveLength(1);
    expect(spread.pages[0]!.bounds).toEqual({ x: 0, y: 0, width: 816, height: 1056 });

    expect(spread.frames).toHaveLength(2);
    const text = spread.frames.find((f) => f.type === "text") as TextFrame;
    expect(text.storyId).toBe("u100");
    expect(text.pageId).toBe("page-1");
    expect(text.bounds).toEqual({ x: 96, y: 96, width: 624, height: 133.33 });
  });

  it("resolves image frames to assets inside the package", () => {
    const { document } = parse();
    const spread = document.spreads[0]!;
    const image = spread.frames.find((f) => f.type === "image") as ImageFrame;
    expect(image.image.kind).toBe("image");
    expect(image.image.embedded).toBe(false);
    expect(image.image.resolvedPath).toBe("Links/hero.png");
    expect(image.image.actualPpi).toBe(300);

    // The resolved path is a real entry surfaced as a document asset.
    const asset = document.assets.find((a) => a.path === "Links/hero.png");
    expect(asset).toBeDefined();
    expect(asset!.bytes).toBeGreaterThan(0);
  });

  it("parses master spreads with names and frames", () => {
    const { document } = parse();
    expect(document.masterSpreads).toHaveLength(1);
    const master = document.masterSpreads[0]!;
    expect(master.name).toBe("A-Master");
    expect(master.namePrefix).toBe("A");
    expect(master.pages).toHaveLength(1);
    const band = master.frames[0]!;
    expect(band.type).toBe("graphic");
    expect(band.fillColor).toBe("Color/Brand Blue");
  });

  it("emits no warnings for a well-formed package", () => {
    const { document, warnings } = parse();
    expect(warnings).toEqual([]);
    expect(document.warnings).toEqual([]);
  });

  it("honors a custom DPI", () => {
    const { document } = parseIdml(buildSampleIdml(), { dpi: 72 });
    const heading = document.paragraphStyles.find((s) => s.id === "ParagraphStyle/Heading");
    expect(heading?.properties.pointSize).toBe(24); // 24pt → 24px @72dpi
    expect(document.spreads[0]!.pages[0]!.bounds.width).toBe(612);
  });
});

describe("parseIdml — malformed and edge-case packages", () => {
  it("throws IdmlParseError when the input is not a zip", () => {
    const notZip = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => parseIdml(notZip)).toThrowError(IdmlParseError);
    try {
      parseIdml(notZip);
    } catch (err) {
      expect((err as IdmlParseError).code).toBe("NOT_A_ZIP");
    }
  });

  it("throws IdmlParseError when designmap.xml is missing", () => {
    const files = sampleFiles();
    delete files["designmap.xml"];
    expect(() => parseIdml(buildIdml(files))).toThrowError(/designmap/i);
  });

  it("flags an invalid mimetype but still parses", () => {
    const files = sampleFiles();
    files.mimetype = "text/plain";
    const { document, warnings } = parse(files);
    expect(document.meta.mimetypeValid).toBe(false);
    expect(warnings.some((w) => w.code === WarningCode.MIMETYPE_MISMATCH)).toBe(true);
    expect(safeValidateDocument(document).success).toBe(true);
  });

  it("warns on an image link that does not resolve inside the package", () => {
    const files = sampleFiles();
    delete files["Links/hero.png"];
    const { document, warnings } = parse(files);
    const image = document.spreads[0]!.frames.find((f) => f.type === "image") as ImageFrame;
    expect(image.image.resolvedPath).toBeUndefined();
    expect(warnings.some((w) => w.code === WarningCode.UNRESOLVED_LINK)).toBe(true);
  });

  it("warns when a TextFrame references a missing story", () => {
    const files = sampleFiles();
    delete files["Stories/Story_u100.xml"];
    const { document, warnings } = parse(files);
    expect(document.stories).toHaveLength(0);
    expect(warnings.some((w) => w.code === WarningCode.MISSING_PARENT_STORY)).toBe(true);
    expect(warnings.some((w) => w.code === WarningCode.MISSING_RESOURCE_FILE)).toBe(true);
  });

  it("recovers from a story file with no <Story> element", () => {
    const files = sampleFiles();
    files["Stories/Story_u100.xml"] =
      '<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0"></idPkg:Story>';
    const { document, warnings } = parse(files);
    expect(document.stories).toHaveLength(0);
    expect(warnings.some((w) => w.code === WarningCode.MALFORMED_XML)).toBe(true);
    // The document still validates despite the recoverable error.
    expect(safeValidateDocument(document).success).toBe(true);
  });

  it("produces a valid empty IR when resources are absent", () => {
    const minimalDesignmap =
      '<?xml version="1.0"?><Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0" Self="doc"></Document>';
    const buffer = buildIdml({
      mimetype: "application/vnd.adobe.indesign-idml-package",
      "designmap.xml": minimalDesignmap,
    });
    const { document, warnings } = parseIdml(buffer);
    expect(document.spreads).toEqual([]);
    expect(document.swatches).toEqual([]);
    expect(warnings.some((w) => w.code === WarningCode.MISSING_RESOURCE_FILE)).toBe(true);
    expect(safeValidateDocument(document).success).toBe(true);
  });
});

describe("parseIdml — nested groups", () => {
  const groupSpread = `<?xml version="1.0"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <Spread Self="ub6" ItemTransform="1 0 0 1 0 0">
    <Page Self="page-1" Name="1" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0" />
    <Group Self="grp-1" ItemTransform="1 0 0 1 100 100">
      <Properties><PathGeometry><GeometryPathType><PathPointArray>
        <PathPointType Anchor="0 0" /><PathPointType Anchor="200 0" />
        <PathPointType Anchor="200 90" /><PathPointType Anchor="0 90" />
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
      <TextFrame Self="grp-text" ParentStory="u100" ItemTransform="1 0 0 1 10 10">
        <Properties><PathGeometry><GeometryPathType><PathPointArray>
          <PathPointType Anchor="0 0" /><PathPointType Anchor="180 0" />
          <PathPointType Anchor="180 40" /><PathPointType Anchor="0 40" />
        </PathPointArray></GeometryPathType></PathGeometry></Properties>
      </TextFrame>
      <Rectangle Self="grp-rect" ItemTransform="1 0 0 1 10 60">
        <Properties><PathGeometry><GeometryPathType><PathPointArray>
          <PathPointType Anchor="0 0" /><PathPointType Anchor="180 0" />
          <PathPointType Anchor="180 30" /><PathPointType Anchor="0 30" />
        </PathPointArray></GeometryPathType></PathGeometry></Properties>
      </Rectangle>
    </Group>
  </Spread>
</idPkg:Spread>`;

  function parseWithGroup() {
    const files = sampleFiles();
    files["Spreads/Spread_ub6.xml"] = groupSpread;
    return parseIdml(buildIdml(files));
  }

  it("parses groups with recursively nested children and composed geometry", () => {
    const { document } = parseWithGroup();
    const group = document.spreads[0]!.frames[0] as GroupFrame;
    expect(group.type).toBe("group");
    expect(group.children).toHaveLength(2);

    const text = group.children.find((f) => f.type === "text") as TextFrame;
    // Group translate (100,100) ∘ child translate (10,10) → origin (110pt → 146.67px).
    expect(text.bounds.x).toBe(146.67);
    expect(text.storyId).toBe("u100");
    expect(text.pageId).toBe("page-1"); // page assignment recurses into groups

    const rect = group.children.find((f) => f.type === "graphic");
    expect(rect?.id).toBe("grp-rect");
  });

  it("validates a document containing nested group frames", () => {
    const { document } = parseWithGroup();
    expect(safeValidateDocument(document).success).toBe(true);
  });
});
