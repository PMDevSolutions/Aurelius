# InDesign-to-React Pipeline

Convert Adobe InDesign designs (brochures, pitch decks, editorial layouts) into
typed React components, design tokens, and assets — a print-first sibling to the
Figma/Canva/Screenshot pipelines.

> **Status:** in progress. This document tracks the epic and details the shipped
> stages — the **IDML parser + IR**, the **PDF parser** (same IR), the **style &
> design-token mapper**, and the **React component generator**.
> See the epic for the full plan: _Add InDesign-to-React conversion pipeline_.

## Pipeline shape (target)

```
.idml ──▶ [1] IDML parser ──▶ IR ──▶ [2] style/token mapper ──▶ tokens.ts + Tailwind preset
 .pdf ──▶ [1b] PDF parser ──▶ IR ──┘                      └──▶ [3] component generator ──▶ *.tsx + Storybook
```

Both inputs are **first-class** and converge on a single normalized **IR**, so
every later stage is source-agnostic. IDML is preferred when available (richer
style metadata), but the pipeline never assumes it — designers most often hand
engineering a PDF.

## Stage 1 — IDML parser and IR (shipped)

Implemented in [`packages/pipeline/src/indesign`](../../packages/pipeline/src/indesign).

An `.idml` file is a zip package of XML documents. The parser:

1. **Unzips and validates** the package: `mimetype`, `designmap.xml`, and the
   `Resources/`, `Stories/`, `Spreads/`, `MasterSpreads/` it references.
2. **Parses** stories (text + paragraph/character style references), spreads
   (frames, positions, transforms), master spreads, swatches, fonts, and
   linked/embedded images.
3. **Resolves cross-references** — `TextFrame.ParentStory` → `Story.Self`, and
   image links → bundled asset paths inside the package.
4. **Normalizes units** to pixels at a configurable DPI (default 96).
5. **Emits a typed IR** validated by a zod schema.
6. **Collects parse warnings** for unsupported features without aborting.

### Intermediate representation

The canonical types live in
[`packages/pipeline/src/indesign/ir.ts`](../../packages/pipeline/src/indesign/ir.ts):

`Document` → `{ meta, spreads[], masterSpreads[], stories[], swatches[], fonts[], paragraphStyles[], characterStyles[], assets[], warnings[] }`

- **`Spread` / `MasterSpread`** → `pages[]` + `frames[]` (+ transform)
- **`Page`** → pixel `bounds` + raw `geometricBounds` + transform
- **`Frame`** = `TextFrame` | `ImageFrame` | `GraphicFrame` | `GroupFrame`
  - `TextFrame.storyId` links to a `Story`; threading via `next/previousFrameId`
  - `ImageFrame.image` (`ImageRef`) resolves `linkUri` to an in-package `resolvedPath`
  - `GroupFrame.children` nest recursively
- **`Story`** → `paragraphs[]` (`runs[]`) + `plainText` + distinct applied style refs
- **`Swatch`** → color/tint/gradient with computed `hex`/`rgb` where convertible
- **`Style`** → paragraph/character style with normalized `pointSize`/`leading`
  (px) plus a `raw` passthrough of every source attribute for the mapper

### Warnings vs. errors

Recoverable problems are accumulated on `document.warnings` (each with a stable
`code`, `severity`, `message`, and source `path`) and surfaced by the CLI; they
never abort parsing. Codes include `MIMETYPE_MISMATCH`, `MISSING_RESOURCE_FILE`,
`UNRESOLVED_LINK`, `MISSING_PARENT_STORY`, `UNSUPPORTED_PAGE_ITEM`,
`MALFORMED_XML`, and `EMPTY_GEOMETRY`.

Only unrecoverable conditions (not a zip, missing `designmap.xml`) throw an
`IdmlParseError`.

### Try it

```bash
pnpm --filter @aurelius/pipeline build
node packages/pipeline/dist/indesign/cli.js your-design.idml          # summary + warnings
node packages/pipeline/dist/indesign/cli.js your-design.idml --json   # full IR as JSON
```

See the [package README](../../packages/pipeline/README.md) for the library API,
options, and known limitations.

## Stage 1b — PDF parser (shipped)

Implemented in [`packages/pipeline/src/pdf`](../../packages/pipeline/src/pdf). PDF
is a **first-class input** — the artifact designers actually deliver. The parser
(via `pdfjs-dist`) produces the same IR as the IDML path:

1. **Extracts** text runs (positions, sizes, fonts), fill/stroke colors, and
   embedded images from each page.
2. **Clusters** runs → lines → columns → text frames, inferring heading / body /
   caption buckets from font sizes (synthesized as paragraph styles).
3. **Derives** a swatch palette from fills and dominant image colors.
4. **Extracts** embedded images to PNG (with `--assets <dir>`).
5. **Flips** PDF's bottom-left coordinates to the IR's top-left pixel space.
6. **Surfaces fidelity warnings** for what was inferred vs. read.

```bash
# The CLI auto-detects .pdf vs .idml; --source-priority forces a path.
node packages/pipeline/dist/indesign/cli.js brochure.pdf --emit-tokens ./src/tokens --assets ./public/assets
```

Fidelity caveats and warning codes are documented in the
[PDF fidelity guide](../pipeline/indesign-pdf-fidelity.md).

## Stage 2 — Style & design-token mapper (shipped)

Implemented in [`packages/pipeline/src/tokens`](../../packages/pipeline/src/tokens).
Maps the IR (from either input) to a coherent design-token set:

- **Colors** — swatches → an sRGB hex palette, de-duplicated within a configurable
  tolerance; CMYK/Lab colors outside the sRGB gamut are warned about.
- **Typography** — paragraph styles clustered into a heading / body / caption
  scale, preserving InDesign names; sizes, line heights, and letter spacing emitted
  under aligned token keys.
- **Spacing** — paragraph spacing and indents quantized to a grid (default 4px).
- **Fonts** — families mapped to web font stacks via `config/font-map.json`
  (override per call); unmapped families fall back generically and warn.

It emits four artifacts — `tokens.ts` (typed, self-contained `as const`),
`tokens.css` (`:root` custom properties), `tailwind.preset.ts` (a Tailwind v3+
preset), and `design-tokens.json` (Style Dictionary compatible):

```bash
node packages/pipeline/dist/indesign/cli.js your-design.idml --emit-tokens ./src/tokens
```

Font fallbacks and out-of-gamut conversions are listed in the generator report.

## Stage 3 — React component generator (shipped)

Implemented in [`packages/pipeline/src/react`](../../packages/pipeline/src/react).
Turns the IR + tokens into importable React artifacts — one `.tsx` per spread:

- **Frames → JSX** — text frames become semantic tags (`h1`–`h6` / `p` /
  `figcaption`) inferred from the paragraph-style role; image frames become
  `<img>` or `next/image`; layout is a token-spaced flow (grid for multi-column).
- **Typed props** — explicit `…Props` for every extracted content field, with the
  extracted text / image `src` as defaults, so consumers override content while
  keeping layout.
- **Two styling modes** — Tailwind classes that resolve via the mapper's preset,
  or CSS Modules referencing the `tokens.css` custom properties.
- **Storybook stories** per component, populated with the extracted content.
- **Generation report** (`indesign-pipeline-report.md`) listing produced files,
  staged assets, unmapped IR nodes, and accessibility TODOs.

Generated components are deterministic and pass `tsc --noEmit` under strict React
JSX (verified in CI for Tailwind, CSS Modules, and Next.js targets).

```bash
node packages/pipeline/dist/indesign/cli.js brochure.idml \
  --emit-components ./src/components --style tailwind --framework react
```

## Roadmap (remaining sub-issues)

- [ ] `indesign-to-react` Claude Code agent + skill + end-to-end CLI command

## References

- [Adobe IDML File Format Specification](https://www.adobe.com/devnet/indesign/documentation.html)
- [PDF.js (`pdfjs-dist`)](https://mozilla.github.io/pdf.js/)
```
