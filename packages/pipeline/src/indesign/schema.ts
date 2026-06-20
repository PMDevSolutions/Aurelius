/**
 * Runtime (zod) schemas mirroring the IR types in `./ir.ts`.
 *
 * `validateDocument` is the single source of runtime truth used by the parser
 * and tests to guarantee a produced {@link Document} is structurally valid. The
 * `_schemaProducesDocument` / `_documentSatisfiesSchema` functions below are
 * never called — they exist purely so the compiler fails if the schemas and the
 * hand-written IR types ever drift apart.
 */
import { z } from "zod";
import type { Document, Frame, GroupFrame } from "./ir.js";

const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const MatrixSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const RGBSchema = z.object({ r: z.number(), g: z.number(), b: z.number() });

const DocumentMetaSchema = z.object({
  idmlVersion: z.string().optional(),
  dpi: z.number(),
  mimetypeValid: z.boolean(),
  sourcePath: z.string().optional(),
});

const SwatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["color", "tint", "gradient", "mixedInk", "unknown"]),
  model: z.string().optional(),
  space: z.string().optional(),
  colorValue: z.array(z.number()).optional(),
  hex: z.string().optional(),
  rgb: RGBSchema.optional(),
});

const FontSchema = z.object({
  id: z.string().optional(),
  family: z.string(),
  name: z.string(),
  styleName: z.string().optional(),
  postScriptName: z.string().optional(),
  status: z.string().optional(),
});

const StylePropertiesSchema = z.object({
  fontFamily: z.string().optional(),
  fontStyle: z.string().optional(),
  pointSize: z.number().optional(),
  leading: z.union([z.number(), z.literal("auto")]).optional(),
  tracking: z.number().optional(),
  fillColor: z.string().optional(),
  strokeColor: z.string().optional(),
  alignment: z.string().optional(),
  raw: z.record(z.string()),
});

const StyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["paragraph", "character"]),
  group: z.string().optional(),
  basedOn: z.string().optional(),
  properties: StylePropertiesSchema,
});

const TextRunSchema = z.object({
  text: z.string(),
  appliedCharacterStyle: z.string(),
  overrides: z.record(z.string()),
});

const ParagraphSchema = z.object({
  appliedParagraphStyle: z.string(),
  overrides: z.record(z.string()),
  runs: z.array(TextRunSchema),
  text: z.string(),
});

const StorySchema = z.object({
  id: z.string(),
  paragraphs: z.array(ParagraphSchema),
  plainText: z.string(),
  appliedStyles: z.object({
    paragraph: z.array(z.string()),
    character: z.array(z.string()),
  }),
});

const frameBase = {
  id: z.string(),
  name: z.string().optional(),
  pageId: z.string().optional(),
  bounds: RectSchema,
  transform: MatrixSchema,
  visible: z.boolean(),
  fillColor: z.string().optional(),
  strokeColor: z.string().optional(),
};

const baseFrameObject = z.object(frameBase);

const ImageRefSchema = z.object({
  kind: z.enum(["image", "eps", "pdf", "unknown"]),
  embedded: z.boolean(),
  linkUri: z.string().optional(),
  resolvedPath: z.string().optional(),
  actualPpi: z.number().optional(),
  itemTransform: MatrixSchema.optional(),
});

const TextFrameSchema = baseFrameObject.extend({
  type: z.literal("text"),
  storyId: z.string().optional(),
  nextFrameId: z.string().optional(),
  previousFrameId: z.string().optional(),
});

const ImageFrameSchema = baseFrameObject.extend({
  type: z.literal("image"),
  image: ImageRefSchema,
});

const GraphicFrameSchema = baseFrameObject.extend({
  type: z.literal("graphic"),
});

const GroupFrameSchema = baseFrameObject.extend({
  type: z.literal("group"),
  children: z.array(z.lazy((): z.ZodType<Frame> => FrameSchema)),
});

const FrameSchema: z.ZodType<Frame> = z.discriminatedUnion("type", [
  TextFrameSchema,
  ImageFrameSchema,
  GraphicFrameSchema,
  GroupFrameSchema,
]);

const PageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  bounds: RectSchema,
  geometricBounds: RectSchema,
  transform: MatrixSchema,
});

const SpreadSchema = z.object({
  id: z.string(),
  pages: z.array(PageSchema),
  frames: z.array(FrameSchema),
  transform: MatrixSchema,
});

const MasterSpreadSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  namePrefix: z.string().optional(),
  pages: z.array(PageSchema),
  frames: z.array(FrameSchema),
  transform: MatrixSchema,
});

const AssetSchema = z.object({
  path: z.string(),
  bytes: z.number(),
});

const ParseWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  path: z.string().optional(),
});

/** Zod schema for the full IDML intermediate representation. */
export const DocumentSchema = z.object({
  meta: DocumentMetaSchema,
  spreads: z.array(SpreadSchema),
  masterSpreads: z.array(MasterSpreadSchema),
  stories: z.array(StorySchema),
  swatches: z.array(SwatchSchema),
  fonts: z.array(FontSchema),
  paragraphStyles: z.array(StyleSchema),
  characterStyles: z.array(StyleSchema),
  assets: z.array(AssetSchema),
  warnings: z.array(ParseWarningSchema),
});

/** Parse-and-validate, throwing a `ZodError` on structural mismatch. */
export function validateDocument(value: unknown): Document {
  return DocumentSchema.parse(value) as Document;
}

/** Non-throwing validation, returning a discriminated result. */
export function safeValidateDocument(value: unknown): z.SafeParseReturnType<unknown, Document> {
  return DocumentSchema.safeParse(value) as z.SafeParseReturnType<unknown, Document>;
}

/* ── Compile-time drift guards (never executed) ─────────────────────────── */

function _schemaProducesDocument(value: z.infer<typeof DocumentSchema>): Document {
  return value;
}
function _documentSatisfiesSchema(value: Document): z.infer<typeof DocumentSchema> {
  return value;
}
function _groupChildrenAreFrames(value: z.infer<typeof GroupFrameSchema>): GroupFrame {
  return value;
}
void _schemaProducesDocument;
void _documentSatisfiesSchema;
void _groupChildrenAreFrames;
