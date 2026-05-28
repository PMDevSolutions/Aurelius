# Multi-Framework Renderers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Abstract code generation into declarative, pluggable renderer manifests (nextjs, vite, astro, sveltekit, expo) resolved by a registry, migrate every framework-branching consumer to read the registry, and add a net-new Astro hybrid (`.astro` + React islands) converter.

**Architecture:** A new `renderers/<name>/renderer.json` manifest per framework, validated by `renderers/renderer.schema.json`. `scripts/renderer-registry.js` (`list`/`resolve`/`detect`) and `scripts/validate-renderer.js` mirror the existing `agent-registry.js`/`validate-agent-plugin.js`. Intake skills, Phase-4 dispatch, orchestration, token config, and TDD scaffolding stop hardcoding framework logic and read the resolved manifest. `outputTarget` stays as the language family (derivable from `manifest.language`); `framework.type` is deprecated.

**Tech Stack:** Node ESM CLI scripts, Vitest (config at `scripts/__tests__/vitest.config.js`), ajv 8 for JSON-Schema validation, Markdown agents/skills/commands, Astro + `@astrojs/react` + `@astrojs/tailwind`.

**Conventions to follow (match existing scripts):**
- ESM `.js`, `#!/usr/bin/env node` shebang, `parseArgs`, `--json`, `--root`/`--renderers-root` override for tests, `emit(json, payload, human)` helper.
- Exit codes: `0` ok · `1` resolution/validation failure · `2` usage/IO error.
- Tests use `execFileSync("node", [SCRIPT, ...args, "--renderers-root", root])`, fixtures under `scripts/__tests__/fixtures/`.
- Run script tests: `pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/<file>` (this is what `./scripts/run-tests.sh` drives; `fileParallelism:false`).

---

## Phase 1 — Schema, registry, validation (no behavior change)

### Task 1: Renderer manifest JSON Schema

**Files:**
- Create: `renderers/renderer.schema.json`

**Step 1: Write the schema.** A JSON Schema (draft 2020-12) describing the manifest. Required: `name`, `language`, `detect`, `template`, `component`, `test`, `converter`, `commands`. `language` enum: `["react","vue","svelte","react-native"]`. `detect` = object with `configFiles` (array of glob strings), `dependencies` (array of strings), optional `priority` (integer, default 0). `component` = object with `ext` (string), optional `islandExt`, `dir`, `pageRouting` enum `["app-router","pages","file-based","screens"]`. `test` = object with `runner`, `library`, optional `setup`, `containerApi` (boolean). `commands` = object with `dev`, `build`, `test`. Optional `phases` = `{ exclude: string[] }`, `capabilities` = object of booleans (`islands`, `ssr`, `darkMode`). `additionalProperties:false` at the top level.

**Step 2: Validate the schema is well-formed.**
Run: `node -e "const Ajv=require('ajv/dist/2020').default;new Ajv().compile(require('./renderers/renderer.schema.json'));console.log('ok')"`
Expected: prints `ok`.

**Step 3: Commit.**
```bash
git add renderers/renderer.schema.json
git commit -m "feat(renderers): add renderer manifest JSON schema"
```

---

### Task 2: `renderer-registry.js` — `list`

**Files:**
- Create: `scripts/renderer-registry.js`
- Create: `scripts/__tests__/renderer-registry.test.js`
- Create fixtures: `scripts/__tests__/fixtures/renderers/{nextjs,vite}/renderer.json` (minimal valid manifests for tests, independent of the real shipped ones)

**Step 1: Write the failing test.**
```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "renderer-registry.js");
const FIX = join(__dirname, "fixtures", "renderers");

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "renderers-"));
  cpSync(FIX, root, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args, cwd) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args, "--renderers-root", root], {
      encoding: "utf-8", timeout: 30000, cwd: cwd || root,
    });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

describe("renderer-registry list", () => {
  it("lists all renderers found under the renderers root", () => {
    const r = run(["list", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).renderers.map((x) => x.name).sort())
      .toEqual(["nextjs", "vite"]);
  });
});
```

**Step 2: Run it, verify it fails.**
Run: `pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/renderer-registry.test.js`
Expected: FAIL (script missing / no output).

**Step 3: Implement `list`.** Create `renderer-registry.js` with `parseArgs` supporting `list|resolve|detect`, `--json`, `--renderers-root <dir>` (default `resolve(__dirname,"..","renderers")`). Add `loadCatalog(root)`: glob `*/renderer.json`, parse each, key by `name`. `list` emits `{ renderers: [{name, language}] }`.

**Step 4: Run test, verify pass.** Same command. Expected: PASS.

**Step 5: Commit.**
```bash
git add scripts/renderer-registry.js scripts/__tests__/renderer-registry.test.js scripts/__tests__/fixtures/renderers
git commit -m "feat(renderers): add renderer-registry list command"
```

---

### Task 3: `renderer-registry.js` — `resolve`

**Files:** Modify `scripts/renderer-registry.js`; Modify `scripts/__tests__/renderer-registry.test.js`.

**Step 1: Add failing tests.**
```js
describe("renderer-registry resolve", () => {
  it("resolves a manifest by name", () => {
    const r = run(["resolve", "nextjs", "--json"]);
    expect(r.exitCode).toBe(0);
    const m = JSON.parse(r.stdout);
    expect(m.name).toBe("nextjs");
    expect(m.language).toBe("react");
  });
  it("exits 2 on unknown renderer with a clear error", () => {
    const r = run(["resolve", "nope", "--json"]);
    expect(r.exitCode).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/unknown renderer/i);
  });
});
```

**Step 2: Run, verify fail.** (resolve not implemented)

**Step 3: Implement `resolve`.** Look up `catalog[name]`; if missing, `emit({ok:false,error:"Unknown renderer \"<name>\""})` + `exit(2)`. Else print the full manifest JSON; `exit(0)`.

**Step 4: Run, verify pass.**

**Step 5: Commit.**
```bash
git add scripts/renderer-registry.js scripts/__tests__/renderer-registry.test.js
git commit -m "feat(renderers): add renderer-registry resolve command"
```

---

### Task 4: `renderer-registry.js` — `detect` + precedence

**Files:** Modify `scripts/renderer-registry.js`; Modify the test; add detection fixtures under `scripts/__tests__/fixtures/projects/` (`nextjs-proj/next.config.ts`, `vite-proj/vite.config.ts`, `ambiguous-proj/{next.config.ts,vite.config.ts}`, `empty-proj/.gitkeep`).

**Step 1: Add failing tests.** `detect <projectDir>` returns the matching renderer name + language, honoring `detect.priority`:
```js
describe("renderer-registry detect", () => {
  const proj = (n) => join(__dirname, "fixtures", "projects", n);
  it("detects nextjs from next.config", () => {
    const r = run(["detect", proj("nextjs-proj"), "--json"]);
    expect(JSON.parse(r.stdout).renderer).toBe("nextjs");
  });
  it("detects vite from vite.config", () => {
    expect(JSON.parse(run(["detect", proj("vite-proj"), "--json"]).stdout).renderer).toBe("vite");
  });
  it("prefers higher detect.priority on ambiguous projects (nextjs over vite)", () => {
    expect(JSON.parse(run(["detect", proj("ambiguous-proj"), "--json"]).stdout).renderer).toBe("nextjs");
  });
  it("returns null when nothing matches", () => {
    expect(JSON.parse(run(["detect", proj("empty-proj"), "--json"]).stdout).renderer).toBeNull();
  });
});
```
> Note: fixtures' `nextjs/renderer.json` must carry `detect.priority` higher than `vite`'s for the ambiguity test. Mirror this in the real manifests (Phase 2).

**Step 2: Run, verify fail.**

**Step 3: Implement `detect`.** For each renderer (sorted by `detect.priority` desc), check whether any `configFiles` glob matches a file in `projectDir` (use `fs.readdirSync` + simple glob: translate `*` → regex), OR any `dependencies` entry appears in the project's `package.json` deps/devDeps. First match wins. Emit `{ renderer, language }` or `{ renderer: null }`; always `exit(0)` (detection is a query, not a failure).

**Step 4: Run, verify pass.**

**Step 5: Commit.**
```bash
git add scripts/renderer-registry.js scripts/__tests__/renderer-registry.test.js scripts/__tests__/fixtures/projects
git commit -m "feat(renderers): add renderer-registry detect with priority precedence"
```

---

### Task 5: `validate-renderer.js`

**Files:**
- Create: `scripts/validate-renderer.js`
- Create: `scripts/__tests__/validate-renderer.test.js`

**Step 1: Write failing tests.** Validator supports `--dir <renderer-dir>` and `--all [--renderers-root <dir>]`, `--json`. Checks: (a) manifest validates against `renderer.schema.json` via ajv; (b) `name` equals the directory name; (c) `template` path exists (resolved against repo root, or `--root` override); (d) `converter` names an agent file `.claude/agents/<converter>.md` that exists; (e) `language` is one of the four. Exit `0` valid · `1` invalid · `2` usage. Tests: a good fixture passes; a fixture whose `converter` points at a missing agent fails with exit 1 and a message matching `/converter/i`; a fixture with a bad `language` fails.

**Step 2: Run, verify fail.**

**Step 3: Implement** mirroring `validate-agent-plugin.js` structure (ajv compile of the schema, then structural checks, collect `issues[]`, emit JSON or human, exit accordingly).

**Step 4: Run, verify pass.**

**Step 5: Commit.**
```bash
git add scripts/validate-renderer.js scripts/__tests__/validate-renderer.test.js
git commit -m "feat(renderers): add validate-renderer (schema + cross-reference checks)"
```

---

## Phase 2 — Author all five manifests + wire CI

### Task 6: Author the five real manifests

**Files:** Create `renderers/{nextjs,vite,astro,sveltekit,expo}/renderer.json`.

Values (confirm `converter`/`template`/`commands` against the repo before writing):
- **nextjs**: `language:react`, `detect:{configFiles:["next.config.*"],dependencies:["next"],priority:20}`, `template:"templates/nextjs"`, `component:{ext:".tsx",dir:"src/components",pageRouting:"app-router"}`, `test:{runner:"vitest",library:"@testing-library/react"}`, `converter:"figma-react-converter"`, `commands:{dev:"pnpm dev",build:"pnpm build",test:"pnpm vitest run"}`, `capabilities:{islands:false,ssr:true,darkMode:true}`.
- **vite**: like nextjs but `detect:{configFiles:["vite.config.*"],dependencies:["vite"],priority:5}` (low, so nextjs/astro/sveltekit win), `pageRouting:"file-based"` (or `"pages"` per react-router convention), `converter:"figma-react-converter"`, `template:"templates/vite"`.
- **astro**: `language:react`, `detect:{configFiles:["astro.config.*"],dependencies:["astro"],priority:10}`, `template:"templates/astro"` (created in Phase 5), `component:{ext:".astro",islandExt:".tsx",dir:"src/components",pageRouting:"file-based"}`, `test:{runner:"vitest",library:"@testing-library/react",containerApi:true}`, `converter:"astro-converter"` (created in Phase 5), `capabilities:{islands:true,ssr:true,darkMode:true}`.
- **sveltekit**: `language:svelte`, `detect:{configFiles:["svelte.config.*"],dependencies:["@sveltejs/kit"],priority:15}`, `template:"templates/sveltekit"`, `component:{ext:".svelte",dir:"src/lib/components",pageRouting:"file-based"}`, `test:{runner:"vitest",library:"@testing-library/svelte"}`, `converter:"svelte-converter"`.
- **expo**: `language:react-native`, `detect:{configFiles:["app.json","app.config.*"],dependencies:["expo"],priority:25}`, `template:"templates/expo"`, `component:{ext:".tsx",dir:"src/components",pageRouting:"screens"}`, `test:{runner:"jest",library:"@testing-library/react-native"}`, `converter:"react-native-converter"`, `commands:{dev:"pnpm expo start",build:"pnpm expo export",test:"pnpm jest"}`, `phases:{exclude:["visual-diff","cross-browser","responsive","dark-mode"]}`, `capabilities:{islands:false,ssr:false,darkMode:false}`.

> The astro manifest references `templates/astro` and `astro-converter`, which don't exist until Phase 5. To keep `validate-renderer --all` green until then, **author the astro manifest in Phase 5** (Task 14), not here. Here, author only nextjs/vite/sveltekit/expo.

**Step 1:** Write the four manifests (nextjs, vite, sveltekit, expo).
**Step 2: Validate them all.**
Run: `node scripts/validate-renderer.js --all --json`
Expected: exit 0, all valid.
**Step 3: Commit.**
```bash
git add renderers/nextjs renderers/vite renderers/sveltekit renderers/expo
git commit -m "feat(renderers): author nextjs/vite/sveltekit/expo manifests"
```

### Task 7: Wire validation into verify-all / ci

**Files:**
- Create: `scripts/verify-renderers.sh` (thin wrapper: `exec node "$(dirname "$0")/validate-renderer.js" --all "$@"`, defensive skeleton matching `verify-agent-plugins.sh`).
- Modify: `scripts/verify-all.sh:62-72` — add `"renderers|./scripts/verify-renderers.sh|"` to `ALL_CHECKS`.

**Step 1:** Add the wrapper + ALL_CHECKS entry.
**Step 2: Verify it runs.**
Run: `./scripts/verify-all.sh --include renderers`
Expected: `renderers … passed`.
**Step 3: Commit.**
```bash
git add scripts/verify-renderers.sh scripts/verify-all.sh
git commit -m "ci(renderers): wire validate-renderer into verify-all"
```

---

## Phase 3 — Migrate detection (intake skills)

### Task 8: Replace duplicated detection with the registry

**Files:** Modify `.claude/skills/figma-intake/SKILL.md`, `.claude/skills/canva-intake/SKILL.md`, `.claude/skills/screenshot-intake/SKILL.md`.

For each, in the framework-detection section:
1. Replace the hand-written config-file/dep sniffing with: run `node scripts/renderer-registry.js detect . --json`. If `renderer` is non-null, set `renderer` and `outputTarget` (= the resolved `language`) in build-spec.
2. Replace the hardcoded "ask the user" framework list with: run `node scripts/renderer-registry.js list --json` and present those names as choices; greenfield React default = `vite`.
3. Document writing the new `renderer` field into build-spec (see Task 9).

These are instruction-doc edits; verify by re-reading that each skill now references the registry commands and no longer enumerates `next.config.*`/`svelte.config.*` by hand.

**Commit:**
```bash
git add .claude/skills/figma-intake .claude/skills/canva-intake .claude/skills/screenshot-intake
git commit -m "refactor(intake): detect framework via renderer-registry, not hardcoded sniffing"
```

### Task 9: build-spec schema/examples — add `renderer`, deprecate `framework.type`

**Files:** Modify the build-spec definition referenced in the intake skills + any `.claude/test-fixtures/*.build-spec.json` examples + `docs/multi-framework/README.md`.

- Add required `renderer` field (string; valid values = registry names).
- Keep `outputTarget`; document it as derived from `renderer.language`.
- Mark `framework.type` deprecated; back-compat rule: a spec with only `outputTarget` resolves to that language's **default renderer** (define defaults: react→vite, svelte→sveltekit, react-native→expo, vue→… leave as-is until a vue renderer exists).
- Update the example fixtures to include `renderer`.

**Commit:**
```bash
git add .claude/test-fixtures docs/multi-framework/README.md
git commit -m "feat(build-spec): add renderer field, deprecate framework.type"
```

---

## Phase 4 — Migrate dispatch, orchestration, token, TDD consumers

### Task 10: Registry-driven Phase-4 dispatch

**Files:** Modify `.claude/commands/build-from-figma.md`, `.claude/commands/build-from-canva.md`, `.claude/commands/build-from-screenshot.md`.

Replace each hardcoded `outputTarget → agent` table (and `build-from-canva`'s hardwired `canva-react-converter`) with: read `renderer` from build-spec → `node scripts/renderer-registry.js resolve <renderer> --json` → dispatch `manifest.converter`. Keep a note that `canva`/`figma` sources may prefer the `*-react-converter` variants when `language===react`; encode that preference in the manifest `converter` field if needed (e.g. a `source` override map) — otherwise keep a single converter per renderer.

**Commit:** `refactor(pipeline): dispatch Phase-4 converter via renderer manifest`

### Task 11: Orchestration phase exclusion from manifest

**Files:** Modify `.claude/skills/parallel-orchestration/SKILL.md`.

Replace `outputTarget === "react-native"` phase-skipping with: resolve the renderer, read `manifest.phases.exclude`. Document that excluded phases are dropped from the dependency graph.

**Commit:** `refactor(orchestration): exclude phases via manifest.phases.exclude`

### Task 12: Token config reads the manifest

**Files:** Modify `.claude/skills/canva-token-inference/SKILL.md`, `.claude/skills/design-token-lock/SKILL.md`.

Replace `outputTarget`-branching for Tailwind/NativeWind config with: read `manifest.template` (Tailwind config shape) and `manifest.language` (CSS-var vs NativeWind). Note Astro reuses the React/Tailwind path.

**Commit:** `refactor(tokens): derive token config target from renderer manifest`

### Task 13: TDD scaffolding reads the manifest

**Files:** Modify `.claude/skills/tdd-from-figma/SKILL.md`.

Replace the `outputTarget → test runner` map with `manifest.test` (`runner`/`library`/`setup`/`containerApi`). Document the Astro split: islands → Vitest+RTL, `.astro` → Vitest + Container API, page interactivity → Playwright E2E.

**Commit:** `refactor(tdd): select test runner/library from manifest.test`

---

## Phase 5 — Astro template + converter (net-new)

### Task 14: Astro template

**Files:** Create `templates/astro/`: `astro.config.mjs` (integrations: `@astrojs/react`, `@astrojs/tailwind`), `tsconfig.json`, `tailwind.config.mjs`, `package.json` (astro + react + integrations + vitest + `@testing-library/react`), `vitest.config.ts` wiring the Astro **Container API** (`experimental_AstroContainer`), plus an example `src/pages/index.astro`. Reuse `templates/shared/` for eslint/prettier.

**Verify:** the template's `package.json` lists pinned, current versions (check latest before pinning, per repo policy of keeping deps up to date).

**Commit:** `feat(templates): add astro starter (react islands + tailwind + container-api tests)`

### Task 15: Astro manifest

**Files:** Create `renderers/astro/renderer.json` (values from Task 6's astro spec).

**Verify:** `node scripts/validate-renderer.js --dir renderers/astro --json` → exit 0 (now that `templates/astro` and `astro-converter` exist; do this after Task 16).

**Commit:** `feat(renderers): author astro manifest`

### Task 16: `astro-converter` agent

**Files:** Create `.claude/agents/astro-converter.md`.

Model the frontmatter/structure on `figma-react-converter.md` (tools, "When to Use", autonomous workflow). Core documented rule:
- Read build-spec + locked tokens + screenshots.
- For each component: if it has `action`, an interactive `category`, or `businessLogic` → emit a **React island** `.tsx` (reuse React converter component/prop/test patterns) and reference it in the page with a `client:*` directive (`client:load` above-the-fold, `client:visible` below-the-fold).
- Else → emit a **static `.astro`** file, props typed via frontmatter `interface Props`, zero JS.
- Pages → `src/pages/*.astro` composing both.
- Tests: islands → Vitest+RTL; `.astro` → Vitest + Container API.

**Step — doc-count bump (same commit):** adding an agent makes 53→54. Update every count reference; let `check-doc-counts.sh` confirm.
Run: `node scripts/check-doc-counts.sh` (or `./scripts/check-doc-counts.sh`)
Expected: passes with 54 agents.

**Commit:** `feat(agents): add astro-converter (hybrid .astro + react islands)`

### Task 17: Astro converter behavioral fixture

**Files:** Create `.claude/test-fixtures/astro-hybrid.build-spec.json` with one interactive component (has `action`) and one static component, `renderer:"astro"`, `outputTarget:"react"`. If converter agents have spec-tests today (see `scripts/__tests__/canva-pipeline.test.js`), add an analogous assertion that the spec resolves to `astro-converter` and that the interactive/static split is well-formed; otherwise document the fixture as the contract reference.

**Commit:** `test(renderers): add astro hybrid build-spec fixture`

---

## Phase 6 — Scaffolding flag, docs, final sync

### Task 18: `setup-project.sh --renderer`

**Files:** Modify `scripts/setup-project.sh` (and its test if present).

Add `--renderer <name>`: resolve via registry, copy `manifest.template` + `templates/shared/`. Keep `--next`/`--vite` as aliases mapping to `--renderer nextjs`/`--renderer vite`. Update `--help`.

**Verify:** `./scripts/setup-project.sh tmp-app --renderer astro --dry-run` (or equivalent dry path) names the astro template.

**Commit:** `feat(setup): add --renderer flag backed by the registry`

### Task 19: Renderer docs

**Files:** Create `docs/multi-framework/renderers.md`; update `docs/multi-framework/README.md` and `CLAUDE.md` references.

Cover: the three-axis model, manifest field reference, the registry commands, and a "How to add a renderer" checklist (author manifest → add template → set converter → `validate-renderer` → done). Add the new scripts to CLAUDE.md's script list.

**Commit:** `docs(renderers): document the renderer model and how to add one`

### Task 20: Full verification + count/architecture sync

**Files:** `CLAUDE.md` (footer: agents 53→54, scripts count +2, "Last Updated" date), `README.md`, any onboarding docs referencing counts.

**Step 1: Run the full gate.**
Run: `./scripts/verify-all.sh`
Expected: all checks pass, including `renderers` and `tests` (registry + validator specs) and the doc-count guard.
**Step 2: Run script tests explicitly.**
Run: `pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/renderer-registry.test.js scripts/__tests__/validate-renderer.test.js`
Expected: all pass.
**Step 3: Commit.**
```bash
git add -A
git commit -m "docs: sync counts and architecture for renderer system"
```

---

## Definition of done

- `renderer-registry.js list/resolve/detect` and `validate-renderer.js` pass their Vitest specs.
- All five manifests validate; astro manifest references a real template + the `astro-converter` agent.
- Intake detection, Phase-4 dispatch, orchestration, token config, and TDD scaffolding all read the registry — no remaining hardcoded `outputTarget`/`framework.type` branches for these concerns (grep to confirm).
- `astro-converter` documents the island/static split; doc-count guard green at 54 agents.
- `./scripts/verify-all.sh` passes end to end.
- Back-compat: a build-spec with only `outputTarget` still resolves to a default renderer.
