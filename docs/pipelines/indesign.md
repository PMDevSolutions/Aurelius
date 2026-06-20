# InDesign → React Pipeline

Convert Adobe InDesign designs — brochures, pitch decks, editorial layouts — into
typed React components, design tokens, and Storybook stories. InDesign joins
Figma and Canva as a first-class Aurelius design-to-code source.

Both inputs designers actually deliver are **first-class**:

- **IDML** (`.idml`) — preferred. Carries named paragraph/character styles,
  swatches, fonts, frames, and master pages.
- **PDF** (`.pdf`) — the most common real-world handoff. Structure is
  reconstructed heuristically (see [PDF fidelity](./../pipeline/indesign-pdf-fidelity.md)).

> We do not aim for pixel-perfect reconstruction. The goal is a usable, styled,
> token-driven scaffold that the React generator produces and a developer
> refines.

## Quick start

```bash
pnpm --filter @aurelius/pipeline build

# Designer handed you a PDF (or an IDML) — generate a React project:
node packages/pipeline/dist/pipeline-cli.js pipeline indesign brochure.pdf \
  --target react --styling tailwind --output ./src/indesign
```

Or drive it conversationally with the **`indesign-to-react` agent** (it runs the
pipeline on a feature branch and proposes follow-ups from the report).

## Exporting from InDesign

**IDML (preferred):** `File → Export…`, choose **InDesign Markup (IDML)**. This
is a zip of XML with full style/swatch/frame metadata.

**PDF:** `File → Export…`, choose **Adobe PDF**. For the best text extraction,
**do not outline/flatten text** (outlined type becomes vector paths with no
extractable text). Embed or keep standard fonts; keep images at a reasonable
resolution.

## Output

Into `<output>` (default `./src/indesign`):

| Path | Contents |
| ---- | -------- |
| `*.tsx` | One typed component per spread |
| `*.stories.tsx` | A Storybook story per component, with extracted content as default args |
| `index.ts` | Barrel re-exporting every component |
| `tokens/` | `tokens.ts`, `tokens.css`, `tailwind.preset.ts`, `design-tokens.json` |
| `public/indesign/` | Extracted images referenced by the components |
| `indesign-pipeline-report.md` / `.json` | Files, assets, unmapped frames, a11y TODOs |

Components carry typed props (`heading?`, `body?`, `image?`, …) defaulted to the
extracted content, so you override content while keeping layout.

## CLI

```
aurelius pipeline indesign <file.idml | file.pdf> [options]

  --target <fw>     next | vite | astro | react   (default react)
  --styling <mode>  tailwind | css-modules         (default tailwind)
  --output <dir>    output directory               (default ./src/indesign)
  --json            print the machine-readable JSON report on stdout
  -h, --help        show usage
```

Defaults are read from `aurelius.config.json` (`{ "indesign": { "target",
"styling", "output" } }`) when present; explicit flags win.

## Fidelity expectations

- **Layout** is a semantic, token-spaced flow (flex column; grid for multi-column),
  not absolute pixel positioning.
- **Colors** convert CMYK/Lab/RGB to sRGB without ICC profiles; out-of-gamut
  colors are clamped and flagged.
- **Fonts** are resolved by name to web stacks; print fonts are rarely web fonts.
- **PDF** specifically reconstructs text frames, columns, and heading/body/caption
  buckets heuristically — see the [PDF fidelity guide](./../pipeline/indesign-pdf-fidelity.md).

## Accessibility checklist

Generated components are a starting point — always run an accessibility pass:

- [ ] Add real `alt` text to every `<img>` (the generator emits empty `alt`); mark
      decorative images `alt=""`.
- [ ] Verify heading order (`h1` → `h2` → …); the role→tag inference is heuristic.
- [ ] Confirm color contrast after the CMYK→sRGB conversion.
- [ ] Replace any `figcaption` not associated with a `figure` where appropriate.
- [ ] Check that reconstructed reading order matches the intended order.

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `VECTOR_ONLY_PAGE` warning, no text | Text was outlined in the PDF, or the page is pure vector art. Re-export the PDF without outlining text, or provide the IDML. |
| Wrong fonts in the output | `NO_EMBEDDED_FONTS` — confirm the mapped web stack or pass `--font-map`. |
| Colors look off | CMYK/Lab → sRGB shift; confirm brand colors against the design. |
| Images missing | Pass `--output` so images extract to `public/indesign/`, and move that folder into your project's `public/`. |
| Components don't pick up tokens | Wire `tokens/tailwind.preset.ts` into your `tailwind.config.ts`, or import `tokens/tokens.css` for the CSS Modules path. |

## See also

- [PDF fidelity guide](./../pipeline/indesign-pdf-fidelity.md)
- Agent: `.claude/agents/indesign-to-react.md`
- Skill: `.claude/skills/indesign-conversion/SKILL.md`
- Package: [`@aurelius/pipeline`](../../packages/pipeline/README.md)
