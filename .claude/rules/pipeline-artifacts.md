---
paths:
  - ".claude/plans/**"
  - ".claude/pipeline.config.json"
  - ".claude/pipeline.config.schema.json"
  - ".claude/visual-qa/**"
  - "**/design-tokens.lock.json"
  - "**/build-spec.json"
  - "**/design-brief.json"
---

# Pipeline artifacts

- **`.claude/plans/build-spec.json`** is the build plan: source, renderer, appType, pages, components (with `category`), E2E flows. The intake skills write it; later phases only read it, except figma-intake's node-ID backfill and design-brief-to-figma's `figma` block.
- **`design-tokens.lock.json`** is the single source of truth for design values. Only `design-token-lock` and `canva-token-inference` write it (token inference only after the user confirms the values); `./scripts/sync-tokens.sh` reports drift against the source. Components reference tokens, never literals.
- **`.claude/plans/pipeline-state.json`** tracks a pipeline run; its shape is in `.claude/skills/build-from-figma/SKILL.md` → Progress Tracking. Rewrite it at every phase boundary and after each component and page result; the SessionStart hook reads it to say where an interrupted run stopped.
- **`.claude/pipeline.config.json`** holds the thresholds and bounds the pipelines and hooks read (`iterationLoop.maxVisualIterations` 5, `iterationLoop.diffPassThreshold` 0.02, `tdd.coverageThreshold` 80, `bundleSize.maxSizeKb` 200). Change it together with `pipeline.config.schema.json`, then run `./scripts/validate-pipeline-config.sh`.
- **`.claude/visual-qa/baselines/`** is committed, with per-baseline provenance in `manifest.json` (RFC 0002). Screenshots, diffs and reports elsewhere under `.claude/visual-qa/` are regenerated on each run.
- `.claude/plans/` is gitignored: build specs, briefs and state belong to one checkout.
