# InDesign PDF Ingestion — Fidelity Guide

PDF is a **first-class input** to the InDesign-to-React pipeline, on equal footing
with IDML. Designers routinely hand engineering an exported PDF rather than a
source `.indd`/`.idml`, so the pipeline treats PDF as a normal, supported route.

A PDF is a _presentation_ format: it positions glyphs and draws shapes, but it
does not carry named paragraph styles, logical text frames, or a swatch palette.
The parser therefore **reconstructs** structure heuristically. This guide
documents what is read directly versus inferred, and the fidelity warnings the
parser emits so downstream stages and humans know which is which.

> We do **not** aim for pixel-perfect reconstruction from PDF. The goal is a
> usable, styled IR the component generator can turn into React with manual
> touch-ups. When both an IDML and a PDF are available, prefer IDML — it carries
> richer style metadata. Force the PDF path with `--source-priority pdf` to
> verify parity.

## Read vs. inferred

| Aspect          | Source                                   | Confidence |
| --------------- | ---------------------------------------- | ---------- |
| Text content    | Glyph runs (`getTextContent`)            | High       |
| Positions/sizes | Text matrices + media box                | High       |
| Fill/stroke colors | Operator list                         | High       |
| Embedded images | Image XObjects (decoded to PNG)          | High       |
| Text frames     | Positional clustering of runs            | Inferred   |
| Columns         | Horizontal-gap + left-edge clustering    | Inferred   |
| Heading/body/caption | Font-size buckets                   | Inferred   |
| Swatch palette  | Clustered fill/stroke + image colors     | Inferred   |
| Fonts           | Font names (rarely embedded)             | Name only  |

Geometry is converted from PDF points to pixels at a configurable DPI (default
96) and flipped from PDF's bottom-left origin to the IR's top-left origin.

## Fidelity warnings

All warnings are collected on `document.warnings` and surfaced in CLI output.

| Code | Meaning | What to do |
| ---- | ------- | ---------- |
| `TEXT_FROM_GLYPHS` | Text was reconstructed from positioned glyph runs; line/paragraph grouping is heuristic. | Review long-form copy and paragraph boundaries. |
| `NO_EMBEDDED_FONTS` | Fonts are referenced by name, not embedded. The mapper resolves them via `config/font-map.json` with web fallbacks. | Confirm the mapped web fonts, or supply a `--font-map`. |
| `VECTOR_ONLY_PAGE` | A page has no extractable text (outlined type or pure vector art). | Provide IDML, or re-export the PDF without outlining text. |
| `MULTI_COLUMN_DETECTED` | The page was reconstructed as multiple columns. | Verify column boundaries and reading order. |
| `IMAGE_NOT_EXTRACTED` | An image was detected but not written (no `--assets` dir, or an unsupported pixel layout). | Pass `--assets <dir>` to extract images. |

## Known limitations

- **Per-run text color** is not correlated back to individual runs; colors feed
  the swatch palette, and frames carry bounds rather than inline fills.
- **Outlined text** (type converted to vector paths) is invisible to text
  extraction and surfaces as `VECTOR_ONLY_PAGE`.
- **Reading order** across complex, overlapping layouts is approximate.
- **Spacing tokens** are derived from style metadata (absent in PDF), so the PDF
  path emits little or no spacing scale; supply IDML for a richer spacing scale.

## Parity with IDML

The same InDesign document exported to both IDML and PDF should produce IRs whose
page count, frame count, and detected style buckets agree within these
tolerances:

- **Page count:** exact.
- **Frame count:** ± a small margin (PDF clustering may merge/split blocks).
- **Style buckets:** both detect a heading bucket larger than the body bucket;
  exact sizes may differ by sub-pixel rounding and font-metric differences.

Use `--source-priority pdf` against a document that also has an IDML to compare
the two paths.
