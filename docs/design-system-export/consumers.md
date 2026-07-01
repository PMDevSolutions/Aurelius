# Design System Export — Consumers & Round-Trip Contract

`/export-design-system` turns a project's `design-tokens.lock.json` + components
into a publishable pnpm workspace (see the `export-design-system` skill for the
full output layout). This document defines **what a downstream project imports**
and the **round-trip guarantee** that makes the export a reliable interchange.

## The interchange contract

The exported `@scope/design-tokens` package ships four token artifacts. Two are
lossless reconstructions of the source lockfile; two are derived, ergonomic
_views_:

| Artifact | Contents | Lossless? | Use it for |
|----------|----------|-----------|------------|
| `tokens.json` | verbatim JSON snapshot of `design-tokens.lock.json` | **Yes** | machine interchange, re-import, custom tooling |
| `tokens.ts` | `export const tokens = <lockfile> as const` | **Yes** | typed, tree-shakeable access in TS/JS consumers |
| `tokens.css` | flattened `--color-* / --space-* / --radius-*` custom properties | No | drop-in theming for web UIs |
| `tailwind-preset.ts` | `{ colors, spacing, borderRadius, fontFamily }` subset | No | extend a consumer's Tailwind config |

**`tokens.json` is the canonical interchange.** It is a byte-for-byte snapshot of
the lockfile, so any consumer that reads it sees exactly the tokens the design
system was locked to. `tokens.css` and `tailwind-preset.ts` are one-way
projections — they intentionally drop structure (nested color scales, typography
families, `textContent`, `rgb`/`tailwind` metadata) and therefore **cannot** be
reversed back into a lockfile.

## Round-trip guarantee

`import-design-tokens` is the inverse of the exporter and the reference consumer.
It reads the lossless `tokens.json` and reconstructs an identical
`design-tokens.lock.json`:

```
lock ──/export-design-system──▶ @scope/design-tokens ──import-design-tokens──▶ lock′
                                                                     lock′ ≡ lock
```

```bash
# Reconstruct a lockfile from an exported workspace
./scripts/import-design-tokens.sh --from dist/design-system --out design-tokens.lock.json

# From a published/installed package, or a raw tokens.json path
./scripts/import-design-tokens.sh --from node_modules/@acme/design-tokens/dist/tokens.json --out -

# Verify a round-trip in CI (exit 0 when identical, 1 when it drifts)
./scripts/import-design-tokens.sh --from dist/design-system --verify src/styles/design-tokens.lock.json
```

The `--verify` mode is the executable form of the guarantee: it fails loudly if an
export ever stops being a faithful representation of its source tokens. The
automated proof lives in `scripts/__tests__/design-system-roundtrip.test.js`
(tokens → export → reimport → deep-equal).

`--from` accepts an export root, a `design-tokens` package directory, or a
`tokens.json` file directly. It probes, in order:
`packages/design-tokens/src/tokens.json` → `.../dist/tokens.json` →
`src/tokens.json` → `dist/tokens.json` → `tokens.json`.

## Consumers

### Aurelius (self-consumer)

Aurelius re-imports its own export to move a locked design system between
projects, or to validate that a hand-edited token package still round-trips. This
is the `import-design-tokens` path above.

### Flavian — WordPress / FSE `theme.json`

[Flavian](https://github.com/PMDevSolutions/Flavian) is a Claude Code-integrated
WordPress framework. A block theme's design surface is `theme.json`, so the
consumer installs the tokens package and maps `tokens.json` into
`theme.json.settings`:

| Lockfile section | `theme.json` target |
|------------------|---------------------|
| `colors.semantic.<k>.hex` (fallback `colors.primitives`) | `settings.color.palette[]` — `{ slug, color, name }` |
| `typography.families.<k>` (`value` + `fallback`) | `settings.typography.fontFamilies[]` — `{ slug, fontFamily, name }` |
| `spacing.scale.<k>.px` | `settings.spacing.spacingSizes[]` — `{ slug, size: "<px>px", name }` |
| `borderRadius.<k>.px` | `settings.custom.radius.<k>` → emits `--wp--custom--radius--<k>` |

Example adapter (run in the theme's build step):

```js
// scripts/tokens-to-theme-json.mjs
import { readFileSync, writeFileSync } from "node:fs";
// From the installed package: @acme/design-tokens/tokens.json
import tokens from "@acme/design-tokens/tokens.json" with { type: "json" };

const palette = Object.entries(tokens.colors?.semantic ?? {}).map(([slug, v]) => ({
  slug,
  color: v.hex,
  name: slug.replace(/(^|-)\w/g, (m) => m.toUpperCase().replace("-", " ")),
}));

const fontFamilies = Object.entries(tokens.typography?.families ?? {}).map(([slug, v]) => ({
  slug,
  fontFamily: [v.value, v.fallback].filter(Boolean).join(", "),
  name: slug,
}));

const spacingSizes = Object.entries(tokens.spacing?.scale ?? {}).map(([slug, v]) => ({
  slug,
  size: `${v.px}px`,
  name: slug,
}));

const radius = Object.fromEntries(
  Object.entries(tokens.borderRadius ?? {}).map(([k, v]) => [k, `${v.px}px`]),
);

const themeJson = {
  version: 3,
  settings: {
    color: { palette },
    typography: { fontFamilies },
    spacing: { spacingSizes },
    custom: { radius },
  },
};

writeFileSync("theme.json", JSON.stringify(themeJson, null, 2) + "\n");
```

Bumping the tokens package version (via Changesets) and re-running the adapter is
all that is needed to propagate a token change into the theme.

### Nerva — Hono / Cloudflare Workers backend

[Nerva](https://github.com/PMDevSolutions/Nerva) is a Claude Code-integrated API
framework (Hono, Cloudflare Workers, Drizzle ORM). Backends need tokens for
server-rendered surfaces — transactional emails, PDFs, or a design-tokens API —
where CSS is not available. The consumer imports the **typed** tokens, which are
tree-shakeable and require no runtime CSS:

```ts
import { Hono } from "hono";
import { tokens, type Tokens } from "@acme/design-tokens"; // typed, from tokens.ts

const app = new Hono();

// Serve the canonical tokens to any client (mobile app, docs site, design tool)
app.get("/design-tokens", (c) => c.json(tokens));

// Or use tokens directly when rendering an email template server-side
function emailButton(label: string) {
  const primary = tokens.colors.semantic.primary.hex;
  const radius = tokens.borderRadius.md.px;
  return `<a style="background:${primary};border-radius:${radius}px;color:#fff">${label}</a>`;
}

export default app;
```

Because `@acme/design-tokens` is framework-agnostic and side-effect free (apart
from the optional `tokens.css`), it bundles cleanly into a Workers runtime.

## Style Dictionary

`tokens.json` is a plain nested map, so a consumer that standardizes on
[Style Dictionary](https://styledictionary.com/) can register it as a custom
source and run its own transforms. Aurelius does **not** require a Style
Dictionary build step — it ships ready-to-use CSS variables, a typed TS export,
and a Tailwind preset directly — but nothing prevents layering Style Dictionary on
top of the lossless `tokens.json`.

## Reference

- Exporter: `scripts/export-design-system.js` (skill: `export-design-system`, command: `/export-design-system`)
- Re-importer: `scripts/import-design-tokens.js` / `scripts/import-design-tokens.sh`
- Round-trip test: `scripts/__tests__/design-system-roundtrip.test.js`
- Lockfile source of truth: `design-token-lock` skill → `design-tokens.lock.json`
