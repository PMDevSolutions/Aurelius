# RFC 0002 — Cross-Browser Screenshot Baseline Storage

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| **RFC**      | 0002                                                                    |
| **Title**    | Cross-Browser Screenshot Baseline Storage                               |
| **Status**   | **Accepted** — 2026-07-01                                               |
| **Milestone**| v2.0.0                                                                  |
| **Tracking** | #85                                                                    |
| **Author**   | Aurelius maintainers                                                    |
| **Created**  | 2026-07-01                                                             |
| **Informs**  | `docs/plans/2026-03-24-cross-browser-e2e-testing.md`, `docs/plans/2026-03-25-screenshot-regression-testing.md` |

> **Acceptance gate.** Per #85, the acceptance criteria are (1) the decision is
> documented in `docs/rfcs/` and (2) implementation is tracked as a follow-up
> issue. This RFC satisfies (1). It was **Accepted** on maintainer approval and
> merge of its PR (#112, 2026-07-01 — see §12); the implementation lands in
> follow-up PRs that reference the tracking issue created for (2), #111.

---

## 1. Summary

Phase 7 of the build pipeline captures Firefox and WebKit screenshots but has no
committed baseline to diff against, so it only proves that rendering did not
throw. This RFC decides **where cross-browser baselines live, how they are
trusted, and how the choice is configured.**

The decision has three parts:

1. **Default backend — commit baselines to the repo** (ratifying what
   `.gitignore` already does), because a committed baseline is the only option
   where the baseline is versioned *atomically with the code that produces it* and
   is **reviewable in the PR diff**. A `storage: "lfs"` flag routes the PNGs
   through Git LFS when a project's baseline set grows large.
2. **A pluggable backend abstraction** — `visualBaselines.backend`
   (`commit` | `ci-artifact` | `service`) — so a consuming project can move to
   CI-artifact comparison or a SaaS (Chromatic/Percy) via config, without forking
   the scripts. This mirrors the existing renderer and agent-plugin registries.
3. **A determinism precondition** — cross-browser baselines are captured in a
   **pinned Playwright container**, and each baseline carries **provenance**
   (engine, Playwright version, container image, hash). Without this, *no* storage
   backend works: Firefox/WebKit render fonts and anti-aliasing differently across
   operating systems, so a baseline captured on a developer's macOS would diff
   forever against CI's Linux.

Parts 1 and 2 answer the storage question the issue poses. Part 3 is the reason
the storage question alone is insufficient, and is in scope because it is a
precondition for *any* of the four options being meaningful.

## 2. Motivation

Aurelius is a **framework/template repository**: it carries no long-running web
app of its own under visual test. Baselines are artifacts of the **downstream app**
a pipeline run produces (the regression CI job in
`docs/plans/2026-03-25-screenshot-regression-testing.md` even guards on
`hashFiles('app/package.json')`). So the question this RFC settles is *what
strategy the framework ships as the default* for the apps it builds — not where a
handful of PNGs for this repo go.

The gap is concrete and the current answer is **implicit and inconsistent**:

- **`scripts/cross-browser-test.sh` (Phase 7)** captures Firefox/WebKit
  screenshots into `.claude/visual-qa/screenshots/<browser>/` — a **gitignored,
  transient** directory — and **never diffs** them. Yet
  `.claude/pipeline.config.json` → `orchestration.phases.cross-browser` describes
  the phase as *"Firefox and WebKit screenshot comparison."* The label promises a
  comparison the implementation does not perform.
- **`scripts/regression-test.sh` (Phase 7.5)** *does* diff, pixel-for-pixel, via
  `scripts/visual-diff.js`, and its loop already walks per-browser baseline
  subdirectories. But `regressionTesting.browsers` defaults to `["chromium"]`, so
  Firefox/WebKit baselines are never captured, never committed, and never compared.
- **`.gitignore:108–113`** already **tracks** `.claude/visual-qa/baselines/`
  while ignoring transient captures and diffs, and `capture-baselines.sh` prints
  `git add`/`git commit` instructions. The de-facto storage strategy is therefore
  **commit-to-repo** — it has simply never been ratified, extended to the
  cross-browser engines, or made deterministic.
- **`qualityGate.crossBrowserScreenshotsRequired: false`** and a deliberately
  looser `e2e.crossBrowserDiffThreshold: 0.03` (vs. the `0.02` same-browser
  regression threshold) are already in the config — an acknowledgment that
  cross-engine rendering differs and needs its own tolerance.

The point of deciding now, in one place, is to fix the storage model **and** the
determinism model together, so the phase produces a trustworthy signal instead of
either silence (today) or a flood of false diffs (naive baselines).

## 3. Goals and non-goals

**Goals**

- Decide the **default** baseline-storage backend and document why.
- Define a **pluggable backend abstraction** so `commit`, `ci-artifact`, and
  `service` are all reachable by configuration.
- Specify the **determinism + provenance** contract that makes a stored baseline
  trustworthy across engines and machines.
- Reconcile the mislabeled Phase 7 with a phase that actually captures and
  compares against a baseline.
- Keep the framework's posture: **self-contained, offline-capable, zero mandatory
  paid dependency**, with SaaS as an opt-in.

**Non-goals (this RFC)**

- **Implementation.** Per #85, code lands in follow-up PRs against a new tracking
  issue (§14). This RFC is decision-only.
- **A new diff engine.** `visual-diff.js` (pixelmatch) stays the comparator for
  the self-hosted backends; the `service` backend delegates diffing to the SaaS.
- **Replacing Playwright's native `toHaveScreenshot`.** The Chrome-extension
  templates use Playwright's own snapshot files (e.g. `popup-firefox.png`); those
  remain valid for component-level extension popups. This RFC governs the
  **full-page, per-route** cross-browser baselines produced by the pipeline.
- **Unifying `regressionTesting` and `visualBaselines`.** Same-browser (chromium)
  regression keeps its existing section; merging the two is an open question (§13).
- **Mandating cross-browser as a blocking gate.** Blocking is introduced only
  after determinism is proven (§10, Phase B).

## 4. Background: what exists today

| Piece | Location | Behavior |
| ----- | -------- | -------- |
| Capture-only cross-browser | `scripts/cross-browser-test.sh` | Screenshots one engine → gitignored `screenshots/<browser>/`; **no diff** |
| Baseline capture | `scripts/capture-baselines.sh` | Screenshots → `baselines/<browser>/<route>/`; prints `git add`/`commit` |
| Regression diff | `scripts/regression-test.sh` + `scripts/visual-diff.js` | pixelmatch vs. committed baselines; per-browser loop; `browsers` defaults to `["chromium"]` |
| Config | `.claude/pipeline.config.json` → `regressionTesting`, `e2e`, `qualityGate`, `orchestration.phases.cross-browser` | `crossBrowserScreenshotsRequired: false`; `crossBrowserDiffThreshold: 0.03`; phase labeled "comparison" but non-comparing |
| Git tracking | `.gitignore:108–113` | Tracks `baselines/`; ignores transient `screenshots/regression/` + `diffs/` |
| Git LFS | `.gitattributes` | **Not configured** — only Linguist rules + `*.idml binary` |

Two facts drive the decision: baselines are **already committed** (so "commit to
repo" is the incumbent, not a new proposal), and **LFS is not yet set up** (so
adopting it is additive and can be gated behind a flag).

## 5. The real problem: rendering is non-deterministic across engines and OSes

A screenshot baseline is only useful if the same input reliably produces the same
pixels. Across browser **engines** that is already hard (Gecko, WebKit, and
Blink rasterize text, sub-pixel anti-aliasing, and form controls differently — the
reason `crossBrowserDiffThreshold` is `0.03`, not `0.02`). Across **operating
systems** it is harder still: font hinting and available system fonts differ, so a
Firefox baseline captured on a developer's macOS will not match Firefox in CI on
Linux, regardless of where the PNG is stored.

Therefore **the storage backend is orthogonal to correctness**: committing,
LFS-ing, artifact-ing, or SaaS-ing a non-deterministic baseline all fail the same
way. The RFC makes deterministic capture a **precondition** for every backend:

- Cross-browser baselines are captured inside a **pinned Playwright container**
  (`mcr.microsoft.com/playwright:v<version>-<distro>`) whose version matches the
  project's installed Playwright, in **both** CI and local capture (via
  `docker run`).
- Each baseline is recorded in a **provenance manifest** (§7.3). The diff step
  refuses (or warns, per policy) when a baseline's provenance — engine, Playwright
  version, container image — does not match the current capture envelope. A
  Firefox/WebKit baseline captured on a bare host (not the container) is marked
  foreign and never silently trusted.

This is what turns "commit the PNGs" from a source of eternal false diffs into a
reliable gate.

## 6. Decision

### 6.1 Default backend: commit to the repository (ratified), LFS opt-in

The default `visualBaselines.backend` is **`commit`**. Baselines remain
git-tracked PNGs under `.claude/visual-qa/baselines/`, extended to the
`firefox` and `webkit` engines.

Rationale — a committed baseline is the only option that keeps the baseline
**versioned atomically with the code** and **visible in the PR diff**. When a
change intentionally alters the UI, the same PR updates the component *and* its
baseline, and a reviewer sees both together; when it does so unintentionally, the
diff surfaces it. Artifact and SaaS backends sever that link. Commit-to-repo also
needs **zero external accounts** and works **offline**, matching the framework's
self-hosted ethos.

The known cost of committing binaries — pack bloat as baselines are rewritten — is
handled by a **`storage` flag** rather than a different default:

- `storage: "git"` (default) — plain committed PNGs. Correct for the common case
  (a generated app with a few routes × engines × breakpoints).
- `storage: "lfs"` — adds a Git LFS filter for `baselines/**/*.png` to
  `.gitattributes`. Recommended once the baseline set is large (rule of thumb:
  more than ~50 baselines or ~25 MB cumulative). Flipping the flag is a documented
  migration (track-new-going-forward, or `git lfs migrate import` to rewrite
  history).

LFS is **not** the default because it taxes every consuming project — including
tiny ones — with `git lfs install` and GitHub LFS storage/bandwidth quotas, for a
benefit only large baseline sets realize.

### 6.2 A pluggable backend abstraction

`visualBaselines.backend` selects one of three adapters behind a common contract
(§8):

- **`commit`** (default) — self-hosted, git-tracked, `storage: git|lfs`.
- **`ci-artifact`** — baselines live as CI artifacts; each PR compares against the
  last **green `main`** build. No binaries in git.
- **`service`** — delegate storage, capture farm, diffing, and the review UI to
  Chromatic or Percy.

The abstraction is idiomatic Aurelius: it is the same “stable contract, swappable
implementation, config-selected” shape as `renderers/` and the agent-plugin
registry. It also means this RFC does not have to be re-opened to support a team
whose constraints differ from the default — they set `backend` and provide the
adapter's credentials/CI wiring.

### 6.3 Determinism + provenance are mandatory for all backends

Per §5: containerized capture with a pinned image, and a provenance manifest that
the diff step verifies. This applies regardless of `backend` — a `service`
backend still benefits because it pins the engine versions it renders against.

## 7. Design detail

### 7.1 Config schema — new `visualBaselines` section

Added to `.claude/pipeline.config.json` (and its JSON Schema). Strict
(`additionalProperties: false`), like the rest of the config.

```jsonc
"visualBaselines": {
  "enabled": true,
  "backend": "commit",                 // "commit" | "ci-artifact" | "service"
  "storage": "git",                    // backend=commit only: "git" | "lfs"
  "baselineDir": ".claude/visual-qa/baselines",
  "browsers": ["chromium", "firefox", "webkit"],
  "routes": ["/"],
  "breakpoints": { "mobile": 375, "desktop": 1440 },
  "threshold": 0.03,                   // cross-engine tolerance (== e2e.crossBrowserDiffThreshold)
  "blocking": false,                   // → true after determinism is proven (Phase B)
  "capture": {
    "mode": "container",               // "container" (required for firefox/webkit) | "local"
    "image": "mcr.microsoft.com/playwright:v1.55.0-noble",
    "waitAfterLoadMs": 1500,
    "fullPage": true
  },
  "provenance": { "manifest": ".claude/visual-qa/baselines/manifest.json" },
  "ciArtifact": {                      // backend=ci-artifact only
    "compareAgainst": "last-green-main",
    "retentionDays": 30
  },
  "service": {                         // backend=service only
    "provider": "chromatic",           // "chromatic" | "percy"
    "projectTokenEnv": "CHROMATIC_PROJECT_TOKEN"
  }
}
```

The existing `regressionTesting` section (same-browser chromium, `0.02`) is left
in place; `visualBaselines` owns the cross-browser dimension. §13 tracks whether
to unify them later.

### 7.2 Directory layout (backend = commit)

```
.claude/visual-qa/baselines/
├── manifest.json                       # provenance (§7.3), committed
├── chromium/home/{mobile_375px,desktop_1440px}.png
├── firefox/home/{mobile_375px,desktop_1440px}.png
└── webkit/home/{mobile_375px,desktop_1440px}.png
```

Transient captures and diffs stay gitignored, as today.

### 7.3 Provenance manifest

A committed `manifest.json` records, per baseline:

```jsonc
{
  "playwrightVersion": "1.55.0",
  "image": "mcr.microsoft.com/playwright:v1.55.0-noble",
  "baselines": {
    "firefox/home/desktop_1440px.png": {
      "sha256": "…",
      "capturedAt": "2026-07-01T12:00:00Z",
      "gitSha": "abc1234",
      "engine": "firefox",
      "route": "/",
      "breakpoint": "desktop",
      "host": "container"              // "container" | "local" — "local" firefox/webkit is untrusted
    }
  }
}
```

The comparator checks the current capture envelope against each baseline's
provenance and flags mismatches (stale Playwright version, foreign host, image
drift) instead of reporting a spurious pixel diff. This is the mechanism that
makes committed cross-browser baselines *mean* something.

## 8. Backend adapter contract

Each backend implements a small, uniform surface so the capture/compare scripts
are backend-agnostic:

| Operation | `commit` | `ci-artifact` | `service` |
| --------- | -------- | ------------- | --------- |
| `fetch()` — make baselines available locally | already in worktree (git/LFS) | download last-green-main artifact | fetch from provider (or provider compares server-side) |
| `store(set)` — persist new/updated baselines | write dir → `git add` (+ LFS filter) | upload artifact on merge to `main` | upload to provider |
| `compare(current)` — produce pass/fail + diffs | `visual-diff.js` (pixelmatch) | `visual-diff.js` vs. fetched artifact | provider's diff + review UI |
| Review surface | PR diff of PNGs | CI artifact + PR comment | provider dashboard |
| External dependency | none | CI provider | paid SaaS + token |

The comparator (`visual-diff.js`) and the provenance check are shared by
`commit` and `ci-artifact`; `service` swaps in the provider for capture+diff+store.

## 9. Alternatives considered (as the default)

- **Git LFS by default** — *rejected as default, adopted as a flag (§6.1).*
  Correct for large baseline sets, but imposes `git lfs install` and GitHub LFS
  quotas on every consuming project, including the small-app common case.
- **CI artifacts vs. last-green `main`** — *rejected as default, kept as an
  adapter (§6.2).* Avoids all repo bloat, but the baseline leaves the PR diff, so
  reviewers can no longer see the intended visual change alongside the code; and
  "last green main" needs CI plumbing to locate, pin, and download, plus a policy
  for the first build and for main going red.
- **Third-party service (Chromatic/Percy)** — *rejected as default, kept as an
  adapter (§6.2).* Best review UX and it operates real cross-engine render farms,
  but it introduces a **paid** external dependency, an account/token, and sends
  screenshots of possibly-proprietary UIs to a third party — contradicting a
  self-hosted, offline-capable framework's default posture.
- **Do nothing (status quo)** — *rejected.* Phase 7 keeps asserting a "comparison"
  it does not perform; the signal stays empty.
- **Delete Phase 7's cross-browser screenshots entirely** — *rejected.* The
  cross-engine signal is valuable once trustworthy; the fix is determinism +
  baselines, not removal.

## 10. Migration / phasing

Nothing beyond documentation lands before this RFC is Accepted. Implementation is
sequenced so each phase is independently reviewable:

- **Phase A — make the signal real (non-blocking).** Add the `visualBaselines`
  config + JSON Schema; add the provenance manifest; capture+diff `firefox`/
  `webkit` from committed baselines (extend `regression-test.sh` or add
  `cross-browser-baseline.sh`); **fix the mislabeled orchestration phase** so it
  compares. Backend = `commit`, `storage = git`, `blocking = false`.
- **Phase B — determinism, then teeth.** Pin the Playwright container for capture
  in CI and locally; enforce provenance. Once the observed false-positive rate is
  acceptable, allow `blocking: true` and `crossBrowserScreenshotsRequired: true`.
- **Phase C — the other adapters.** The `storage: "lfs"` flag +
  `.gitattributes` automation; the `ci-artifact` adapter (last-green-main); the
  `service` adapter (Chromatic/Percy). Each is its own issue.

## 11. Security & cost considerations

| Backend | Data exposure | Cost | Notes |
| ------- | ------------- | ---- | ----- |
| `commit` (git) | none (local repo) | git pack growth | default; simplest |
| `commit` (lfs) | none | GitHub LFS storage + bandwidth quota | flip when large |
| `ci-artifact` | CI provider only | artifact storage/retention | last-green plumbing |
| `service` | **screenshots sent to SaaS** | **paid subscription** | token in CI secrets; provider availability is a dependency |

The default keeps data in-repo and cost at zero; teams opting into `service`
accept the exposure and cost knowingly, via explicit config.

## 12. Acceptance & sign-off

This RFC is **Accepted**. Acceptance = maintainer approval of the RFC PR plus this
Status-row update with date and approver. The follow-up implementation issue
(§14) is the entry point for Phases A–C.

- Decision: **Accepted as proposed**
- Approver / date: PAMulligan (maintainer) · 2026-07-01 — RFC PR #112 approved & merged

## 13. Open questions (for reviewers)

1. **Unify or keep separate?** Should same-browser `regressionTesting` fold into
   `visualBaselines` (one section, `browsers` list) or stay distinct?
2. **Blocking threshold.** What measured false-positive rate justifies flipping
   cross-browser to a blocking gate (Phase B)?
3. **Container image pinning.** Track the Playwright image version automatically
   from the installed Playwright, or pin it explicitly in config (drift risk vs.
   surprise upgrades)?
4. **Local capture for firefox/webkit.** Warn-and-skip, or hard-fail, when a
   developer captures cross-engine baselines outside the container?
5. **LFS migration.** For projects flipping `git → lfs`, do we rewrite history
   (`git lfs migrate import`) or only track new baselines going forward?

## 14. Implementation tracking (AC #2)

Acceptance criterion (2) — "implementation tracked as a follow-up issue" — is
satisfied by a new issue that decomposes Phases A–C (§10) into deliverables and
references this RFC. It is created alongside this RFC's PR and **blocked on this
RFC's acceptance**:

- Follow-up implementation issue: **#111**

## References

- Prior design notes: `docs/plans/2026-03-24-cross-browser-e2e-testing.md`,
  `docs/plans/2026-03-25-screenshot-regression-testing.md`.
- Current tooling: `scripts/cross-browser-test.sh`, `scripts/capture-baselines.sh`,
  `scripts/regression-test.sh`, `scripts/visual-diff.js`.
- Config: `.claude/pipeline.config.json` (`regressionTesting`, `e2e`,
  `qualityGate`, `orchestration.phases.cross-browser`); tracking in
  `.gitignore:108–113`; `.gitattributes`.
- Process: `docs/rfcs/README.md`. Tracking issue: #85 · Milestone: v2.0.0.
