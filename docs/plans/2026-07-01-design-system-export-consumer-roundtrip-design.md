# Design System Export — Consumer Contract & Round-Trip

**Issue:** #82 — Design system export command (`/export-design-system`)
**Date:** 2026-07-01
**Milestone:** v2.0.0

## Problem

`/export-design-system`, `scripts/export-design-system.{js,sh}`, and the
`export-design-system` skill already ship on `main` (acceptance criteria #1 and
#2). Two gaps remain from the v2.0.0 scope:

- **#3 — a defined consumer.** The export is produced but nothing documents how a
  downstream project ingests it. Sibling frameworks
  [Flavian](https://github.com/PMDevSolutions/Flavian) (WordPress/FSE) and
  [Nerva](https://github.com/PMDevSolutions/Nerva) (Hono + Cloudflare Workers) are
  the named consumers.
- **#4 — a round-trip guarantee.** Nothing proves the export is a faithful,
  reversible representation of the source tokens.

## Key insight: which artifact round-trips

The exported `@scope/design-tokens` package ships four token artifacts:

| Artifact | Contents | Lossless? |
|----------|----------|-----------|
| `tokens.json` | `JSON.stringify(lockfile)` — verbatim snapshot | **Yes** |
| `tokens.ts` | `export const tokens = <lockfile> as const` | **Yes** |
| `tokens.css` | flattened `--color/--space/--radius` custom properties | No (drops `typography`, `textContent`, `rgb`/`tailwind` metadata, nesting) |
| `tailwind-preset.ts` | `{colors, spacing, borderRadius, fontFamily}` subset | No |

The lockfile is a rich nested object (`colors.primitives`/`colors.semantic`,
`typography.families`, `spacing.scale`, `borderRadius`, `textContent`, plus
`version`/`figmaFileKey`/`figmaLastModified` metadata). Only `tokens.json` and
`tokens.ts` preserve it fully. **`tokens.json` is therefore the canonical lossless
interchange**; `tokens.css`/`tailwind-preset.ts` are derived, consumer-facing
*views*, never the source of truth for a re-import.

## Solution

### 1. Reimporter — `scripts/import-design-tokens.js` (+ `.sh` wrapper)

The inverse of the exporter and the first concrete consumer. Reads an exported
tokens package and reconstructs a `design-tokens.lock.json`.

**CLI**

```
node scripts/import-design-tokens.js [options]
  --from <path>     export root, tokens package dir, or a tokens.json file
                    (default: dist/design-system — matches the exporter default)
  --out <path>      where to write the reconstructed lockfile
                    (default: design-tokens.lock.json; use "-" for stdout)
  --verify <path>   compare the reconstructed lockfile against a reference
                    lockfile; exit 0 if identical, 1 if not (no file written)
  --force           overwrite --out if it exists
  --json            machine-readable summary
  -h, --help
```

**`--from` resolution order** (first match wins): a `*.json` file used directly;
otherwise a directory is probed at `packages/design-tokens/src/tokens.json` →
`packages/design-tokens/dist/tokens.json` → `src/tokens.json` →
`dist/tokens.json` → `tokens.json`.

**Behavior:** parse `tokens.json`; reject input that is not a token lockfile
(must contain at least one of `colors`/`typography`/`spacing`/`borderRadius`);
then either `--verify` (deep-equal vs reference) or write the lockfile
(refusing to clobber `--out` without `--force`).

**Exit codes** mirror the exporter: `0` ok, `1` output exists / verify mismatch,
`2` no tokens.json found under `--from`, `3` input is not a token lockfile.

### 2. Round-trip test — `scripts/__tests__/design-system-roundtrip.test.js`

Vitest, driving the real scripts via `execFileSync`:

1. Write a rich fixture `design-tokens.lock.json` (every top-level section).
2. Export: `export-design-system.js --lockfile <fixture> --framework react --output <tmp> --force`.
3. Assert `<tmp>/packages/design-tokens/src/tokens.json` deep-equals the fixture.
4. Reimport: `import-design-tokens.js --from <tmp> --out <tmp>/reimported.lock.json`.
5. **Deep-equal the reimported lockfile against the original** — the core guarantee.
6. `--verify` returns exit 0 for the matching lockfile, non-zero for a mutated one.
7. Import directly from a `tokens.json` path also round-trips.

### 3. Consumer documentation — `docs/design-system-export/consumers.md`

- The interchange contract: `tokens.json` is lossless and stable; `tokens.css` /
  `tailwind-preset.ts` / typed `tokens.ts` are the ergonomic views.
- **Aurelius** (self-consumer): the reimporter + the round-trip guarantee.
- **Flavian** (WordPress/FSE): `pnpm add @scope/design-tokens`, then map
  `tokens.json` → `theme.json` (`settings.color.palette`,
  `settings.typography.fontFamilies`, `settings.spacing.spacingSizes`) with a
  documented mapping table and an example adapter snippet.
- **Nerva** (Hono/Workers): `import { tokens } from '@scope/design-tokens'` for
  typed, tree-shakeable tokens in backend/email/PDF theming; example.
- Style Dictionary note: `tokens.json` is a plain nested map and can be fed to
  Style Dictionary as a custom source if a consumer prefers that toolchain — we
  do not require it.

### 4. Wiring

- `export-design-system` skill + `/export-design-system` command: add a
  "Re-importing / round-trip" section pointing at the reimporter and the doc.
- `CLAUDE.md` + `README.md`: document the new script; bump the manual script count.

## Out of scope (YAGNI)

- Generating consumer-specific adapter files (e.g. emitting `theme.json`) — the
  export→adapter mapping is *documented* with example snippets, not generated.
- Reconstructing a lockfile from lossy `tokens.css` — impossible to do faithfully;
  `tokens.json` is the interchange.

## Files

| File | Action |
|------|--------|
| `scripts/import-design-tokens.js` | Create — reimporter |
| `scripts/import-design-tokens.sh` | Create — thin wrapper |
| `scripts/__tests__/design-system-roundtrip.test.js` | Create — round-trip test |
| `docs/design-system-export/consumers.md` | Create — consumer contract + Flavian/Nerva |
| `.claude/skills/export-design-system/SKILL.md` | Update — round-trip/reimport section |
| `.claude/commands/export-design-system.md` | Update — reference reimport + round-trip |
| `CLAUDE.md`, `README.md` | Update — script docs + counts |
