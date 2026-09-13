# Desktop GUI (Flavian/Vespasian pattern) — design

Issue: #122. Status: approved 2026-09-12.

## Goal

Ship a cross-platform desktop app that wraps Aurelius's existing CLI workflows so a
less-technical user never touches a terminal, using the same engine, layering, and
commands Flavian and Vespasian already ship. The GUI is a thin orchestration layer: it
invokes the repo's scripts and Claude Code and never reimplements pipeline logic.

Acceptance (from the issue):

- `pnpm gui:dev` launches the app; `pnpm gui:package` builds an installer.
- Each screen drives the existing scripts unchanged.
- README gains the same "Desktop GUI (experimental)" section Flavian and Vespasian have.

## Approach

Fork Vespasian's `packages/gui/` (the proven manifest-driven fork of Flavian's engine),
strip its Wix-site screen, author an Aurelius `ProductManifest` and Aurelius-specific
screen panels, and bump dependencies to Flavian's current (security-swept) versions.
Extracting a shared engine package is the siblings' roadmap stage 4 and is out of scope.

Source of truth for the fork: the local clone at `/home/paul/Repos/Vespasian` (main,
`deb6c1c`). Dependency versions: `/home/paul/Repos/Flavian/packages/gui/package.json`.

## Package

- Path `packages/gui/`, name `@aurelius/gui`, private, `"type": "module"`-free (matches
  siblings), `engines.node >= 22.12.0`.
- Stack: Electron + TypeScript + React 18, electron-vite 5, electron-builder 26, ESLint 9
  flat config (typescript-eslint + react + react-hooks), `node --test` via tsx.
- Identity: bridge `window.aurelius`, IPC channels `aurelius:*`, appId
  `net.pmds.aurelius.gui`, productName `Aurelius`, window title `Aurelius`.
- Root `package.json` scripts: `gui:dev`, `gui:build`, `gui:test`, `gui:lint`,
  `gui:typecheck`, `gui:package` (each `pnpm --filter @aurelius/gui <script>`).
- Version tracks the repo: `.versionrc.json` gains `bumpFiles` for `package.json`,
  `package-lock.json` (kept for parity) and `packages/gui/package.json`, so the Release
  workflow bumps the GUI with every release. Initial GUI version = root version (2.0.0).
- Packaging: `electron-builder.yml` — NSIS / DMG / AppImage, output `packages/gui/dist/`,
  unsigned (`signAndEditExecutable: false`), asar, `files: [out/**]`. The bundle ships
  only the GUI; it operates on an Aurelius checkout on disk.

## Layering (unchanged from the siblings)

| Layer | Path | Rule |
| --- | --- | --- |
| Shared | `src/shared/` | Types, IPC channel constants, the pure-data ProductManifest. |
| Core | `src/core/` | Pure Node/TS, no `electron` import. Process runner, shell resolver, task model, parsers, artifact discovery. Unit-tested. |
| Main | `src/main/` | Electron main; bridges core ⇄ IPC, owns window + settings. |
| Preload | `src/preload/` | `contextBridge` only — exposes typed `window.aurelius`. |
| Renderer | `src/renderer/` | React; talks only to `window.aurelius`. |

The renderer can only call named, typed bridge operations; never an arbitrary command.

### Engine changes (generic, not product-specific)

1. **`runStep(screenId, stepId, vars)`** — one generic bridge method + IPC handler that
   looks up a manifest step, builds its command via `buildCommandSpec`, creates a task,
   and returns `{ taskId }`. Replaces the per-screen `runSite`/`runQa` handlers, which
   were the same code with a hard-coded screen id. `runPrereqCheck`, `runInit` and
   `runPipeline` keep their dedicated handlers because they carry parsed results or
   validation.
2. **Wizard as a bash step.** Vespasian's wizard dynamically imports a repo module and
   runs `apply()` in-process. Aurelius's wizard is `scripts/setup-project.sh`, so the
   wizard step is a `bashScript` descriptor with an `argsTemplate`
   (`['{name}', '--renderer', '{renderer}']`, plus `--dry-run` when previewing). The
   `module` descriptor and `initModuleDir` are removed along with `core/init/run-init.ts`;
   `core/init/init-flags.ts` becomes the pure mapping from `InitInput` to argv, which is
   what gets unit-tested.
3. Removed with the Wix screen: `core/wix/`, `core/project/list-plans.ts`,
   `shared/types/site.ts`, `renderer/components/SitePanel.tsx`, their IPC channels,
   bridge methods and tests. The `fidelityReports` field leaves `QaArtifacts`.

Everything else (task manager, emitter, process runner, shell resolver, command builder,
prereq parser + orchestration, read-artifact sandbox, locate-root, settings, window,
task bridge, LogStream/StatusBadge/ArtifactImage/ProjectGate, hooks) is forked as is,
renamed from `vespasian` to `aurelius` where the identity appears.

## Product manifest (`src/shared/product/aurelius.ts`)

```
id: 'aurelius', displayName: 'Aurelius'
project.markers: ['scripts/setup-project.sh', '.claude/pipeline.config.json']
project.packageName: 'aurelius'
```

Screens and steps (ids reuse the engine's TaskKind vocabulary):

| Screen (`id`) | Step id | Command | Notes |
| --- | --- | --- | --- |
| Prerequisites (`prereq`) | `check` | bashScript `scripts/check-prerequisites.sh` | parser `prereq`, successExitCodes `[0, 1]` |
| | `playwright` | bashScript `scripts/setup-playwright.sh` | "Install Playwright browsers" button; run via `runStep` |
| Setup wizard (`wizard`) | `create` | bashScript `scripts/setup-project.sh` args `['{name}', '--renderer', '{renderer}']` | `--dry-run` appended when `preview` is on |
| Build from Figma (`pipeline`) | `figma` | claude `['-p', '/build-from-figma {figmaUrl}']` | tool prerequisite `claude`; docs link `docs/figma-to-react/README.md` |
| Visual QA (`qa`) | `baselines` | bashScript `scripts/capture-baselines.sh` `['{url}']` | Capture baselines |
| | `regression` | bashScript `scripts/regression-test.sh` `['{url}']` | Pixel-diff vs baselines |
| | `responsive` | bashScript `scripts/check-responsive.sh` `['{url}']` | 5 breakpoints |
| | `dark-mode` | bashScript `scripts/check-dark-mode.sh` `['{url}']` | |
| | `cross-browser` | bashScript `scripts/cross-browser-baseline.sh` `['compare', '{url}']` | non-blocking compare |

Framework choices for the wizard (renderer ids from `renderers/`): `nextjs` (Next.js),
`vite` (Vite), `astro` (Astro), `sveltekit` (SvelteKit), `expo` (Expo). They are declared
in the manifest's wizard `extras` so the panel reads them as data.

Canva, screenshot, conversation and InDesign pipelines are follow-ups (one manifest step
each); `PipelineKind` is `'figma'` only for now.

## New repo script: `scripts/check-prerequisites.sh`

Aurelius has no prerequisite checker today. Add one that prints the sibling format
(`[PASS]`/`[FAIL]`/`[SKIP]`/`[WARN]`/`[INFO]` lines, section headers, `=== Summary ===`,
`Ready to use Aurelius: YES|NO`, exit 0/1/2) so the engine's `prereq` parser and
guidance metadata work unchanged.

- Required: Git ≥ 2.30, Node ≥ 22.12, pnpm ≥ 9, Claude Code.
- Optional: GitHub CLI, jq, Playwright browsers (best-effort cache detection; hint
  `./scripts/setup-playwright.sh`).
- Accounts (INFO only): Figma Dev Mode.
- System: RAM ≥ 4 GB, disk ≥ 5 GB, supported OS.
- No `.env` section (Aurelius needs no credentials).

Documented script count goes from 55 to 56 (CLAUDE.md footer, README/CONTRIBUTING if
they cite it). `check-doc-counts.sh` enforces only agents/skills, so this is manual.

## Screens (renderer panels — product-specific layer)

- **PrereqPanel**: forked; adds the Playwright install button (task-streamed) and
  Aurelius guidance copy in `core/prerequisites/prereq-metadata.ts`.
- **WizardPanel**: rewritten. Fields: project name (validated `^[a-z0-9-]+$`, as
  `create-app.js` does), framework radio (from manifest extras), "Preview only (dry run)"
  checkbox. Runs the wizard step; streams the log; on success shows the created path and
  the next commands (`cd <name> && pnpm install && pnpm dev`).
- **PipelinePanel**: reduced to Figma. URL input with the same validation as the
  siblings (figma.com/file|design URL, optional node-id), Dev-Mode note, docs link,
  streamed log, success/failure states linking to `docs/figma-to-react/README.md` and
  `docs/onboarding/troubleshooting.md`.
- **QaPanel**: rewritten around Aurelius artifacts. App-URL input (default
  `http://localhost:3000`, remembered per session), five step buttons, streamed log,
  then an artifact view: `.claude/visual-qa/regression-report.md`,
  `.claude/visual-qa/cross-browser-report.md` (rendered as text), and PNG galleries for
  `.claude/visual-qa/diffs/regression/`, `.claude/visual-qa/diffs/cross-browser/`,
  `.claude/visual-qa/screenshots/responsive/`, `.claude/visual-qa/screenshots/dark-mode/`
  (directories discovered by `core/qa/discover.ts`; missing dirs are simply empty).
  The artifact reader stays sandboxed to `.claude/visual-qa/`.

## Error handling

- Invalid inputs are rejected in the renderer before a task is created (name regex, URL
  shape); `buildCommandSpec` throws for unknown steps (programming error).
- Missing bash on Windows: the shell resolver's existing error surfaces in the log with
  the Git Bash hint.
- Non-zero exits mark the task failed; the prereq check treats exit 1 as a valid report.
- `openPath` and artifact reads refuse path traversal (forked behaviour).

## Tests

`packages/gui/tests/**/*.test.mts` via `node --test` + tsx, headless:

- Forked: process-runner, async-run, shell-resolver, command-spec (extended for
  `runStep` vars), prereq-parser (against new Aurelius fixtures: all-pass, with-failures,
  with-skips), run-prerequisites, read-artifact, locate-root (Aurelius markers), manifest
  shape.
- New: `init-flags` (InitInput → setup-project argv incl. dry-run), `qa/discover`
  (directory discovery against a temp tree), manifest test asserting every step's script
  exists in the repo (`scripts/…` paths resolve from the workspace root).
- Smoke: `tests/smoke/smoke.mjs` launches the built app under Playwright's Electron
  driver and asserts the project gate renders.

CI: `.github/workflows/gui.yml`, path-filtered to `packages/gui/**`, lockfile, workspace
file and itself. Job `gui`: pnpm 9 via `pnpm/action-setup@v4` (this repo's convention),
Node 22, `ELECTRON_SKIP_BINARY_DOWNLOAD=1` + `--config.side-effects-cache=false`, then
lint → typecheck → test. Job `smoke`: real Electron install, Xvfb, build, smoke.

## Docs

- `docs/GUI.md` — adapted from the siblings (stack, architecture, screens table,
  commands, tests, packaging, first run, requirements, `AURELIUS_BASH` / `AURELIUS_DEBUG`).
- `packages/gui/docs/GUI-PLATFORM.md` — adapted; marks stage 5 ("Add Aurelius") as done.
- README: "Desktop GUI (experimental)" section after Quick Start, mirroring Vespasian's
  wording; docs index entry.
- CLAUDE.md: `packages/gui/` in the tree, `gui:*` commands, script count 56.
- CONTRIBUTING.md: nothing beyond the script count if cited.

## Deferred (follow-ups, not in this PR)

- `gui-release.yml`: build and attach installers on each GitHub Release.
- Canva / screenshot / conversation / InDesign pipeline steps.
- Lighthouse and Storybook steps on the QA screen.
- node-pty interactive sessions (the `PtyRunner` seam is kept).
