# RFC 0003: Maecenas — Transforming Aurelius into a Marketing Framework

- **Status:** Accepted
- **Date:** 2026-07-21
- **Authors:** Paul Mulligan, Claude
- **Supersedes:** N/A (repurposes the Aurelius architecture end-to-end)

## Summary

Transform this repository (a fork of Aurelius, the Claude Code React-development framework) into **Maecenas**, a professional marketing framework — a "marketing brain" for Claude Code that handles end-to-end marketing work the way Aurelius handled app development. The architectural philosophy is preserved exactly (specialized agents + skills + slash commands + a configurable, gated pipeline + a CLAUDE.md brain + onboarding docs); all software-development substance is replaced with marketing substance.

The codename follows the family style (Aurelius, Nerva, Flavian): **Maecenas** — Gaius Cilnius Maecenas, Augustus's counselor and patron of Virgil and Horace, effectively Rome's first PR strategist.

## Motivation

Aurelius proved the shape: a repo-as-operating-system where Claude Code carries specialized agents, enforced quality gates, a lockfile as single source of truth, and a bounded iteration loop. Marketing work has the same failure modes the pipeline was built to prevent — inconsistent output (brand drift), unverifiable claims (the fabrication risk), unbounded revision cycles, and irreversible external actions (publishing, sending, spending). The same machinery, re-aimed, solves them.

## Design

### Structural analogs

| Aurelius (design → code) | Maecenas (brief → publish-ready asset) |
|--------------------------|----------------------------------------|
| figma-intake → build-spec.json | campaign-brief-intake → campaign-brief.json |
| design-token-lock → design-tokens.lock.json | brand-voice-lock → brand-guidelines.json |
| TDD hard gate before build | Strategy hard gate before drafting |
| pixel-diff visual QA loop (max 5 iterations) | editorial QA loop: brand voice + readability + fact-check (max 5 revisions) |
| Quality gate: coverage, types, Lighthouse | Quality gate: brand compliance, readability, SEO checklist, citations |
| — (no analog) | **Human approval gate: nothing publishes, sends, or spends without explicit sign-off (hard, non-negotiable)** |
| build-report.md | campaign-report.md |

### Phase plan (one commit per phase)

- **Phase 2 — Agents.** 56 → 42: remove 32 code-only agents; adapt 10 (8 renames: trend-researcher→market-researcher, ux-researcher→customer-persona-builder, analytics-reporter→marketing-analytics-reporter, finance-tracker→budget-planner, brand-guardian→brand-compliance-checker, visual-storyteller→art-director, studio-producer→campaign-producer, growth-hacker→growth-marketer; 2 in-place reframes: sprint-prioritizer, project-shipper); author 18 new marketing agents (brand-strategist, positioning-messaging, competitive-analyst, content-strategist, copywriter, seo-content-writer, email-marketer, blog-writer, video-script-writer, social-media-manager, paid-ads-specialist, seo-specialist, pr-outreach, conversion-optimizer, lifecycle-email, retention-specialist, attribution-analyst, marketing-ops). Keep 14 already-marketing/product/ops/meta agents. Rewrite CUSTOM-AGENTS-GUIDE.md and AGENT-NAMING-GUIDE.md.
- **Phase 3 — Skills.** 24 → 13: remove React/testing/design-to-code skills; author 12 marketing skills (campaign-brief-intake, brand-voice-lock, seo-keyword-research, content-calendar, editorial-qa, email-sequence, social-content-batching, ad-copy-variants, competitor-teardown, persona-research, analytics-report, landing-page-copy); keep parallel-orchestration. Rewrite skills/README.md.
- **Phase 4 — Pipeline & commands.** Rewrite pipeline.config.json (+ schema) for the brief→asset pipeline: brand-voice gates, per-channel readability targets, fact-check policy, SEO checklist, bounded revision loop, mandatory human approval gate, assetTypes replacing appTypes. Commands: remove 8 code commands; keep/re-ground create-blog-article; repoint verify-all; add /build-campaign (flagship), /write-content, /plan-content-calendar, /seo-audit, /competitor-teardown, /build-email-sequence, /analyze-performance, /setup-brand.
- **Phase 5 — Scripts & cleanup.** Delete code-only scripts, packages/pipeline, renderers/, .claude/visual-qa; repurpose templates/ into marketing starter templates. Add lightweight utilities: readability-score.js, brand-voice-lint.js, validate-content-calendar.js, seo-check.js. Replace the 8 build/test hooks with 3 marketing hooks. Keep the agent-plugin toolchain, doc-count enforcement, and pipeline-config validation.
- **Phase 6 — Docs & brain.** Rewrite CLAUDE.md as the marketing brain with hard operating rules (never fabricate statistics or testimonials; cite sources for claims; nothing external without the approval gate; brand-guidelines.json is binding; flag legal/compliance topics). Rewrite README.md and docs/ (onboarding, campaign-pipeline guide, brand-setup guide, marketing-standards). Update MCP/plugin references (drop Figma/Playwright/Chrome DevTools/Sentry; keep Canva; document optional Gmail/Notion/Drive connectors as gated).

### Hard operating rules (constitutional, enforced in config + CLAUDE.md)

1. Never fabricate statistics, quotes, testimonials, or reviews.
2. Every factual claim carries a source; unverifiable claims are findings, not filler.
3. Nothing is published, sent, or spent without an explicit human approval gate.
4. brand-guidelines.json is binding on all output; violations block at editorial QA.
5. Regulated topics (health, finance, legal, endorsements, personal data) are flagged for legal-compliance review.

## Consequences

- The repo stops being able to build apps; Aurelius remains the sibling for that (see Related Projects).
- Counts change everywhere (agents 56→42, skills 24→13); `check-doc-counts.sh` remains the enforcement mechanism, reconciled in Phase 6.
- CI workflows tied to Vitest/Stryker/Playwright are removed or rewired in Phase 5.
- Git history preserves the Aurelius lineage; renames are content rewrites, not `git mv`, since substance changes entirely.

## Alternatives considered

- **Greenfield repo:** rejected — the fork inherits battle-tested conventions (agent format, pipeline config schema, hooks skeleton, docs structure) that make the marketing framework feel like a sibling from day one.
- **Keeping dual-purpose (code + marketing):** rejected — mixed rosters dilute agent auto-selection and double the maintenance surface.
