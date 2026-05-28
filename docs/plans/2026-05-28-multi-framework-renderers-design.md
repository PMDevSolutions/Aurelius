# Multi-Framework Output via Pluggable Renderers

**Date:** 2026-05-28
**Branch:** `18-multi-framework-output-support-nextjs-vite-astro`
**Status:** Design approved

## Goal

Support Next.js, Vite, and Astro output targets by abstracting code generation
into pluggable renderers and adding framework selection configuration.

## Background

The pipeline already separates two axes:

- `outputTarget` — the component *language*: `react`, `vue`, `svelte`, `react-native`
- `framework.type` — the meta-framework: `nextjs-app`, `vite`, `remix`, `sveltekit`, `expo`

Next.js and Vite already exist today, but only as React *sub-templates*
(`framework.type`), with framework knowledge duplicated across intake skills,
token config, TDD scaffolding, Phase-4 dispatch, and orchestration. Astro is
genuinely new and is special: it is a meta-framework that hosts interactive
"islands" of React/Vue/Svelte alongside zero-JS static components.

## Decisions

1. **Renderer axis.** Keep `outputTarget` as the language. Introduce a
   first-class, pluggable `renderer` that owns scaffolding and emission.
2. **Declarative form.** Each renderer is a manifest (`renderer.json`) resolved
   by a registry, mirroring the existing agent-plugin / `pipeline.config.json`
   patterns. Consumers read the manifest instead of hardcoding framework logic.
3. **Registry-first, all frameworks.** Author manifests for all five
   frameworks (`nextjs`, `vite`, `astro`, `sveltekit`, `expo`) so the registry
   is the single source of truth for detection, dispatch, and config. Existing
   converters keep working, resolved via the registry. Only Astro requires a
   net-new template and converter.
4. **Astro = hybrid.** Static/presentational components are zero-JS `.astro`
   files; interactive components are React islands (`.tsx`) with `client:*`
   directives. Pairs with `outputTarget: react`.

## Architecture

### 1. Renderer manifest

New directory: `renderers/<name>/renderer.json`, one per framework. The
`vue`/`svelte`/`react-native` languages are reached *through* their renderers
(e.g. `sveltekit` → language `svelte`).

```jsonc
{
  "name": "nextjs",
  "language": "react",              // outputTarget family
  "detect": {
    "configFiles": ["next.config.*"],
    "dependencies": ["next"],
    "priority": 20                  // higher wins on ambiguous projects
  },
  "template": "templates/nextjs",
  "component": {
    "ext": ".tsx",
    "dir": "src/components",
    "pageRouting": "app-router"     // app-router | pages | file-based | screens
  },
  "test": { "runner": "vitest", "library": "@testing-library/react", "setup": "..." },
  "converter": "figma-react-converter",
  "commands": { "dev": "pnpm dev", "build": "pnpm build", "test": "pnpm vitest run" },
  "phases": { "exclude": [] },      // e.g. expo excludes visual-diff/cross-browser
  "capabilities": { "islands": false, "ssr": true, "darkMode": true }
}
```

Schema: `renderers/renderer.schema.json`.

Registry: `scripts/renderer-registry.js` with `list`, `resolve <name>`, and
`detect [dir]`, mirroring `agent-registry.js`. Validation:
`scripts/validate-renderer.js`, wired into `verify-all` / `ci`.

### 2. Detection & dispatch

- **Detection** replaces the duplicated sniffing in `figma-intake`,
  `canva-intake`, and `screenshot-intake` with one call:
  `node scripts/renderer-registry.js detect [projectDir]`. It walks each
  manifest's `detect` block (config-file globs + `package.json` deps) and
  returns the matching `renderer` + its `language`, or `null`.
  - Match → intake writes `renderer` and `outputTarget` (= `manifest.language`).
  - No match → ask the user; choices generated from the registry (`list`).
    Greenfield React defaults to `vite`.
  - Precedence is data-driven via `detect.priority` (e.g. `nextjs` beats a bare
    `vite.config.*`), making today's implicit ordering explicit.
- **build-spec.json**: add required `renderer` (enum from the registry).
  `outputTarget` stays for back-compat, always derivable from
  `renderer.language`; intake keeps both in sync. `framework.type` is
  deprecated (folded into `renderer`); specs with only `outputTarget` resolve to
  that language's default renderer.
- **Phase-4 dispatch**: the hardcoded `outputTarget → agent` tables in
  `build-from-{figma,canva,screenshot}.md` become `resolve <renderer>` →
  `manifest.converter`. `build-from-canva` (today hardwired to
  `canva-react-converter`) becomes multi-framework for free.
- **Orchestration**: `parallel-orchestration` reads `manifest.phases.exclude`
  instead of branching on `outputTarget === "react-native"`.

### 3. Astro renderer (net-new)

Manifest `renderers/astro/renderer.json`: `language: react`,
`detect.configFiles: ["astro.config.*"]`, `component.ext: ".astro"` with
`islandExt: ".tsx"`, `pageRouting: "file-based"`, `converter: "astro-converter"`,
`capabilities.islands: true`.

New template `templates/astro/`: `astro.config.mjs` (`@astrojs/react` +
`@astrojs/tailwind`), `tsconfig.json`, `tailwind.config`, Vitest config using
the Astro **Container API** (`experimental_AstroContainer`), `package.json`.
Reuses `templates/shared/` for eslint/prettier.

New agent `.claude/agents/astro-converter.md` — the only net-new converter.
Rule, driven by build-spec signals already present:

- Component has `action`, interactive `category`, or `businessLogic` → emit a
  **React island** (`.tsx`, reusing React converter patterns) referenced from
  the page with the right `client:*` directive (`client:load` for
  above-the-fold, `client:visible` for below-the-fold).
- Otherwise → emit a **static `.astro`** component (zero JS), props typed via
  the frontmatter `interface Props`.
- Pages → `src/pages/*.astro` composing both.

**TDD for Astro** (`tdd-from-figma` reads `manifest.test`): React islands →
Vitest + RTL (identical to existing React path); static `.astro` → Vitest +
Astro Container API; page-level interactivity → Playwright E2E (Phase 6).

### 4. Remaining consumers

- **Token config** (`canva-token-inference`, `design-token-lock`): read
  `manifest.template` for the Tailwind config shape and `manifest.language` for
  CSS-var vs NativeWind output. Astro reuses the React/Tailwind path.
- **TDD scaffolding** (`tdd-from-figma`): read `manifest.test`
  (`runner`/`library`/`setup`/`containerApi`) instead of an `outputTarget` map.
- **Visual-diff / responsive / dark-mode / cross-browser**: gated by
  `manifest.phases.exclude` and `manifest.capabilities`. Expo's manifest carries
  the existing react-native skips, now declared once in data.
- **Scaffolding** (`setup-project.sh`): `--next`/`--vite` become
  `--renderer <name>` copying `manifest.template` + `templates/shared/`; old
  flags kept as aliases.
- **Commands**: dev/build/test read `manifest.commands` so Expo
  (`expo start`, `jest`) is not special-cased.
- **pipeline.config.json**: `appTypes` stays (deployment shape is orthogonal);
  add a note that phase inclusion is also filtered by the resolved renderer.

## Testing

- **Unit (Vitest) for `renderer-registry.js`:** `list` returns 5 renderers;
  `resolve` parses a manifest and errors clearly on unknown names; `detect`
  against fixture dirs maps configs → renderer (`astro.config.mjs`→astro,
  `next.config.ts`→nextjs, expo `app.json`→expo, bare `vite.config.ts`→vite,
  `svelte.config.js`→sveltekit, empty→null); precedence fixture with both
  `next.config` and `vite.config` resolves to `nextjs`.
- **Schema validation (`validate-renderer.js`):** every shipped manifest
  validates; `converter` names an existing agent; `template` points to a real
  dir; `language` is one of the four. Wired into `verify-all` / `ci`.
- **Astro converter behavioral check:** `test-fixtures/astro-*.build-spec.json`
  with one interactive + one static component, asserting island→`.tsx`+`client:*`
  and static→`.astro`.
- **Doc-count guard:** adding `astro-converter` bumps agents 53→54; update all
  count references in the same change to keep `check-doc-counts.sh` green.

## File inventory

**New:**
- `renderers/renderer.schema.json`
- `renderers/{nextjs,vite,astro,sveltekit,expo}/renderer.json`
- `templates/astro/` (config, tailwind, vitest+container, package.json)
- `.claude/agents/astro-converter.md`
- `scripts/renderer-registry.js`, `scripts/validate-renderer.js`
- `scripts/__tests__/renderer-registry.test.*` + detection fixtures
- `.claude/test-fixtures/astro-*.build-spec.json`
- `docs/multi-framework/renderers.md`

**Modified:**
- 3 intake skills (detection + write `renderer` + registry-sourced choices)
- `build-from-{figma,canva,screenshot}.md` (registry-driven dispatch)
- `parallel-orchestration` (`manifest.phases.exclude`)
- `tdd-from-figma`, `canva-token-inference`, `design-token-lock` (read manifest)
- `setup-project.sh` (`--renderer`)
- `verify-all.sh` / `ci` (add `validate-renderer`)
- build-spec schema/examples (add `renderer`, deprecate `framework.type`)
- Docs + count bumps (`CLAUDE.md`, `README.md`, `docs/multi-framework/README.md`)

## Rollout (incremental, each independently verifiable)

1. Schema + registry + validation + tests (no behavior change).
2. Author all 5 manifests; wire `validate-renderer` into CI.
3. Migrate detection (intake skills) → registry.
4. Migrate dispatch + orchestration + token/TDD consumers.
5. Astro template + `astro-converter` + Astro fixtures/tests.
6. Docs + count sync.

## Backward compatibility

Specs with only `outputTarget` still resolve (→ that language's default
renderer). `framework.type` is honored as a hint during a deprecation window.
