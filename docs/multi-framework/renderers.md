# Renderers

A **renderer** is a pluggable description of a meta-framework (Next.js, Vite,
SvelteKit, Expo, Astro, ...). Each renderer lives in its own directory under
`renderers/<name>/` with a `renderer.json` manifest. The manifest is the single
source of truth for how the pipeline scaffolds, builds, tests, and converts
into that framework.

## The three-axis model

The pipeline separates three concerns that older specs conflated into a single
`framework.type` field:

| Axis | `build-spec.json` field | What it answers | Examples |
|------|-------------------------|-----------------|----------|
| **Language** | `outputTarget` | What language/component model does generated code use? | `react`, `vue`, `svelte`, `react-native` |
| **Renderer** | `renderer` | Which pluggable meta-framework renders that language? | `nextjs`, `vite`, `sveltekit`, `expo`, `astro` |
| **App type** | `appType` | What deployment shape is being produced? | `web-app`, `chrome-extension`, `pwa`, `mobile-app` |

These axes are independent. The same `outputTarget` (`react`) is served by
several renderers (`nextjs`, `vite`, `astro`); the same renderer can target
multiple app types. `outputTarget` is always **derivable from** the renderer —
it equals the resolved renderer's `language` — so the `renderer` field is
authoritative and `outputTarget` is retained for back-compat and convenience.

```
appType      ── deployment shape  (web-app | chrome-extension | pwa | mobile-app)
   │
renderer     ── pluggable meta-framework  (nextjs | vite | sveltekit | expo | astro)
   │
outputTarget ── language / component model  (react | vue | svelte | react-native)
                = the renderer's `language`
```

## Manifest field reference

Every `renderers/<name>/renderer.json` is validated against
`renderers/renderer.schema.json` (JSON Schema 2020-12, `additionalProperties:
false`). Fields:

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `name` | string | yes | Unique renderer id; **must equal the directory basename**. |
| `language` | enum | yes | One of `react`, `vue`, `svelte`, `react-native`. Becomes the resolved `outputTarget`. |
| `detect.configFiles` | string[] | yes | Glob strings matched against project file **basenames** (e.g. `next.config.*`). |
| `detect.dependencies` | string[] | yes | Package names matched against the project's `dependencies`/`devDependencies`. |
| `detect.priority` | integer | no (default `0`) | Higher wins when multiple renderers match; ties broken by name ascending. |
| `template` | string | yes | Path (relative to repo root) to the starter template dir, e.g. `templates/astro`. |
| `component.ext` | string | yes | Primary component file extension, e.g. `.tsx`, `.svelte`, `.astro`. |
| `component.islandExt` | string | no | Extension for interactive islands when the renderer is hybrid (Astro: `.tsx`). |
| `component.dir` | string | no | Conventional component directory, e.g. `src/components`. |
| `component.pageRouting` | enum | no | `app-router`, `pages`, `file-based`, or `screens`. |
| `test.runner` | string | yes | Test runner, e.g. `vitest`, `jest`. |
| `test.library` | string | yes | Testing library, e.g. `@testing-library/react`. |
| `test.setup` | string | no | Optional test setup file. |
| `test.containerApi` | boolean | no | `true` when statics are tested via a container API (Astro Container API). |
| `converter` | string | yes | Converter **agent** name; an agent file must exist at `.claude/agents/<converter>.md`. |
| `commands.dev` / `.build` / `.test` | string | yes | Canonical dev/build/test commands. |
| `phases.exclude` | string[] | no | Pipeline phases this renderer skips (e.g. Expo excludes `cross-browser`, `responsive`). |
| `capabilities.islands` / `.ssr` / `.darkMode` | boolean | no | Feature flags the pipeline uses to gate work. |

### Example manifest (Astro)

```json
{
  "name": "astro",
  "language": "react",
  "detect": { "configFiles": ["astro.config.*"], "dependencies": ["astro"], "priority": 10 },
  "template": "templates/astro",
  "component": { "ext": ".astro", "islandExt": ".tsx", "dir": "src/components", "pageRouting": "file-based" },
  "test": { "runner": "vitest", "library": "@testing-library/react", "containerApi": true },
  "converter": "astro-converter",
  "commands": { "dev": "pnpm dev", "build": "pnpm build", "test": "pnpm vitest run" },
  "capabilities": { "islands": true, "ssr": true, "darkMode": true }
}
```

## The registry CLI

`scripts/renderer-registry.js` is a read-only query surface over the manifests.
It never mutates state.

```bash
# List available renderers (name + language)
node scripts/renderer-registry.js list [--json]

# Print one renderer's full manifest
node scripts/renderer-registry.js resolve <name> [--json]

# Detect which renderer matches a project directory
node scripts/renderer-registry.js detect [<projectDir>] [--json]
```

- **`list`** — emits `{ renderers: [{ name, language }] }`, sorted by name.
- **`resolve <name>`** — emits the full manifest, or exits `2` with
  `unknown renderer` for an unknown name.
- **`detect <dir>`** — ranks renderers by `detect.priority` (ties by name),
  matches a renderer if any `configFiles` glob hits a file basename **or** any
  `dependencies` entry appears in the project's deps/devDeps, and emits
  `{ renderer, language }` (or `{ renderer: null }` for a greenfield dir).

Exit codes: `0` ok · `1` invalid/validation failure · `2` usage / unknown
name / IO error. `--renderers-root <dir>` overrides the renderers root (used by
tests).

### Validation

`scripts/validate-renderer.js` validates a manifest against the schema **plus**
cross-reference checks the schema cannot express:

```bash
node scripts/validate-renderer.js --dir renderers/<name> [--json]
node scripts/validate-renderer.js --all [--renderers-root <dir>] [--json]
```

It verifies that: the manifest passes the JSON Schema; `name` matches the
directory basename; `language` is one of the four supported values; the
`template` path exists; and `converter` names an existing agent at
`.claude/agents/<converter>.md`. Exit `0` valid · `1` invalid · `2` usage/IO.

`validate-renderer.js --all` is wired into `verify-all` via
`scripts/verify-renderers.sh`, so any renderer added under `renderers/` is
validated automatically:

```bash
./scripts/verify-all.sh --include renderers
```

## Back-compat: `outputTarget`-only specs

A `build-spec.json` carrying only `outputTarget` (no `renderer`) resolves to
that language's **default renderer**:

| `outputTarget` | Default renderer |
|----------------|------------------|
| `react` | `vite` |
| `svelte` | `sveltekit` |
| `react-native` | `expo` |
| `vue` | _(no renderer yet — future/unsupported)_ |

When both fields are present, `renderer` wins. The legacy `framework.type`
field is deprecated and folded into `renderer`.

## Worked example: the Astro hybrid model

Astro is the clearest illustration of why renderer and `outputTarget` are
distinct axes. Its `language`/`outputTarget` is `react`, but it renders that
React in a **hybrid islands** model rather than a single-page React app:

- **Static `.astro` components** (`component.ext` = `.astro`) — zero-JS,
  presentational. Props are typed via a frontmatter `interface Props`. Tested
  with the **Astro Container API** (`test.containerApi: true`).
- **React islands** (`component.islandExt` = `.tsx`) — interactive components,
  referenced from a page with a `client:*` directive (`client:load` above the
  fold, `client:visible` below). Tested with **Vitest +
  @testing-library/react**, the standard React path.

The `astro-converter` agent classifies each component from `build-spec.json`: a
component with an `action`, an interactive `category`, or any `businessLogic`
involvement becomes a React island; everything else becomes a static `.astro`
file. So a single Astro build spec produces both `react`-language islands and
`.astro` statics — one renderer, one `outputTarget`, two component models — which
a flat `framework.type` field could never express.

(See `.claude/test-fixtures/astro-hybrid.build-spec.json` for a fixture that
declares `renderer: "astro"`, `outputTarget: "react"`, `appType: "web-app"`,
and carries one island and one static component.)

## How to add a renderer

1. **Author the manifest directory.** Create `renderers/<name>/renderer.json`
   with all required fields. Set `name` to `<name>` (it must match the
   directory). Pick a sensible `detect.priority` relative to existing renderers.
2. **Add a template.** Create `templates/<name>/` (or point `template` at an
   existing one) with the starter config the scaffold should copy. Shared config
   lives in `templates/shared/`.
3. **Set the converter agent.** Point `converter` at an agent file that exists
   at `.claude/agents/<converter>.md` (create the agent if needed).
4. **Validate.** Run
   `node scripts/validate-renderer.js --dir renderers/<name>` and fix any
   reported issues (name mismatch, missing template/agent, schema errors).
5. **It's wired into verify-all automatically.** `validate-renderer.js --all`
   runs under `./scripts/verify-all.sh --include renderers`, and
   `setup-project.sh --renderer <name>` plus the intake skills pick the new
   renderer up from the registry with no further code changes.

## Related documentation

- [Multi-framework output overview](./README.md)
- `renderers/renderer.schema.json` — the manifest JSON Schema
- `scripts/renderer-registry.js` / `scripts/validate-renderer.js` — registry CLI + validator
- `docs/figma-to-react/README.md` — Figma conversion pipeline
