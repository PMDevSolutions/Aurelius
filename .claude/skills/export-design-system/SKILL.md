---
name: export-design-system
description: Exports generated components + design-tokens.lock.json as a publishable pnpm workspace. Generates a framework-agnostic tokens package and a framework-specific component library (React/Vue/Svelte via Vite library mode, React Native via tsc). Includes Tailwind preset, ThemeProvider, Changesets versioning, and a properly configured exports map. Keywords: design system export, component library, npm package, vite lib mode, tailwind preset, changesets, monorepo, publishable
---

# Export Design System — Publishable Component Library Generator

## Purpose

Take generated components and a `design-tokens.lock.json` and emit a versioned, publishable pnpm workspace:

- **`@scope/design-tokens`** — framework-agnostic. Ships CSS custom properties, a typed token export, a Tailwind preset, and a JSON snapshot of the lockfile. Anyone (web app, RN app, Storybook, docs site) can consume it.
- **`@scope/<framework>-components`** — framework-specific. Ships compiled components, a `ThemeProvider` + `useTheme`, and proper peer dependencies. React/Vue/Svelte build with **Vite library mode**; React Native uses `tsc` (Vite is not part of the RN runtime).

The tokens package is the bridge — every component package depends on it via `workspace:^`, so updating tokens cascades through every framework target.

## When to Use

- After a successful `/build-from-figma`, `/build-from-canva`, or `/build-from-screenshot` run, when you want to extract the result as a reusable library rather than ship the full app.
- When a design system needs to be published to a private npm registry or installed across multiple consumer apps.
- When migrating from a single-app codebase to a shared component package.

This skill is **not** part of the autonomous build pipeline — it is invoked on demand via `/export-design-system`.

## Inputs

- **Required:**
  - `design-tokens.lock.json` (auto-detected at `src/styles/design-tokens.lock.json` or `design-tokens.lock.json`)
  - At least one component file under `src/components/` (or override with `--components-dir`)
- **Optional:**
  - `build-spec.json` (auto-detected at `.claude/plans/build-spec.json` or `build-spec.json`) — read for `outputTarget`. If absent, framework is inferred from `package.json` deps or supplied via `--framework`.
  - `--scope <name>` — npm scope. Defaults to the existing `package.json` scope, or `@my-app`.
  - `--output <dir>` — where to write the workspace. Default: `dist/design-system/`.

## Outputs

A complete pnpm workspace at `<output>/`:

```
<output>/
├── package.json                # workspace root with pnpm scripts and changesets
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .changeset/                 # versioning config
├── .npmrc, .gitignore
├── README.md
└── packages/
    ├── design-tokens/
    │   ├── package.json        # exports map for ".", "./tokens.css", "./tailwind-preset"
    │   ├── tsconfig.json
    │   ├── vite.config.ts      # vite lib mode
    │   ├── README.md
    │   └── src/
    │       ├── index.ts        # barrel
    │       ├── tokens.ts       # typed token export
    │       ├── tokens.css      # CSS custom properties
    │       ├── tokens.json     # raw lockfile snapshot
    │       └── tailwind-preset.ts
    └── <framework>-components/
        ├── package.json        # peerDeps: react|vue|svelte; depends on design-tokens via workspace:^
        ├── tsconfig.json
        ├── vite.config.ts      # vite lib mode (or omitted for react-native)
        ├── README.md
        └── src/
            ├── index.ts        # barrel re-exports ThemeProvider + every component
            ├── components/     # copied from project, tests/stories/types stripped
            └── theme/
                └── ThemeProvider.{tsx,ts,svelte}
```

## Process

### Step 1: Detection

Auto-detect inputs in this order:
- `lockfile`: `src/styles/design-tokens.lock.json` → `design-tokens.lock.json`
- `buildSpec`: `.claude/plans/build-spec.json` → `build-spec.json`
- `componentsDir`: `src/components` → `components` → `src/lib/components`
- `framework`: `buildSpec.outputTarget` → `package.json` deps fallback

Refuse with a clear error if lockfile is missing or framework cannot be determined.

### Step 2: Workspace scaffolding

Write the workspace root files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.changeset/`, `.npmrc`, `.gitignore`, `README.md`.

`tsconfig.base.json` enables `strict`, `isolatedModules`, `bundler` resolution. Both packages extend it.

### Step 3: Tokens package

Generate `packages/design-tokens/`:
- `tokens.ts` — typed `tokens` constant from the lockfile (`as const` for inference).
- `tokens.css` — `:root { --color-...: ...; --space-...; --radius-...; }` derived from lockfile.
- `tokens.json` — verbatim copy of the lockfile.
- `tailwind-preset.ts` — Tailwind preset that consumers extend; pulls colors, spacing, radii, fontFamily from the lockfile.
- `vite.config.ts` — Vite lib mode with `vite-plugin-dts` for declaration rollup. Two entries: `index` and `tailwind-preset`.
- `package.json` — declares `exports` map for `.`, `./tokens.css`, `./tailwind-preset`, `./tokens.json`. `sideEffects: ["./dist/tokens.css"]`.

### Step 4: Components package

Generate `packages/<framework>-components/`:
- Copy components from the source project into `src/components/`, **excluding** `*.test.*`, `*.spec.*`, `*.stories.*`, and `*.d.ts` files (filter by extension matching the framework: `.tsx`/`.ts` for React/RN, `.vue`/`.ts` for Vue, `.svelte`/`.ts` for Svelte).
- Generate `theme/ThemeProvider.{tsx,ts,svelte}` with framework-idiomatic context API and a `useTheme` hook.
- Generate `src/index.ts` barrel that re-exports `ThemeProvider`, `useTheme`, and every detected component.
- Generate `vite.config.ts` (Vite lib mode) for React/Vue/Svelte. Externalize the framework runtime (`react`, `react-dom`, `react/jsx-runtime`; `vue`; `svelte`, `svelte/internal`).
- Generate `package.json` with `peerDependencies` for the framework, `dependencies: { @scope/design-tokens: workspace:^ }`, proper `exports` map, `sideEffects` including CSS.
- For `react-native`: skip `vite.config.ts`, use `tsc -p tsconfig.json` for build, set `peerDependencies` to react + react-native. Add a clear note in the README.

### Step 5: Versioning

If `--no-changesets` is not set, scaffold `.changeset/config.json` with sensible defaults (commit: false, access: public, baseBranch: main). Workspace root scripts: `pnpm changeset`, `pnpm version`, `pnpm release`.

### Step 6: Report

Emit a summary (text or JSON via `--json`):
- Framework + scope + output path
- Package names
- Component count and files copied
- Total files written
- Next steps: `pnpm install && pnpm build`

## Invocation

Direct script (the slash command wraps this):

```bash
node scripts/export-design-system.js [options]

# or via wrapper:
./scripts/export-design-system.sh [options]
```

Common flag combinations:

```bash
# Use detected outputTarget, default scope, default output dir
./scripts/export-design-system.sh

# Override scope and pick custom output
./scripts/export-design-system.sh --scope @acme --output packages/

# Dry-run to preview
./scripts/export-design-system.sh --dry-run

# Force overwrite of existing output
./scripts/export-design-system.sh --force

# Skip Storybook scaffolding and Changesets
./scripts/export-design-system.sh --no-storybook --no-changesets

# Machine-readable
./scripts/export-design-system.sh --json
```

## Error Recovery

- **No `design-tokens.lock.json`** → exit 2. Run the relevant build pipeline (`/build-from-figma`, etc.) first to produce a lockfile.
- **Cannot detect framework** → exit 2. Pass `--framework <react|vue|svelte|react-native>` or set `outputTarget` in `build-spec.json`.
- **Output directory exists** → exit 1. Either pass `--force` to overwrite, or pick a different `--output`.
- **Unsupported framework** → exit 3. Only `react`, `vue`, `svelte`, `react-native` are supported.

## Constraints & Gotchas

- **Vite lib mode does not apply to React Native.** RN apps run on Metro and have their own JSX/runtime concerns. The script falls back to `tsc -p tsconfig.json` for RN. Documented in the generated README.
- **Tokens are a snapshot.** Re-running this skill regenerates the token package from the current lockfile. Bump versions via Changesets when the lockfile changes.
- **Peer dependencies are conservative.** React peer is `^18.0.0 || ^19.0.0`. Vue is `^3.4.0`. Svelte is `^5.0.0`. Adjust per-package after generation if your consumers require narrower ranges.
- **The script does not run `pnpm install` or `pnpm build`.** It only writes files. The user runs install/build to verify the workspace.
- **Component file filtering is conservative.** `*.test.*`, `*.spec.*`, `*.stories.*`, `*.d.ts` are excluded. Co-located CSS modules and helper files with matching framework extensions ARE included.

## Reference

- Script: `scripts/export-design-system.js`
- Wrapper: `scripts/export-design-system.sh`
- Slash command: `/export-design-system`
- Inputs: `design-tokens.lock.json` (from `design-token-lock` skill), `build-spec.json` (from `figma-intake`/`canva-intake`/`screenshot-intake` skills)
