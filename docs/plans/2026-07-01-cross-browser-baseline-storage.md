# Cross-Browser Screenshot Baseline Storage (RFC 0002) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement RFC 0002 — commit-backed, provenance-verified cross-browser (firefox/webkit) screenshot baselines with a pluggable backend abstraction (`commit` | `ci-artifact` | `service`), pinned-container capture, and Git LFS opt-in — closing issue #111.

**Architecture:** A new `visualBaselines` section in `pipeline.config.json` (strict JSON Schema) drives a new `scripts/cross-browser-baseline.js` CLI (thin `scripts/cross-browser-baseline.sh` wrapper) with `capture` / `compare` / `verify` subcommands. Capture uses Playwright (resolved dynamically — it is not a repo dependency) and, for authoritative firefox/webkit baselines, runs inside the pinned `mcr.microsoft.com/playwright` container (docker locally, `container:` in CI). A committed `baselines/manifest.json` records per-baseline provenance (sha256, engine, playwrightVersion, image, host, gitSha) via a new dual-mode lib `scripts/lib/baseline-manifest.js`; the comparator verifies provenance and flags stale/foreign baselines instead of emitting false pixel diffs. Backends live behind a uniform adapter contract in `scripts/lib/baseline-backends.js`. Diffing reuses `scripts/visual-diff.js` (pixelmatch) at threshold 0.03. Non-blocking by default (`blocking: false`, `qualityGate.crossBrowserScreenshotsRequired: false` unchanged) per RFC §10 Phase A/B.

**Tech Stack:** Node 22 ESM (`"type": "module"`), Bash + `scripts/lib/common.sh`, Playwright (dynamic resolution via `createRequire`), pixelmatch/pngjs (via existing `visual-diff.js`), ajv 2020-12, vitest (`scripts/__tests__/vitest.config.js`, black-box CLI tests), GitHub Actions, Docker (`mcr.microsoft.com/playwright:v1.61.1-noble`), Git LFS.

---

## Design decisions (resolving RFC §13 open questions)

These are recorded here and in `docs/regression-testing/cross-browser.md` (Task 10); the RFC itself only gets its Status/§12 rows updated per its own §12 instruction.

1. **Unify `regressionTesting` and `visualBaselines`?** Keep separate (RFC §7.1 already states this). They share `baselineDir` and the per-engine directory layout; `regressionTesting` owns same-browser chromium at 0.02, `visualBaselines` owns the cross-engine dimension at 0.03. To avoid cross-noise, `regression-test.sh`'s baseline walk is restricted to *its* configured `browsers` (Task 5) so committed firefox/webkit baselines don't produce SKIP rows in the regression report.
2. **Blocking threshold (Phase B "teeth").** Machinery ships now: `visualBaselines.blocking` and `provenance.policy: "enforce"` are honored by the comparator. The flip itself stays manual and data-driven — documented guidance: flip after ≥20 consecutive containerized CI compare runs with 0 provenance flags and <5% of runs showing pixel failures not tied to an intentional UI change. `qualityGate.crossBrowserScreenshotsRequired` stays `false`.
3. **Image pinning strategy.** The config pin (`visualBaselines.capture.image`) is authoritative; scripts *warn* when the image tag's embedded version disagrees with the resolved `@playwright/test` version or the manifest's recorded version (drift is surfaced, never silently ignored). Pinned initially to `v1.61.1-noble` (the Playwright version on the capture host today).
4. **Local firefox/webkit capture.** Warn-and-record, not hard-fail: local captures are written with `host: "local"` in the manifest and the comparator flags them (`foreign-host`) per `provenance.policy`. Local *compares* against container baselines are likewise marked advisory (envelope mismatch). Only `policy: "enforce"` turns provenance flags into failures.
5. **LFS migration.** `scripts/setup-baseline-lfs.sh` automates forward-only adoption (`.gitattributes` filter + `git lfs install --local`); history rewrite (`git lfs migrate import`) is printed as documented guidance, never executed by the script.

Additive fields beyond the RFC §7.1 sketch (needed operationally, same spirit): `screenshotDir`, `diffDir`, `reportFile` (mirroring `regressionTesting`), and `provenance.policy` (RFC §5: "refuses (or warns, per policy)").

## Contracts

**Baseline layout (shared with regression testing):** `.claude/visual-qa/baselines/<engine>/<routeSlug>/<bpName>_<width>px.png`, `routeSlug = '/' → 'home'`, else strip leading `/`, `/`→`-`. `manifest.json` sits at the baseline root (RFC §7.2).

**Manifest (RFC §7.3):**
```json
{
  "playwrightVersion": "1.61.1",
  "image": "mcr.microsoft.com/playwright:v1.61.1-noble",
  "baselines": {
    "firefox/home/desktop_1440px.png": {
      "sha256": "…", "capturedAt": "2026-07-01T12:00:00Z", "gitSha": "abc1234",
      "engine": "firefox", "route": "/", "breakpoint": "desktop", "host": "container"
    }
  }
}
```

**Provenance statuses (per baseline, from `verifyBaselines`):** `ok` | `untracked` (file without manifest entry) | `modified` (sha256 mismatch — rewritten outside capture) | `missing-file` (entry without file) | `foreign-host` (firefox/webkit entry with `host: "local"`) | `version-drift` (manifest `playwrightVersion` ≠ current envelope's) | `image-drift` (manifest `image` ≠ configured image). Comparison-level: `envelopeMatch: false` when the *current* capture host/version differs from the manifest envelope → results marked advisory. `policy: "warn"` → flags are warnings, pixel diff still runs; `policy: "enforce"` → flagged baselines are excluded from pixel diffing and counted as provenance failures.

**CLI (`node scripts/cross-browser-baseline.js <cmd>` / `./scripts/cross-browser-baseline.sh <cmd>`):**
- `capture [url] [--local] [--json] [--engines a,b]` — capture baselines for `visualBaselines.browsers` into `baselineDir` + record manifest. `capture.mode: "container"` (default) wraps itself in `docker run` (skipped when already in-container via `CBB_IN_CONTAINER=1`/`/.dockerenv`, or with `--local`, which records `host: "local"` + warns for firefox/webkit).
- `compare [url] [--json] [--current-dir <dir>] [--blocking]` — backend `fetch()` → provenance verify → capture current (or use `--current-dir`, which makes the comparator fully testable without Playwright) → per-baseline `visual-diff.js --threshold <visualBaselines.threshold>` → report to `.claude/visual-qa/cross-browser-report.md` + diffs to `diffDir`. Exit 0 unless (failures AND (`blocking` config or `--blocking`)); exit 2 on operational error. JSON: `{pass, fail, warn, skip, provenance: {...counts}, wouldBlock, blocking, threshold, backend, reportPath}`.
- `verify [--json]` — provenance-only check (no server needed). Exit 1 on any violation, 0 clean, 2 error.
- Missing baselines → skip + hint to run capture (never auto-capture; authoritative baselines are captured deliberately).

**Backend adapter contract (`scripts/lib/baseline-backends.js`, RFC §8):** `resolveBackend(config, {execFile})` → `{ name, delegated, fetch({baselineDir}) → {baselineRoot}, store(ctx) → instructions/actions, providerArgv(ctx) }`. `commit`: fetch = configured dir; store = `git add` hint + LFS-drift warning. `ci-artifact`: fetch = download `cross-browser-baselines` artifact from last successful run of the baseline workflow on main (`gh run list`/`gh run download`; in CI, `actions/download-artifact`); store = artifact upload (CI). `service`: `delegated: true`; compare execs provider CLI (`chromatic --project-token <env>` / `percy snapshot <generated snapshots file>`) after validating the token env var exists.

**Playwright resolution (not a repo dep):** `createRequire` attempts against `$CBB_PLAYWRIGHT_DIR`, `process.cwd()`, script dir; clear install hint on failure. Container bootstrap installs `@playwright/test@<version-from-image-tag>` into a scratch dir and sets `CBB_PLAYWRIGHT_DIR` (image ships browsers at `/ms-playwright`).

**Docker invocation (built in JS, unit-tested via injected spawn):** `docker run --rm -v <repoRoot>:/work -w /work --add-host=host.docker.internal:host-gateway -e CBB_IN_CONTAINER=1 -e CBB_PLAYWRIGHT_DIR=/tmp/cbb <image> bash -lc "mkdir -p /tmp/cbb && cd /tmp/cbb && npm init -y >/dev/null 2>&1 && npm i --no-fund --no-audit @playwright/test@<ver> >/dev/null 2>&1 && cd /work && node scripts/cross-browser-baseline.js capture <url'> --host container --no-manifest"` with `localhost`/`127.0.0.1` in the URL rewritten to `host.docker.internal`. Manifest is recorded host-side afterwards (`host: "container"`, gitSha from host git).

---

## Task 1: Accept RFC 0002 (gate-clearing)

Issue #111 is blocked on RFC acceptance. PR #112 (the RFC) was approved and merged by the maintainer (PAMulligan) on 2026-07-01; per RFC §12 acceptance = maintainer approval + Status row update. Record it.

**Files:** Modify `docs/rfcs/0002-cross-browser-screenshot-baseline-storage.md` (Status row, §12); Modify `docs/rfcs/README.md` (index row).

1. RFC Status row → `| **Status**   | **Accepted** — 2026-07-01 |`; §12: `- Decision: **Accepted as proposed**` / `- Approver / date: PAMulligan (maintainer) · 2026-07-01 (PR #112 approved & merged)`, and reword the §12 lead sentence + acceptance-gate blockquote (§ preamble) to past tense.
2. Index row in `docs/rfcs/README.md` → `Accepted`.
3. Commit: `docs(rfcs): accept RFC 0002 — cross-browser screenshot baseline storage`

## Task 2: `visualBaselines` config + JSON Schema + validation tests (TDD)

**Files:** Test `scripts/__tests__/visual-baselines-config.test.js` (new); Modify `.claude/pipeline.config.json` (after `regressionTesting`), `.claude/pipeline.config.schema.json` (property after `regressionTesting` + structural checks target), `scripts/validate-pipeline-config.js` (`structuralChecks()`).

1. Write failing tests (black-box: `execFileSync("node", [VALIDATE_SCRIPT, "--config", tmpConfig, "--schema", SCHEMA, "--json"])` on temp configs derived from the live one):
   - live config validates clean;
   - unknown key inside `visualBaselines` → invalid (strictness);
   - `backend: "s3"` → invalid enum; `storage: "lfs"` valid; `provenance.policy: "block"` → invalid enum (allowed: `warn`|`enforce`);
   - structural: `backend: "ci-artifact"` + `storage: "lfs"` → error (storage applies to `commit` only); `visualBaselines.threshold: 0.05` with `e2e.crossBrowserDiffThreshold: 0.03` → error (single cross-engine tolerance, same style as the existing mutation-threshold drift check).
2. Run: `pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/visual-baselines-config.test.js` → FAIL.
3. Add the config section (values in **Contracts**/Design above: enabled, backend=commit, storage=git, baselineDir, screenshotDir/diffDir under `cross-browser`, browsers [chromium,firefox,webkit], routes ["/"], breakpoints {mobile:375,desktop:1440}, threshold 0.03, blocking false, reportFile, capture {mode:container, image:v1.61.1-noble, waitAfterLoadMs:1500, fullPage:true}, provenance {manifest, policy:warn}, ciArtifact {compareAgainst:last-green-main, retentionDays:30}, service {provider:chromatic, projectTokenEnv:CHROMATIC_PROJECT_TOKEN}); mirror in schema (strict, `$refs`: percentageRatio/browserList/breakpointMap; enums for backend/storage/mode/policy/provider/compareAgainst); implement the two structural checks.
4. Tests pass; also `node scripts/validate-pipeline-config.js` clean. Commit: `feat(config): add visualBaselines section for cross-browser baseline storage (RFC 0002)`

## Task 3: Provenance manifest lib (TDD)

**Files:** Test `scripts/__tests__/baseline-manifest.test.js`; Create `scripts/lib/baseline-manifest.js` (dual-mode: exports + CLI guard like `scripts/lib/pipeline-config.js`).

Exports: `sha256File`, `parseBaselineRelPath` (`engine/routeSlug/bp_640px.png` → parts, else null), `loadManifest`, `recordBaselines({baselineDir, manifestPath, engines, envelope:{playwrightVersion,image,host,gitSha}, routesBySlug})` (scan configured engines' PNGs, merge entries — other engines' entries preserved; top-level envelope updated only when `envelope.updateToplevel !== false`), `syncManifest(...)` (refresh sha/capturedAt/gitSha/host for existing+new entries of given engines; used by chromium-writing scripts; no-op when manifest absent), `verifyBaselines({baselineDir, manifestPath, engines, envelope, image})` → `{statuses: {relPath: status}, counts, envelopeMatch}`. CLI: `node scripts/lib/baseline-manifest.js (record|sync|verify) [--json] [--engines a,b] [--host h]` reading `visualBaselines` config defaults.

1. Failing tests: temp dir fixtures with tiny PNGs (reuse `scripts/__tests__/generate-fixtures.js` helpers) covering: record creates RFC-shaped manifest (path keys posix, engine/route/breakpoint parsed, sha256 correct); record preserves foreign-engine entries; sync no-ops without manifest; verify returns each status (`ok`/`untracked`/`modified`/`missing-file`/`foreign-host` for local firefox, `version-drift`, `image-drift`); envelopeMatch false when host differs; CLI `verify --json` exit codes (1 on violations).
2. Implement minimal; tests green. Commit: `feat(scripts): add baseline provenance manifest lib (record/sync/verify)`

## Task 4: `cross-browser-baseline` CLI — compare/verify/capture (commit backend) (TDD)

**Files:** Test `scripts/__tests__/cross-browser-baseline.test.js`; Create `scripts/cross-browser-baseline.js` (CLI; builtin-only static imports; Playwright dynamic; diff via `execFile node scripts/visual-diff.js`), `scripts/cross-browser-baseline.sh` (wrapper: common.sh, `visualBaselines.enabled` gate → `⊘ skip` exit 0, forwards to node CLI), `scripts/lib/baseline-backends.js` (commit backend + `resolveBackend` scaffold with clear errors for not-yet-implemented backends). Modify `.gitignore` (ignore `screenshots/cross-browser/**/*.png`, `diffs/cross-browser/**/*.png`, `cross-browser-report.md` under `.claude/visual-qa/`).

1. Failing tests (all Playwright-free via `--current-dir` + `CBB_TEST_CONFIG` env pointing at a temp config file so tests don't depend on the live repo config):
   - `--help` for sh + js; unknown backend in config → exit 2 with message;
   - compare: identical current/baseline PNG trees → all PASS, exit 0, report file written, JSON shape as contracted;
   - compare with a genuinely different PNG → fail counted, exit 0 while `blocking:false` + `wouldBlock:true`; exit 1 with `--blocking`;
   - provenance: baseline modified after manifest record → `modified` flag surfaces in JSON + report; `policy:"enforce"` → excluded from diffing + counted as provenance failure; missing manifest → all `untracked` warnings (still diffs);
   - engines filter: only `visualBaselines.browsers` subdirs are walked (a stray `chromium-extra/` dir is ignored); `manifest.json` itself skipped;
   - missing baselines → skip + capture hint, exit 0;
   - `verify` subcommand passes through to lib with config defaults.
2. Implement compare/verify + commit backend + wrapper; keep capture local-only in this task (`--local`/`mode:"local"`, chromium-capable; container wrapping is Task 6) — capture errors cleanly when Playwright unresolvable (install hint, exit 2).
3. Green; `bash -n scripts/cross-browser-baseline.sh`. Commit: `feat(scripts): add cross-browser-baseline capture/compare with provenance verification`

## Task 5: Keep sibling writers honest + fix the mislabeled orchestration phase

**Files:** Modify `scripts/regression-test.sh` (walk only `regressionTesting.browsers` subdirs; after `--update-baselines` copy, call manifest `sync --engines <its browsers> --host local` when a manifest exists), `scripts/capture-baselines.sh` (same sync after successful capture), `.claude/pipeline.config.json` (`orchestration.phases.cross-browser`: description → `"Firefox and WebKit baseline comparison (cross-browser-baseline.sh compare)"`, resources → `[{"name": "port:dev-server", "mode": "shared"}]`), `.claude/skills/parallel-orchestration/SKILL.md:148`, `.claude/skills/figma-to-react-workflow/SKILL.md:487-488,689`, `.claude/skills/visual-qa-verification/SKILL.md:148-155,352`, `.claude/commands/build-from-figma.md:285-286` (Phase 7 now runs the compare; `cross-browser-test.sh` remains a standalone capture utility — add a pointer comment to its header).

1. Extend `scripts/__tests__/regression-test.test.js`: with a temp `CBB`-style fixture… (regression-test.sh reads the live config; simplest deterministic test: create temp baseline tree containing `firefox/` PNGs + chromium PNGs, run with a stubbed config via `PATH`-independent approach — if impractical black-box, assert via `bash -n` + a focused unit on the find filter by extracting it into `scripts/lib/common.sh` helper `common_find_baselines <dir> <csv-browsers>`; test the helper through a tiny bash -c harness). Keep whatever is honestly testable; don't fake it.
2. Apply edits; existing suite stays green (its `--help` tests unaffected). Commit: `fix(pipeline): make Phase 7 cross-browser phase perform the comparison it advertises`

## Task 6: Pinned-container capture (Phase B)

**Files:** Test additions in `scripts/__tests__/cross-browser-baseline.test.js`; Modify `scripts/cross-browser-baseline.js`.

1. Failing tests for the docker command builder (exported or via `capture --dry-run --json` printing the argv): image from config; volume/workdir; `--add-host`; env plumbing; URL rewrite `http://localhost:3000` → `http://host.docker.internal:3000`; in-container detection short-circuits wrapping; `--local` bypass warns for firefox/webkit; image-tag/Playwright version drift warning surfaces.
2. Implement (`--dry-run` prints without spawning; real spawn inherits stdio, exit code propagated; post-success host-side manifest record with `host:"container"`).
3. Green. Commit: `feat(scripts): pinned Playwright container capture for cross-browser baselines`

## Task 7: CI workflow

**Files:** Create `.github/workflows/cross-browser-baselines.yml` (mirror `ci.yml` step conventions — read its visual-regression job first).

Jobs: `prep` (bare runner; reads `visualBaselines` via `node scripts/lib/pipeline-config.js get …` → outputs `enabled`, `image`, `backend`, `pwversion`); `compare` (PR-only; needs prep; `container: image: ${{ needs.prep.outputs.image }}`; guards: baselines exist + `hashFiles('app/package.json') != ''` like the regression job; pnpm install (root), `npm i --prefix /tmp/cbb @playwright/test@<pwversion>` + `CBB_PLAYWRIGHT_DIR=/tmp/cbb`, build/start app, `node scripts/cross-browser-baseline.js compare http://localhost:3000 --json` (`continue-on-error` while non-blocking), upload report+diffs artifact, PR comment upsert titled "Cross-Browser Baseline Results"); `capture` (workflow_dispatch; same container; runs capture + opens a baselines-update PR via `gh` with `GITHUB_TOKEN`); `publish` (push→main; only when `backend == 'ci-artifact'`; capture + `actions/upload-artifact` name `cross-browser-baselines`, retention from config).

Validate: `node -e "..."` YAML parse via `npx yaml` or python — use the same validation ci.yml gets (`validate` job does JSON only; locally run `npx --yes yaml-lint` or python yaml). Commit: `ci: add pinned-container cross-browser baseline workflow`

## Task 8: Git LFS opt-in (Phase C.1)

**Files:** Test `scripts/__tests__/setup-baseline-lfs.test.js`; Create `scripts/setup-baseline-lfs.sh`.

1. Failing tests (run inside a scratch `git init` temp repo — never this repo; skipIf `git lfs version` unavailable for the apply-path test, keep pure-output tests always-on): `--help`; refuses when `storage` ≠ `lfs` without `--force`; `--dry-run` prints planned `.gitattributes` line without writing; apply path appends filter exactly once (idempotent on second run), runs `git lfs install --local`, prints forward-only vs `git lfs migrate import` guidance (never executes migrate).
2. Implement (`.gitattributes` line: `.claude/visual-qa/baselines/**/*.png filter=lfs diff=lfs merge=lfs -text`); also `cross-browser-baseline.js` capture/compare warn on storage↔attributes drift both directions (unit-covered in Task 4 file). Commit: `feat(scripts): git-lfs storage automation for large baseline sets`

## Task 9: `ci-artifact` + `service` adapters (Phase C.2/C.3)

**Files:** Test `scripts/__tests__/baseline-backends.test.js`; Modify `scripts/lib/baseline-backends.js`, `scripts/cross-browser-baseline.js` (wire `compare --backend` override for testing; JSON includes `backend`).

1. Failing tests (inject fake `execFile` recorder): ci-artifact fetch builds `gh run list … --workflow cross-browser-baselines.yml --branch main --status success` then `gh run download <id> -n cross-browser-baselines -D <tmp>`; empty run list → clear "no published baselines yet" skip; service: missing token env → exit 2 with message naming the env var; chromatic/percy argv shapes; `delegated` short-circuits the pixel path.
2. Implement. Commit: `feat(scripts): ci-artifact and service baseline backends behind the adapter contract`

## Task 10: Documentation + reference sweep

**Files:** Create `docs/regression-testing/cross-browser.md` (guide: quick start, config table, provenance model + statuses, container capture local/CI, blocking-flip criteria, backend adapters incl. security/cost table from RFC §11, LFS adoption/migration, troubleshooting); Modify `docs/regression-testing/README.md` (cross-link + shared-baseline-dir note), `docs/onboarding/architecture.md:294-297` (script table rows), `docs/onboarding/pipeline-configuration.md` (visualBaselines key table), `scripts/README.md`, root `README.md` (scripts tree), `CLAUDE.md` (script list entries, Phase 7 line in the pipeline diagram, features bullet, architecture footer counts + Last Updated), this plan file committed, `docs/guides/error-recovery.md:31` if the phrasing about cross-browser capture needs the new script.

Checks: `./scripts/check-doc-counts.sh` (agents/skills counts unchanged — must stay green), grep for stale claims (`"never diffs"` style wording) across touched docs. Commit: `docs: cross-browser baseline storage guide + reference sweep (closes #111 docs)`

## Task 11: Full verification + PR

1. `pnpm vitest run --config scripts/__tests__/vitest.config.js scripts/__tests__/` (known pre-existing failures on this machine: agent-plugin-lib/metrics-dashboard/pipeline-cache — verify unchanged vs `git stash` baseline if they appear).
2. `node scripts/validate-pipeline-config.js`; `bash -n` all new/modified shell scripts; `./scripts/lint-and-format.sh --check` (scope: touched files).
3. End-to-end smoke (local, honest): tiny static page served via `node -e` http server → `cross-browser-baseline.sh capture http://127.0.0.1:<port> --local --engines chromium` (Playwright unavailable in-repo → expect the graceful install-hint path; if resolvable via npx-installed package, run for real) → fabricate the compare path via `--current-dir` fixtures instead, which exercises the full comparator+manifest+report pipeline without Playwright.
4. Push branch `111-implement-cross-browser-screenshot-baseline-storage-rfc-0002`, open PR: `feat: cross-browser screenshot baseline storage (RFC 0002)` — body maps commits → RFC phases A/B/C, lists §13 resolutions, notes what stays deliberately off (`blocking`, `crossBrowserScreenshotsRequired`), `Closes #111`.
