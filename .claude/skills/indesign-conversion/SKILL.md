---
name: indesign-conversion
description: Convert an exported Adobe InDesign IDML package or PDF into typed React components, design tokens, and Storybook stories via the @aurelius/pipeline InDesign pipeline. Use when a designer hands you an .idml or .pdf and you need a starting React component set. Keywords: InDesign to React, IDML, PDF to React, indesign pipeline, design tokens from InDesign, brochure to React, print to web, aurelius pipeline indesign
---

# InDesign Conversion

## Overview

This skill drives the InDesign pipeline end to end: it parses an exported **IDML** package or **PDF** into a normalized intermediate representation (IR), maps the styles and swatches to design tokens (a Tailwind preset, `tokens.css`, `tokens.ts`, and a Style Dictionary JSON), and generates typed React components with Storybook stories. It pairs with the `indesign-to-react` agent, which reviews the generation report and proposes follow-ups.

## When to use

- A designer delivered an exported **`.idml`** or **`.pdf`** (the normal handoff) and you want a styled React starting point rather than rebuilding by hand.
- You need design tokens (colors, type scale, spacing) derived directly from the InDesign document.

Do **not** use it for live Figma/Canva designs (use those pipelines) or when you need pixel-perfect reconstruction — this produces a usable, token-driven scaffold for manual refinement.

## Prerequisites

- An exported **`.idml`** (File → Export → InDesign Markup) or a **PDF** exported from InDesign. Source `.indd` files are not supported — export first.
- The `@aurelius/pipeline` package built (`pnpm --filter @aurelius/pipeline build`).
- For best fidelity, prefer IDML when available — it carries named paragraph/character styles and swatches that PDF lacks.

## Expected outputs

Into `<output>` (default `./src/indesign`):

- `*.tsx` — one typed component per spread, plus `*.stories.tsx` and an `index.ts` barrel.
- `tokens/` — `tokens.ts`, `tokens.css`, `tailwind.preset.ts`, `design-tokens.json`.
- `public/indesign/` — extracted images, referenced by the components.
- `indesign-pipeline-report.md` and `indesign-pipeline-report.json` — produced files, staged assets, unmapped frames, and accessibility TODOs.

## Worked example

Using the committed fixture (`tests/fixtures/indesign/sample.idml`):

```bash
pnpm --filter @aurelius/pipeline build
node packages/pipeline/dist/pipeline-cli.js pipeline indesign \
  tests/fixtures/indesign/sample.idml \
  --target react --styling tailwind --output ./out/indesign
```

This writes `out/indesign/Spread1.tsx` (a `<section>` with an `<h1>` heading and an `<img>`), `Spread1.stories.tsx`, `index.ts`, the token files under `out/indesign/tokens/`, and the two reports. The report's **Accessibility TODOs** section will list the hero image's missing alt text — add it before shipping.

Then review and refine:

1. Open `indesign-pipeline-report.md`; address each TODO (alt text, unmapped frames, font fallbacks).
2. Confirm the Tailwind preset is wired into the host project's `tailwind.config.ts` (or, for CSS Modules, that `tokens.css` is imported).
3. Render a story in Storybook to confirm the component mounts.

## Common gotchas

- **CMYK → sRGB shifts.** Print colors are converted to sRGB without ICC profiles; CMYK/Lab swatches may shift and out-of-gamut colors are clamped. Confirm brand colors against the design.
- **Missing / non-embedded fonts.** Print fonts are rarely web fonts; the mapper resolves families by name to a web stack (`config/font-map.json`). Confirm substitutions or supply a `--font-map`.
- **Oversized print images.** Exported images are often print-resolution. Optimize/resize the files in `public/indesign/` for the web.
- **Accessibility gaps.** Every generated `<img>` has an empty `alt`; headings are inferred heuristically. Always do an accessibility pass.
- **PDF reconstruction.** PDFs have no named styles — text frames, columns, and style buckets are inferred from positions and font sizes. Expect to merge/split a few blocks by hand.

## Related

- Agent: `indesign-to-react`.
- Docs: `docs/pipelines/indesign.md`, `docs/pipeline/indesign-pdf-fidelity.md`.
