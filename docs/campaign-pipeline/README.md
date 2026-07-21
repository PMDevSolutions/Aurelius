# The Campaign Pipeline

`/build-campaign` is the flagship command: an autonomous 9-phase pipeline that turns a campaign goal into publish-ready, QA'd, human-approved assets. This guide walks every phase, gate, and artifact.

## Design Lineage

Maecenas inherits Aurelius's pipeline discipline, re-aimed at marketing's failure modes:

| Failure mode | Aurelius answer | Maecenas answer |
|--------------|-----------------|-----------------|
| Inconsistent output | design-token lockfile | **brand-guidelines.json lockfile** |
| Unverified work | enforced TDD before build | **strategy gate before drafting** |
| Endless "one more tweak" | bounded pixel-diff loop | **bounded editorial QA loop (max 5)** |
| Plausible-but-wrong content | pixel comparison vs Figma | **fact-check: every claim sourced** |
| Irreversible external actions | — | **human approval gate over publish/send/spend/schedule** |

## Phase by Phase

### Phase 0 — Brand Sync (conditional)

If `brand-guidelines.json` exists and `brandVoice.driftCheck.autoCheck` is on, recent content is linted against it. Drift found → you choose: fix the assets or evolve the lockfile (Phase 2). No lockfile → skip; Phase 2 creates it.

### Phase 1 — Brief Intake

The `campaign-brief-intake` skill auto-discovers context (lockfile, past campaign reports, personas, calendar commitments), asks **at most 5 questions** (objective/KPI, audience, channels, budget/constraints, approvers), and writes `.claude/plans/campaign-brief.json`. A provided brief document takes the fast-path: parsed, gaps-only questions.

Conditional research fan-out before Phase 3: `persona-research` (no personas), `seo-keyword-research` (SEO-led), `competitor-teardown` (competitive angle).

### Phase 2 — Brand Voice Lock (hard gate)

The `brand-voice-lock` skill creates or confirms `brand-guidelines.json`: voice attributes, tone contexts, lexicon (preferred/banned), claims policy, visual identity, disclaimers. **`requireLockfileBeforeDrafting` means exactly that** — Phases 4+ will not start without it.

### Phase 3 — Strategy Gate (human)

You approve the plan before production spends a token on drafts: objective and KPI vs baseline, audience and exclusions, single-minded message with proof, asset plan with owners, budget envelope, timeline, compliance flags. Recorded in `campaign-brief.json → approvals.strategyGate`. Rejection here is cheap — that's the point.

### Phases 4-9 — Parallel Execution

The `parallel-orchestration` skill takes the dependency graph from `pipeline.config.json → orchestration` and runs **per-asset lanes**: each asset flows draft → editorial QA → channel checks independently (max 3 concurrent), with one hard barrier — the approval gate.

**Phase 4 — Calendar.** `content-calendar.json` generated with QA/approval lead times worked backwards from publish dates; `validate-content-calendar.js` must pass.

**Phase 5 — Drafts.** Each asset's `ownerAgent` (from `assetTypes` config) drafts via its skill: email-sequence, social-content-batching, ad-copy-variants, landing-page-copy; blog posts and releases draft directly.

**Phase 6 — Editorial QA (the loop).** Per asset, up to `editorialLoop.maxRevisions` (5):
1. `brand-voice-lint.js` — banned words, naming, disclaimers → BLOCK on hits
2. `readability-score.js` — Flesch vs the asset type's target → WARN (configurable)
3. **Fact-check** — every claim classified SOURCED / NEEDS-SOURCE / UNSUPPORTED / FABRICATED. The first is fine; the middle two block until sourced, reworded, or cut; **FABRICATED blocks unconditionally and cannot be waived below the gate**
4. Targeted fixes only — no drive-by rewrites; the loop preserves the approved angle

Exhausted loop → escalation to you with the findings. Never silent shipping.

**Phase 7 — Channel Checks.** `seo-check.js` for web assets, platform limits and disclosure tags for social/ads. Advisory unless configured blocking.

**Phase 8 — Approval Gate (human, non-negotiable).** The pipeline assembles `.claude/campaigns/<slug>/approval-package.md`: every asset in final form with its QA evidence and claim-source list, the spend plan with kill criteria, the send/publish schedule. You decide per asset: **approve / revise / cut**. Only approved assets move to `scheduled`; paid campaigns stage **paused** until activation is explicitly approved. The gate has no timeout and no default — the schema pins `required` and `blocking` to `true`.

**Phase 9 — Report.** `campaign-report.md`: what shipped, QA statistics, the measurement plan (baselines, UTMs, dashboards, launch+7d/+30d report schedule), learnings and next-cycle hypotheses.

## Resumability

Every phase reads and writes artifacts on disk; TodoWrite tracks phase state. An interrupted session resumes by re-running `/build-campaign` — existing artifacts trigger resume prompts instead of repeat work.

## Failure Handling

- Blocking phase fails → dependents stop; the failure and resume point are reported precisely
- One lane fails → sibling lanes continue; the report shows per-lane outcomes
- Gate rejection → captured into the brief; re-enter at the right phase
- Legal triggers (`compliance.legalReviewTriggers`) → legal-compliance-checker **before** the gate

## Configuration

Every gate and threshold in this guide is a field in `.claude/pipeline.config.json` — see [pipeline-configuration.md](../onboarding/pipeline-configuration.md). Validate edits with `./scripts/validate-pipeline-config.sh`.

## Smaller Entry Points

The same gates back the single-asset commands: `/write-content`, `/create-blog-article`, `/build-email-sequence`. There is no ungated path to external output.
