# GUI platform — Aurelius on the shared engine (Trajan)

`@aurelius/gui` is the third product on the desktop-GUI engine that began as
**Flavian**'s shell (hard-wired to the WordPress toolchain) and was forked into
**Vespasian** through the manifest seam described here. Aurelius took the same fork:
one `ProductManifest` (`src/shared/product/aurelius.ts`) plus bespoke per-screen panels,
on the unchanged engine. The engine is evolving into a generic shell that renders **any
PMDS framework** from a typed descriptor; the unified app that ships all of them is
**Trajan**.

This doc is a pointer for that work, not a spec. It describes the three-layer
architecture the codebase follows and the staged plan it serves.

## Three layers

1. **Shared engine** — generic machinery that knows nothing about any product:
   the task model (`src/core/task`), process running (`src/core/process`,
   `src/core/shell`), the IPC handlers (`src/main/ipc`), the React shell + reusable
   components/hooks (`src/renderer`), and the manifest interpreters
   (`src/core/product/command-spec.ts`, `src/core/product/parsers.ts`). A new product
   does not change this layer.

2. **Per-product manifest** — one pure-data `ProductManifest`
   (`src/shared/product/manifest.ts`) that declares **what a product exposes**:
   identity, project-detection markers, and the screens → steps → (command, parser,
   prerequisites, extras) catalog. The Aurelius manifest is
   `src/shared/product/aurelius.ts`. It speaks the engine's vocabulary — `TaskKind`,
   `QaStepId`, `PipelineKind` — and is node-free + serializable so the sandboxed renderer,
   main, and preload can all import it. The active product is chosen in
   `src/shared/product/index.ts` (`activeManifest`); main injects it into
   `registerHandlers`, and the renderer shell reads its brand + nav from it.

3. **Per-product specifics** — the bespoke React panels
   (`src/renderer/components/*Panel.tsx`). Each is a custom UI for one screen; it reads
   its *step catalog* (which steps exist, their labels, the wizard's framework list, the
   pipeline's docs links) from the manifest while keeping its product-specific layout.

The dependency rule: layer 1 reads layer 2; layer 2 is data; layer 3 reads layer 2.
Nothing in layers 1/3 hard-codes a product's scripts, screens, or identity.

## Adding a product (the extension point)

A further product is *only another manifest* — no engine/core/renderer change:

1. author `src/shared/product/<product>.ts` (another `ProductManifest`);
2. register it in `src/shared/product/index.ts` → `PRODUCTS`;
3. point `ACTIVE_PRODUCT_ID` at it (or, under Trajan, select per-product at runtime).

## Staged plan

1. **Ship Flavian** — the original hard-wired desktop app. ✅
2. **Manifest seam** — extract the implicit catalog into an explicit
   `ProductManifest`; make the engine render from it with zero behaviour change. ✅
3. **Prove reuse by forking (Vespasian)** — a Wix-retargeted manifest and rewritten
   panels on the same engine. ✅
4. **Extract the engine** — split the generic layer out so products can be packaged
   independently of any one of them. ◀ **next**
5. **Add Aurelius / Nerva** — further manifests, validating the engine across products.
   Aurelius ✅ (this repo); Nerva pending.
6. **Ship Trajan** — one app that selects a product at runtime and renders any of them.

## What the Aurelius fork changed in the engine

Two generic additions, both product-neutral:

- **`runStep(screenId, stepId, vars)`** — one bridge method + IPC handler that runs any
  manifest step (used by the QA buttons and the Playwright installer). It replaced the
  per-screen `runSite`/`runQa` handlers, which were the same code with a hard-coded
  screen id.
- **`fillTemplate` drops empty placeholder-only args** — a template part that is exactly
  `{name}` with an empty value is omitted, so optional flags (`{dryRun}` →
  `--dry-run` | `''`) never produce a stray `''` argument.

And one removal: the `module` command descriptor (Flavian/Vespasian import their init
wizard in-process). Aurelius's wizard is a shell script, so it is a plain `bashScript`
step; a product that needs in-process modules would reintroduce the descriptor in layer 1.

## Scope notes

- **Bridge / IPC namespace** — this build exposes `window.aurelius` and `aurelius:*`
  channels. Trajan will keep a single product-neutral bridge, so a rename to a neutral
  namespace remains on the table.
- **Build identity** — the package name (`@aurelius/gui`), window title, appId and
  installer name say "Aurelius". These identify *this build*, analogous to
  `ACTIVE_PRODUCT_ID`, and change when Trajan packaging lands.
- **Interactive terminal steps** — the `PtyRunner` stub in `core/process` is the reserved
  seam for running interactive `claude` sessions in-app later.

## Map

| Concern | File |
| --- | --- |
| Manifest type | `src/shared/product/manifest.ts` |
| Aurelius manifest | `src/shared/product/aurelius.ts` |
| Registry + active product + selectors | `src/shared/product/index.ts` |
| Command interpreter | `src/core/product/command-spec.ts` |
| Output-parser registry | `src/core/product/parsers.ts` |
| Generic step channel | `src/main/ipc/register-handlers.ts` (`IPC.stepRun`), `src/renderer/hooks/useStep.ts` |
| Manifest injection point | `src/main/index.ts`, `src/main/ipc/register-handlers.ts` |
| Shell reads brand + nav | `src/renderer/App.tsx` |
