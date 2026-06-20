# @aurelius/pipeline

Core library for the Aurelius design-to-code pipeline. It reads Adobe InDesign
sources — both `.idml` packages and exported `.pdf` files — into a single
normalized, typed intermediate representation (IR), and maps that IR to a
coherent **design-token set** (`tokens.ts`, `tokens.css`, a Tailwind preset, and
a Style Dictionary JSON).

> Part of the [InDesign-to-React pipeline](../../docs/indesign-to-react/README.md)
> epic. Shipped so far: the IDML parser + IR, the PDF parser (same IR), and the
> design-token mapper. The React component generator is next.

## Designer hands you a PDF

A designer's normal handoff is a PDF, not an `.idml`. Point the pipeline at it:

```bash
pnpm --filter @aurelius/pipeline build
# PDF → IR → design tokens, extracting embedded images to ./public/assets
node packages/pipeline/dist/indesign/cli.js brochure.pdf \
  --emit-tokens ./src/tokens --assets ./public/assets
```

PDF and IDML are **both first-class inputs**; the CLI auto-detects by extension.
IDML is preferred when available (richer style metadata), but the pipeline never
assumes it. See the [PDF fidelity guide](../../docs/pipeline/indesign-pdf-fidelity.md).

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

## PDF input

The PDF parser produces the **same IR**, so the mapper and generator are
source-agnostic. It clusters positioned glyph runs into text frames, infers
heading/body/caption buckets from font sizes, derives a swatch palette from fills
and image colors, and extracts embedded images to PNG.

```ts
import { parsePdfFile } from "@aurelius/pipeline/pdf";
import { parseSourceFile } from "@aurelius/pipeline";

// Directly…
const { document, warnings } = await parsePdfFile("brochure.pdf", {
  assetDir: "public/assets", // extract embedded images here
});

// …or source-agnostically (auto-detects .idml vs .pdf; force with sourcePriority).
const result = await parseSourceFile("brochure.pdf", { sourcePriority: "pdf" });
```

Because PDF is a presentation format, structure is reconstructed heuristically and
the parser emits fidelity warnings (`TEXT_FROM_GLYPHS`, `NO_EMBEDDED_FONTS`,
`VECTOR_ONLY_PAGE`, …). See the
[PDF fidelity guide](../../docs/pipeline/indesign-pdf-fidelity.md).

## Design tokens

Map the IR to a framework-agnostic token set and emit it in four formats:

```ts
import { parseIdmlFile } from "@aurelius/pipeline/indesign";
import { mapDocumentToTokens, emitAll } from "@aurelius/pipeline/tokens";

const { document } = parseIdmlFile("brochure.idml");
const { tokens, typography, fonts, warnings } = mapDocumentToTokens(document, {
  grid: 4, // spacing quantization (px)
  // fontMap: { "Trade Gothic": ["Trade Gothic", "Oswald", "sans-serif"] },
});

// { "tokens.ts", "tokens.css", "tailwind.preset.ts", "design-tokens.json" }
const files = emitAll(tokens);
```

The mapper:

- **Colors** — every swatch with a resolvable hex becomes a palette token,
  de-duplicated within a configurable sRGB tolerance; CMYK/Lab colors outside the
  sRGB gamut are flagged.
- **Typography** — paragraph styles are clustered into a heading / body / caption
  scale (largest sizes become the top heading levels), preserving InDesign names.
  Sizes, line heights, and letter spacing share aligned token keys.
- **Spacing** — paragraph spacing and indents are quantized to a grid (default
  4px) and named on a t-shirt scale.
- **Fonts** — families resolve to web font stacks via
  [`config/font-map.json`](config/font-map.json) (override per call with
  `fontMap`); unmapped families fall back to a generic stack and emit a warning.

`tokens.ts` is emitted self-contained (`as const`) so it type-checks anywhere;
the token shape is also published as the zod `DesignTokensSchema`.

## CLI

The package ships an `aurelius-indesign` binary (built to `dist/indesign/cli.js`):

```bash
# Human-readable summary + warnings
node dist/indesign/cli.js brochure.idml

# Full IR as JSON (warnings summary goes to stderr so stdout stays pipeable)
node dist/indesign/cli.js brochure.idml --json --pretty > ir.json

# Map the IR to design tokens and write the four artifacts into a directory
node dist/indesign/cli.js brochure.idml --emit-tokens ./src/tokens

# Options
#   --json               emit the IR as JSON on stdout
#   --pretty             pretty-print JSON
#   --dpi <number>       pixel conversion DPI (default 96)
#   --no-validate        skip zod validation of the produced IR
#   --emit-tokens <dir>  map the IR to tokens and write the four artifacts
#   --no-tailwind        with --emit-tokens, skip tailwind.preset.ts
#   --font-map <file>    JSON file of font fallback overrides
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
- Spacing tokens are derived from paragraph spacing and indents; page margins and
  inter-frame gutters are not yet mined from layout geometry.
```
