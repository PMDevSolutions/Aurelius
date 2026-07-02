# Cross-Browser Screenshot Baselines (RFC 0002)

Firefox and WebKit render fonts, anti-aliasing, and form controls differently
from Chromium — and differently across operating systems. This flow stores
per-engine baselines, verifies **where each baseline came from** before
trusting it, and diffs current screenshots against them at a cross-engine
tolerance. It implements
[RFC 0002](../rfcs/0002-cross-browser-screenshot-baseline-storage.md); the
same-browser chromium flow stays in [regression testing](README.md).

## Quick Start (commit backend, the default)

```bash
# 1. Capture baselines deterministically in the pinned Playwright container
#    (requires Docker; the dev server must be running)
./scripts/cross-browser-baseline.sh capture http://localhost:3000

# 2. Commit the PNGs together with their provenance manifest
git add .claude/visual-qa/baselines
git commit -m "test: add cross-browser baselines"

# 3. Compare after changes (also runs as pipeline Phase 7 and in CI on PRs)
./scripts/cross-browser-baseline.sh compare http://localhost:3000

# Provenance-only check — no dev server needed
./scripts/cross-browser-baseline.sh verify
```

`capture --dry-run` prints the underlying `docker run` command without
executing it. `capture --local` skips the container: allowed, but the
baselines are recorded with `host: "local"` and flagged as *foreign* by every
subsequent compare — local firefox/webkit rendering is not reproducible in CI.

## Why determinism comes first

A stored baseline is only meaningful if the same input reproduces the same
pixels. Cross-engine, cross-OS rendering drift would otherwise turn every
compare into noise — regardless of where the PNGs are stored. Two mechanisms
make the signal trustworthy (RFC 0002 §5):

1. **Pinned container capture.** Authoritative firefox/webkit baselines are
   captured inside `visualBaselines.capture.image`
   (`mcr.microsoft.com/playwright:v1.61.1-noble`), locally via `docker run`
   and in CI via a `container:` job. The config pin is authoritative; scripts
   warn when it drifts from the resolved `@playwright/test` version.
2. **Provenance manifest.** `baselines/manifest.json` (committed) records the
   Playwright version, image, and per-baseline `sha256`, `capturedAt`,
   `gitSha`, `engine`, `route`, `breakpoint`, and `host`. The comparator
   verifies it before diffing.

### Provenance statuses

| Status | Meaning |
|--------|---------|
| `ok` | File matches its manifest entry and was captured in the container |
| `untracked` | Baseline PNG with no manifest entry (added outside capture) |
| `modified` | sha256 differs from the manifest (rewritten outside capture) |
| `missing-file` | Manifest entry whose PNG is gone |
| `foreign-host` | firefox/webkit baseline captured with `host: "local"` |

Manifest-level checks: **version drift** (manifest Playwright ≠ current
envelope) and **image drift** (manifest image ≠ configured image). A compare
run from a non-container envelope is marked **advisory** — results are
informational, never authoritative.

`provenance.policy` decides the teeth: `"warn"` (default) reports flags and
still pixel-diffs; `"enforce"` excludes flagged baselines from diffing and
counts them as failures instead of emitting false pixel diffs.

## Configuration (`visualBaselines`)

All settings live in `.claude/pipeline.config.json`; see the
[full key reference](../onboarding/pipeline-configuration.md#cross-browser-baselines-visualbaselines).
Highlights:

| Setting | Default | Notes |
|---------|---------|-------|
| `backend` | `"commit"` | `commit` \| `ci-artifact` \| `service` |
| `storage` | `"git"` | commit backend only; `"lfs"` for large sets |
| `browsers` | `["chromium","firefox","webkit"]` | must stay within `e2e.crossBrowserBrowsers` |
| `threshold` | `0.03` | must equal `e2e.crossBrowserDiffThreshold` (validated) |
| `blocking` | `false` | flip only after determinism is proven (below) |
| `capture.mode` | `"container"` | `"local"` allowed but untrusted for firefox/webkit |
| `capture.image` | `mcr.microsoft.com/playwright:v1.61.1-noble` | the determinism pin |
| `provenance.policy` | `"warn"` | `"enforce"` excludes flagged baselines |

## Storage backends (RFC 0002 §8)

| | `commit` (default) | `ci-artifact` | `service` |
|---|---|---|---|
| Baselines live | in git, atomically with code | CI artifact from last green `main` | provider cloud |
| Review surface | PR diff of PNGs | artifact + PR comment | provider dashboard |
| External dependency | none | CI + `gh` CLI | paid SaaS + token |
| Data exposure | none | CI provider | screenshots sent to SaaS |

- **commit** — the default: reviewable in the PR diff, offline-capable, zero
  accounts. Pack growth is handled by the LFS flag (below).
- **ci-artifact** — no binaries in git. PR compares download the
  `cross-browser-baselines` artifact published by the last green `main` run
  (the `publish` job in `.github/workflows/cross-browser-baselines.yml`);
  locating it needs the `gh` CLI. Before the first publish, compares skip
  with a clear message.
- **service** — fully delegated to Chromatic or Percy: `compare` validates
  the project token env var (`service.projectTokenEnv`, set it as a CI
  secret) and hands off to the provider CLI. Chromatic mirrors
  `blocking: false` via `--exit-zero-on-changes`; Percy snapshots the
  configured routes. Opt-in only — screenshots leave your infrastructure.

## Git LFS for large baseline sets

Plain committed PNGs are right for the common case. Once a project's set
grows (rule of thumb: >50 baselines or ~25 MB cumulative), flip to LFS:

```bash
# 1. Set visualBaselines.storage to "lfs" in pipeline.config.json
# 2. Run the automation in the app's repository
./scripts/setup-baseline-lfs.sh          # idempotent; --dry-run to preview
```

The script appends the `.gitattributes` filter and runs
`git lfs install --local` — **forward-only**: existing history is untouched.
Rewriting history into LFS (`git lfs migrate import --include=... --everything`)
is destructive and intentionally left to a deliberate manual step; the script
prints the exact command. Capture/compare warn when `storage` and
`.gitattributes` disagree in either direction.

## CI (`.github/workflows/cross-browser-baselines.yml`)

- **PRs** — `compare` runs inside the pinned container (config-driven image),
  uploads diff artifacts, and upserts a "Cross-Browser Baseline Results" PR
  comment. Skips when no baselines or no `app/` exist.
- **workflow_dispatch** — deterministic recapture that opens a reviewable
  baselines-refresh PR (PNGs + manifest).
- **push to main** — publishes the `cross-browser-baselines` artifact when
  `backend` is `ci-artifact`.

## Flipping to blocking (Phase B "teeth")

`blocking` and `qualityGate.crossBrowserScreenshotsRequired` ship `false`.
Recommended flip criteria: **≥20 consecutive containerized CI compares with
zero provenance flags, and pixel failures only on intentional UI changes
(<5% of runs otherwise)**. Then set `visualBaselines.blocking: true`
(compare exits 1 on failures) and, once the pipeline gate should enforce it,
`qualityGate.crossBrowserScreenshotsRequired: true`. `provenance.policy:
"enforce"` is the matching escalation for provenance violations.

## Relationship to same-browser regression testing

Both flows share `.claude/visual-qa/baselines/` (per-engine subdirectories)
and `scripts/visual-diff.js`:

| | Regression ([README](README.md)) | Cross-browser (this page) |
|---|---|---|
| Engines | `regressionTesting.browsers` (chromium) | `visualBaselines.browsers` (+ firefox/webkit) |
| Threshold | `0.02` | `0.03` (cross-engine tolerance) |
| Capture | local is fine (same-engine, same-host) | pinned container for authority |
| Provenance | syncs the manifest when present | records + verifies the manifest |

Each script walks only its own engines, so committed firefox/webkit baselines
never appear as SKIP noise in the regression report. When
`regression-test.sh --update-baselines` or `capture-baselines.sh` rewrite
chromium baselines, they refresh the manifest entries (`host: "local"`) so the
provenance stays truthful.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `compare` skips with "no baselines found" | Run `capture` (container) and commit `.claude/visual-qa/baselines/` |
| Everything flagged `untracked` | No manifest yet — run `capture`, or `node scripts/lib/baseline-manifest.js record` for existing PNGs |
| `foreign-host` on firefox/webkit | Baseline was captured with `--local`; recapture in the container |
| "advisory: current capture envelope does not match" | You're comparing locally against container baselines — expected; CI is authoritative |
| `@playwright/test is not resolvable` | Run from the app project (or install it): `pnpm add -D @playwright/test && npx playwright install` |
| `cannot derive a Playwright version from …capture.image` | Pin a full tag, e.g. `mcr.microsoft.com/playwright:v1.61.1-noble` |
| Container can't reach the dev server | localhost is rewritten to `host.docker.internal`; ensure the server listens on all interfaces |
| storage/LFS drift warning | Run `./scripts/setup-baseline-lfs.sh` (or set `storage` back to `git`) |
