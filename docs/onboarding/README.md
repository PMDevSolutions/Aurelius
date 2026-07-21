# Marketer Onboarding Guide

Welcome to **Maecenas** — a Claude Code-integrated marketing framework. Named after Gaius Cilnius Maecenas, Augustus's counselor and Rome's first great communications strategist, this project brings discipline, enforceable brand standards, and principled automation to modern marketing work.

## Who This Is For

- Marketers who want Claude Code to carry real campaign work — strategy, drafting, QA, reporting — without sacrificing brand control or publishing safety
- Teams that want every asset fact-checked, brand-linted, and human-approved before it goes anywhere
- Anyone arriving from the sibling frameworks (Aurelius, Nerva, Flavian) — the architecture will feel familiar

## Start Here

| Step | Document | Time |
|------|----------|------|
| 1 | [Quickstart](quickstart.md) — clone to first campaign | ~10 min |
| 2 | [Architecture](architecture.md) — how the 42 agents, 13 skills, and pipeline connect | ~15 min |
| 3 | [Pipeline Configuration](pipeline-configuration.md) — every gate and threshold explained | reference |
| 4 | [Troubleshooting](troubleshooting.md) — common issues and fixes | reference |

Then go deeper:

- **[Campaign Pipeline Guide](../campaign-pipeline/README.md)** — the flagship `/build-campaign` flow, phase by phase
- **[Brand Setup Guide](../brand-setup/README.md)** — creating and maintaining `brand-guidelines.json`
- **[Marketing Standards](../marketing-standards/README.md)** — voice, claims, readability, SEO, email, and social rules

## The Three Ideas That Run Everything

1. **The brand lockfile.** `brand-guidelines.json` is the single source of truth for voice, lexicon, claims policy, and visual identity. A linter enforces it mechanically; editorial QA enforces it editorially; drafting refuses to start without it.
2. **The bounded editorial QA loop.** Every asset passes brand-voice lint + readability scoring + fact-check, iterating at most 5 times before escalating to you. Fabricated claims block unconditionally.
3. **The human approval gate.** Nothing is published, sent, scheduled, or spent without your explicit sign-off, recorded per asset. The pipeline drafts and stages; you decide.

## First Session Checklist

- [ ] `pnpm install`
- [ ] `/setup-brand` — create the brand lockfile
- [ ] `./scripts/verify-all.sh` — confirm the framework is healthy
- [ ] `/build-campaign <a real goal>` — run the pipeline end to end
- [ ] Read the approval package it produces before approving anything
