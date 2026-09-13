# Aurelius Desktop GUI

A cross-platform desktop app that wraps Aurelius's existing CLI workflows — the
prerequisite check, the project scaffolder, the autonomous Figma-to-app pipeline, and the
visual-QA scripts — so a designer or less-technical user can go from "design in" to
"tested app out" without touching a terminal.

> **Status:** experimental. It ships the orchestration core plus four screens:
> **Prerequisites**, **Setup wizard**, **Build from Figma**, and **Visual QA**, with
> packaging config in place. It is the same engine and pattern Flavian and Vespasian
> ship (see [`packages/gui/docs/GUI-PLATFORM.md`](../packages/gui/docs/GUI-PLATFORM.md)).

The GUI is a **thin orchestration layer**: it invokes the repo's existing scripts
(`scripts/check-prerequisites.sh`, `scripts/setup-project.sh`, the visual-QA scripts) and
Claude Code (`claude -p "/build-from-figma …"`) — it does **not** reimplement any pipeline
logic.

## Stack

- **Electron + TypeScript + React**, built with [electron-vite](https://electron-vite.org/)
  and packaged with electron-builder.
- Lives as a workspace package at `packages/gui/` (`@aurelius/gui`).
- The Electron **main process is Node.js**, so it runs the repo's scripts directly with
  the same arguments a terminal user would pass.

## Architecture

A hard layering boundary keeps the orchestration logic testable without launching Electron:

| Layer | Path | Rule |
| --- | --- | --- |
| Shared | `src/shared/` | Types + IPC channel constants + the pure-data ProductManifest; imported by both sides. |
| Core | `src/core/` | **Pure Node/TS, no `electron` import.** Process spawning, the shell resolver, the task model, output parsing, artifact discovery. Unit-tested. |
| Main | `src/main/` | Electron main; imports core, bridges core events ⇄ IPC, owns the window. |
| Preload | `src/preload/` | `contextBridge` only — exposes the typed `window.aurelius` bridge. |
| Renderer | `src/renderer/` | React; talks only to `window.aurelius`. |

The renderer can only invoke named, typed operations on the bridge — never an arbitrary
command. Everything product-specific (project markers, screens, step commands, links,
docs paths, the wizard's framework list) lives in one declarative manifest —
`src/shared/product/aurelius.ts`. Script-backed buttons go through one generic
`runStep(screen, step, vars)` channel; the prerequisite check, the wizard and the pipeline
keep dedicated channels because they carry parsed results or validation.

### Process layer

`ProcessRunner` spawns a command (`child_process`, no `shell:true`), streams stdout/stderr
as structured events, reports the exit code, and is cancellable. A cross-platform
**shell resolver** finds a POSIX `bash` (Git Bash on Windows, excluding the WSL
`System32\bash.exe`) to run the repo's `.sh` scripts; `node`/`pnpm`/`claude` are invoked
directly. A `PtyRunner` stub reserves the seam for node-pty (interactive `claude`
sessions later).

## Screens

| Screen | What it does | Wraps |
| --- | --- | --- |
| **Prerequisites** | Runs the prereq check and shows a pass/fail/warn checklist with actionable guidance (Git, Node 22.12+, pnpm 9+, Claude Code; optional GitHub CLI, jq, Playwright browsers). Warnings never block. An **Install Playwright browsers** button runs the setup script and re-checks. | `scripts/check-prerequisites.sh`, `scripts/setup-playwright.sh` |
| **Setup wizard** | Pick a project name and a framework (Next.js, Vite, Astro, SvelteKit, Expo), optionally **Preview only**; streams the scaffold log and shows the next commands (`cd <name> && pnpm install && pnpm dev`). Input is validated before anything runs. | `scripts/setup-project.sh <name> --renderer <id> [--dry-run]` |
| **Build from Figma** | Validates a Figma file URL (Dev Mode) and runs the autonomous pipeline — intake, token lock, TDD, build, visual diff, E2E, quality gate, report — in a headless Claude Code session, streaming progress with running/success/failure states and links to the pipeline guide and troubleshooting FAQ. | `claude -p "/build-from-figma <url>"` |
| **Visual QA** | Takes the running app's URL and offers five steps: **Capture baselines**, **Run regression** (pixel diff), **Check responsive**, **Check dark mode**, **Compare browsers**; then renders the reports and PNG galleries the scripts wrote under `.claude/visual-qa/`. | `capture-baselines.sh`, `regression-test.sh`, `check-responsive.sh`, `check-dark-mode.sh`, `cross-browser-baseline.sh compare` |

Canva, screenshot, conversation and InDesign pipelines, plus Lighthouse and Storybook QA
steps, are follow-ups — each is one more step in the manifest.

## Commands

From the repo root:

```bash
pnpm gui:dev         # launch the app in development (Vite HMR)
pnpm gui:build       # build main/preload/renderer bundles
pnpm gui:test        # run the core unit tests (headless, no Electron window)
pnpm gui:lint        # ESLint (flat config: TypeScript + React)
pnpm gui:typecheck   # type-check main + renderer
pnpm gui:package     # build + produce an installer via electron-builder
```

Or from `packages/gui/`: `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm typecheck`.

## Tests

The orchestration core is covered by `node --test` (via `tsx`) under
`packages/gui/tests/` — process runner, shell resolver, prerequisite parser (against
fixtures of the real script output), prerequisite orchestration, command building from the
manifest, wizard argument mapping, pipeline launch, QA artifact discovery, sandboxed
artifact reads, project-root detection, and the manifest shape (including that every
script it names exists in the repo). CI (`.github/workflows/gui.yml`) runs
**lint → typecheck → tests** headless, and a separate job builds the app and launches it
under Xvfb (`tests/smoke/smoke.mjs`) to assert the shell renders. Linting is ESLint 9 flat
config (`eslint.config.mjs`): typescript-eslint for all `.ts`/`.tsx`/`.mts`, plus
React + React-Hooks rules for the renderer. Type-checking stays in `tsc`.

## Packaging & distribution

```bash
pnpm gui:package   # electron-vite build && electron-builder
```

Config: `packages/gui/electron-builder.yml` (targets: NSIS on Windows, DMG on macOS,
AppImage on Linux; output to `packages/gui/dist/`). Windows produces
`dist/Aurelius Setup <version>.exe` (installer) plus a runnable `dist/win-unpacked/`.

Builds are **unsigned** (`signAndEditExecutable: false`) so `gui:package` works on a stock
Windows without elevated privileges. electron-builder's code-signing toolchain
(`winCodeSign`) ships macOS symlinks that Windows can't extract without Developer Mode or
an elevated shell, so it 404s the build — disabling signing sidesteps it entirely. For a
**signed release**, supply a certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`), remove
`signAndEditExecutable: false`, and build on a host with signing privileges.

**Versioning.** `packages/gui/package.json` is a `bumpFiles` entry in `.versionrc.json`, so
the Release workflow (commit-and-tag-version) bumps the GUI together with the repo — it is
**never hand-bumped**. Building installers on each GitHub Release (a `gui-release.yml`
like the siblings') is a follow-up.

The GUI **operates on an Aurelius checkout on disk** — it scaffolds apps next to
`scripts/`, runs the pipeline there, and writes QA artifacts under `.claude/visual-qa/`, so
that folder must stay writable. The app bundle therefore ships only the GUI itself and
does **not** embed the repo or its scripts. At startup it locates the project by walking up
from where it runs (launching from inside a checkout "just works"); the
**Choose project… / Change…** action lets you point it at any checkout, and the choice is
remembered between launches.

## First run & walkthrough

1. **Install & launch** — run the installer for your OS (or `pnpm gui:dev` from a checkout).
2. **Open a project** — on first launch, click **Choose folder…** and pick your Aurelius
   checkout (the folder with `scripts/setup-project.sh`). It's remembered next time.
3. **Prerequisites** — confirm Git, Node, pnpm and Claude Code are detected; install the
   Playwright browsers if flagged.
4. **Setup wizard** — scaffold an app (name + framework), then `pnpm install && pnpm dev`
   inside it from a terminal.
5. **Build from Figma** — paste the Figma URL, click **Build app**, and watch the streamed
   pipeline log.
6. **Visual QA** — with the dev server running, capture baselines, then run the regression,
   responsive, dark-mode and cross-browser checks and review the artifacts.

## Requirements

Running the GUI requires the same tools Aurelius itself needs — Git, Node 22.12+, pnpm 9,
Claude Code (with the Figma MCP server configured for the pipeline) — which is exactly what
the **Prerequisites** screen detects. On Windows the GUI needs Git Bash available to run
the repo's `.sh` scripts.

### GUI-only environment variables (development)

Two `AURELIUS_*` variables exist only for developing/debugging the GUI itself:

| Variable | Effect |
| --- | --- |
| `AURELIUS_BASH` | Absolute path to a bash binary; overrides the GUI's shell auto-detection (escape hatch on Windows, injection point in tests). |
| `AURELIUS_DEBUG` | Any non-empty value enables the GUI core's `debug`-level console logging. |

> Editor-hosted terminals often export `ELECTRON_RUN_AS_NODE=1`, which turns the Electron
> binary into plain Node. The smoke test strips it; when launching by hand from such a
> shell, prefix with `env -u ELECTRON_RUN_AS_NODE`.
