# InDesign-to-React Pipeline

Convert Adobe InDesign designs (brochures, pitch decks, editorial layouts) into
typed React components, design tokens, and assets — a print-first sibling to the
Figma/Canva/Screenshot pipelines.

> **Status:** in progress. This document tracks the epic and details the shipped
> stages — the **IDML parser + IR** and the **style & design-token mapper**.
> See the epic for the full plan: _Add InDesign-to-React conversion pipeline_.

## Pipeline shape (target)

```
.idml ──▶ [1] IDML parser ──▶ IR ──▶ [2] style/token mapper ──▶ tokens.ts + Tailwind preset
 .pdf ──▶ [1b] PDF fallback ─▶ IR ──┘                      └──▶ [3] component generator ──▶ *.tsx + Storybook
```

Both inputs converge on a single normalized **IR**, so every later stage is input
agnostic. The IDML path (this stage) is the primary, high-fidelity route; a PDF
fallback is a separate sub-issue.

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

## Roadmap (remaining sub-issues)

- [ ] PDF fallback parser and layout reconstruction (emits the same IR)
- [ ] React component generator (TSX output, optional Tailwind/CSS Modules,
      Storybook stories)
- [ ] `indesign-to-react` Claude Code agent + skill + end-to-end CLI command

## References

- [Adobe IDML File Format Specification](https://www.adobe.com/devnet/indesign/documentation.html)
```
