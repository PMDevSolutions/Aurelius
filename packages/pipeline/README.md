# @aurelius/pipeline

Core library for the Aurelius design-to-code pipeline. The first stage shipped
here is the **InDesign IDML parser**, which reads Adobe InDesign Markup Language
(`.idml`) packages and emits a normalized, typed intermediate representation
(IR) that downstream stages (style/token mapper, component generator) consume.

> Part of the [InDesign-to-React pipeline](../../docs/indesign-to-react/README.md)
> epic. This package currently implements the foundational parser + IR only.

## Install / build

```bash
pnpm install
pnpm --filter @aurelius/pipeline build      # tsc → dist/
pnpm --filter @aurelius/pipeline test       # vitest
pnpm --filter @aurelius/pipeline typecheck  # tsc --noEmit
```

## Library usage

```ts
import { parseIdmlFile, parseIdml } from "@aurelius/pipeline/indesign";

// From a file path…
const { document, warnings } = parseIdmlFile("brochure.idml", { dpi: 96 });

// …or from an in-memory buffer (e.g. an upload).
const result = parseIdml(uint8Array);

console.log(document.swatches); // every color / tint / gradient
console.log(document.fonts); // every font
console.log(document.paragraphStyles, document.characterStyles);
console.log(document.spreads[0].frames); // text / image / graphic / group frames
console.log(warnings); // non-fatal issues (unsupported features, unresolved links)
```

The IR is fully described by the TypeScript types in
[`src/indesign/ir.ts`](src/indesign/ir.ts) and validated at runtime by the zod
schema in [`src/indesign/schema.ts`](src/indesign/schema.ts):

```ts
import { DocumentSchema, validateDocument } from "@aurelius/pipeline/indesign";

DocumentSchema.safeParse(document).success; // true for any parser output
const validated = validateDocument(document); // throws ZodError on mismatch
```

### What the IR covers

| Area    | IR types                                              |
| ------- | ----------------------------------------------------- |
| Layout  | `Document`, `Spread`, `MasterSpread`, `Page`          |
| Frames  | `Frame` = `TextFrame` \| `ImageFrame` \| `GraphicFrame` \| `GroupFrame` |
| Content | `Story`, `Paragraph`, `TextRun`                       |
| Design  | `Swatch`, `Font`, `Style` (paragraph + character)     |
| Assets  | `Asset`, `ImageRef` (resolved to in-package paths)    |

All geometry is normalized from IDML points to **pixels** at a configurable DPI
(default 96): `px = pt × dpi / 72`. Transform translation is converted to pixels;
scale/shear components are preserved.

## CLI

The package ships an `aurelius-indesign` binary (built to `dist/indesign/cli.js`):

```bash
# Human-readable summary + warnings
node dist/indesign/cli.js brochure.idml

# Full IR as JSON (warnings summary goes to stderr so stdout stays pipeable)
node dist/indesign/cli.js brochure.idml --json --pretty > ir.json

# Options
#   --json          emit the IR as JSON on stdout
#   --pretty        pretty-print JSON
#   --dpi <number>  pixel conversion DPI (default 96)
#   --no-validate   skip zod validation of the produced IR
```

Example report:

```
InDesign IDML → IR
  source:        brochure.idml
  IDML version:  16.0
  DPI:           96
  mimetype:      valid

Counts
  spreads:           1
  master spreads:    1
  pages:             2
  frames:            3 (text: 1, image: 1, graphic: 1, group: 0)
  stories:           1
  swatches:          6
  fonts:             3
  paragraph styles:  3
  character styles:  2
  assets:            1

Warnings (1)
  [warning] UNRESOLVED_LINK: Image link "file:Links/logo.ai" does not resolve … (Spreads/Spread_ub6.xml)
```

## Error handling

- **Recoverable** issues (unsupported page items, unresolved image links, dangling
  story references, malformed sub-documents) are collected on `document.warnings`
  and never abort the parse.
- **Unrecoverable** conditions (input is not a zip, missing `designmap.xml`) throw
  an `IdmlParseError` with a stable `code`.

## Known limitations

- Forced line breaks (`<Br/>`) interleaved with text runs are not order-preserved;
  paragraph boundaries are exact.
- Color conversion is a deterministic approximation (no ICC profiles). CMYK, RGB,
  Lab (D50), and Gray spaces are supported; others are recorded without a hex value.
- Frame bounds are axis-aligned bounding boxes in spread (pasteboard) coordinates.
```
