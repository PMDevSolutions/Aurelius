# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

This is **Maecenas** — a Claude Code-integrated **marketing framework**: a "marketing brain" providing specialized agents, skills, slash commands, and a gated brief-to-publish-ready campaign pipeline. It is the marketing sibling of Aurelius (React), Nerva (backend), and Flavian (WordPress).

The framework is designed for:
- End-to-end campaign development (brief → strategy → calendar → drafts → editorial QA → approval → report)
- Brand-governed content production across blog, email, social, paid, PR, video, and landing pages
- Evidence-based strategy work (market research, personas, competitive teardowns, keyword plans)
- Honest measurement (analytics reports, attribution truth, budget pacing)

---

## Hard Operating Rules (non-negotiable)

These rules bind every agent, skill, and command in this repository:

1. **Never fabricate.** No invented statistics, studies, quotes, testimonials, reviews, or user counts — anywhere, ever. A gap in the data is reported as a gap.
2. **Cite everything.** Every factual claim carries a source (linked, dated). Claims that cannot be sourced are reworded as opinion or cut. Fact-check findings of `FABRICATED` block an asset unconditionally.
3. **The human approval gate is absolute.** Nothing is published, sent, scheduled, or spent externally without explicit human sign-off recorded per asset (`pipeline.config.json → humanApproval`). There is no timeout-approve, no default-approve, and no exception for urgency.
4. **brand-guidelines.json is binding.** The brand lockfile governs voice, lexicon, claims, and visual identity for all output. Violations block at editorial QA; drafting does not start without a lockfile.
5. **Flag legal/compliance topics.** Anything touching regulated topics (health, finance, legal, employment, housing), named-competitor comparisons, sweepstakes, testimonials/endorsements, or personal data routes through the legal-compliance-checker **before** the approval gate.
6. **Honest persuasion only.** No dark patterns, fake scarcity, fake urgency, purchased lists, bought engagement, or astroturfing. Consent governs every send.

## Project Structure

```
project-root/
├── .claude/              # Claude Code configuration
│   ├── agents/           # 42 specialized marketing agents
│   ├── skills/           # 13 marketing skills
│   ├── commands/         # Slash commands (/build-campaign, /write-content, …)
│   ├── hooks/            # 3 hook scripts (configured in settings.json)
│   └── pipeline.config.json  # Gates, thresholds, asset types, approval scope
├── scripts/              # Marketing utilities + framework verification
├── templates/            # Starter artifacts (brand lockfile, brief, calendar, …)
├── content/              # Produced assets (blog/, email/, social/, press/, …)
├── brand-guidelines.json # THE brand lockfile (created by /setup-brand)
├── content-calendar.json # Validated production schedule
├── docs/                 # Documentation
│   ├── onboarding/       # Quickstart, architecture, configuration
│   ├── campaign-pipeline/# The flagship pipeline guide
│   ├── brand-setup/      # Brand lockfile guide (+ generated brand-voice.md)
│   └── marketing-standards/ # Voice, claims, SEO, email, social standards
└── CLAUDE.md             # This file
```

## Marketing Scripts

```bash
# Brand-voice enforcement against brand-guidelines.json
node scripts/brand-voice-lint.js content/ [--json]
node scripts/brand-voice-lint.js --self-test     # validate the lockfile itself

# Readability vs per-asset-type targets (pipeline.config.json → readability)
node scripts/readability-score.js content/ [--check] [--type blog-post] [--json]

# On-page SEO checks (title/meta/keyword/headings/links/sources)
node scripts/seo-check.js content/ [--json]

# Content calendar validation (dates, lead times, dependencies, cadence caps)
node scripts/validate-content-calendar.js [--file path] [--json]

# Run every local quality check with a summary
./scripts/verify-all.sh                # human-readable
./scripts/verify-all.sh --ci           # JSON output, non-zero exit on failure

# Validate pipeline.config.json against its JSON Schema
./scripts/validate-pipeline-config.sh
node scripts/validate-pipeline-config.js --json

# Flag drift between documented agent/skill counts and disk
./scripts/check-doc-counts.sh [--json]

# Author / validate / install / test custom agents as versioned plugins
node scripts/create-agent-plugin.js <name> [--description ...] [--model ...] [--tools ...] [--with-hooks]
node scripts/validate-agent-plugin.js --dir <plugin-dir>   # or --all
node scripts/agent-registry.js (list | resolve <name> | install <name> | uninstall <name>)
node scripts/test-agent-plugin.js --dir <plugin-dir>       # or --all
```

## Development Commands

```bash
pnpm install              # Install dependencies (always use pnpm)
pnpm test                 # Vitest suite for scripts/
pnpm verify               # = ./scripts/verify-all.sh
```

---

## Claude Code Architecture & Configuration

### Installed Plugins (4 Total)

- **episodic-memory** — Conversation search and memory
- **commit-commands** — Git workflow automation
- **superpowers** — Advanced development workflows
- **ai-taskmaster** — Task management (local)

**Note:** GitHub integration via `gh` CLI

**Full documentation:** `.claude/PLUGINS-REFERENCE.md`

---

### Custom Agents (42 Total)

42 specialized agents covering the full marketing lifecycle:

| Category | Count | Key Agents |
|----------|-------|------------|
| Strategy & Research | 5 | brand-strategist, positioning-messaging, market-researcher, competitive-analyst, customer-persona-builder |
| Content | 7 | content-strategist, copywriter, blog-writer, seo-content-writer, email-marketer, video-script-writer, content-creator |
| Channel | 9 | social-media-manager, paid-ads-specialist, seo-specialist, pr-outreach, instagram-curator, tiktok-strategist, twitter-engager, reddit-community-builder, app-store-optimizer |
| Lifecycle & Growth | 4 | growth-marketer, conversion-optimizer, lifecycle-email, retention-specialist |
| Analytics & Operations | 5 | marketing-analytics-reporter, attribution-analyst, budget-planner, marketing-ops, brand-compliance-checker |
| Creative Direction | 2 | art-director, campaign-producer |
| Insights & Planning | 4 | feedback-synthesizer, experiment-tracker, sprint-prioritizer, project-shipper |
| Operations & Support | 2 | legal-compliance-checker, support-responder |
| Meta | 2 | agent-expert, command-expert |
| Bonus | 2 | joker, studio-coach |

Agents are invoked automatically based on task context. Every agent that produces external-facing output operates behind the human approval gate.

**Full catalog:** `.claude/CUSTOM-AGENTS-GUIDE.md`

---

### Skills (13 Total)

| Skill | Purpose | Triggers |
|-------|---------|----------|
| campaign-brief-intake | Structured interview → campaign-brief.json | Phase 1 of /build-campaign |
| brand-voice-lock | Extract + lock brand rules → brand-guidelines.json lockfile | Phase 2 of /build-campaign, /setup-brand |
| content-calendar | Dated, validated production schedule → content-calendar.json | Phase 4, /plan-content-calendar |
| editorial-qa | Brand voice + readability + fact-check loop (max 5 revisions) | Phase 6, /write-content, "review this content" |
| parallel-orchestration | Concurrent phase runner with per-asset lanes | Invoked by /build-campaign after the strategy gate |
| seo-keyword-research | Intent-classified keyword plan → keyword-plan.json | "keyword research", SEO-led campaigns |
| competitor-teardown | Sourced, dated teardown reports | /competitor-teardown, "analyze competitor" |
| persona-research | Evidence-labeled personas + verbatim bank | "build personas", missing personas at brief time |
| email-sequence | Sequence spec + drafts, staged OFF pending approval | /build-email-sequence, "welcome flow" |
| social-content-batching | One idea → platform-native post batch | "social batch", "repurpose this post" |
| ad-copy-variants | One-variable test matrices with hypotheses | "ad variants", paid components |
| analytics-report | Standardized reports; gaps reported, never filled | /analyze-performance, Phase 9 |
| landing-page-copy | Full-page conversion copy with message match | "landing page", CRO variants |

**Full catalog:** `.claude/skills/README.md`

---

### The Campaign Pipeline

**Single command:** `/build-campaign <goal or brief path>`

Autonomous 9-phase pipeline that turns a campaign goal into publish-ready, approved assets:

```
/build-campaign launch the new analytics feature

  [0] BRAND SYNC     → brand-voice-lint drift check (conditional, if lockfile exists)
  [1] BRIEF INTAKE   → campaign-brief-intake skill → campaign-brief.json
  [2] BRAND VOICE LOCK (HARD GATE) → brand-guidelines.json — no lockfile, no drafting
  [3] STRATEGY GATE  (HUMAN) → objective, audience, channels, budget approved
  ─── PARALLEL ORCHESTRATION (phases 4-9, per-asset lanes, max 3 concurrent) ───
  [4] CALENDAR       → content-calendar.json (validated)
  [5] DRAFTS         → channel specialists draft per asset plan
  [6] EDITORIAL QA   → brand voice + readability + fact-check loop → max 5 revisions
  [7] CHANNEL CHECKS → seo-check / platform limits (non-blocking)
  [8] APPROVAL GATE  (HUMAN, NON-NEGOTIABLE) → per-asset sign-off;
      nothing publishes, sends, schedules, or spends without it
  [9] REPORT         → campaign-report.md + measurement plan
```

**Key artifacts:**
- `brand-guidelines.json` — Single source of truth for voice, tone, lexicon, claims policy, visual identity
- `campaign-brief.json` — Machine-readable campaign plan with objective, audience, asset plan, and approvals record
- `content-calendar.json` — Validated schedule with QA/approval lead times
- `pipeline.config.json` — Gates, thresholds, asset-type definitions, approval scope
- `.claude/campaigns/<slug>/` — approval-package.md, editorial-qa-report.md, campaign-report.md

**Features:**
- **Enforced brand lock** — the lockfile gates drafting the way TDD once gated builds
- **Bounded editorial QA loop** — mechanical lint + readability + human-standard fact-check, max 5 iterations, then escalation (never silent shipping)
- **Asset-type awareness** — blog posts, emails, sequences, social batches, ad campaigns, landing pages, press releases, and video scripts each get tailored QA checks and approval scopes
- **Mandatory human approval** — the analog of the old TDD gate, applied to everything external
- **Parallel orchestration** — per-asset lanes with a hard barrier at the approval gate
- **Resumable** — TodoWrite tracks phase progress across interrupted sessions

**Documentation:** `docs/campaign-pipeline/README.md`

---

### MCP Server Integration

- **Canva AI Connector** — Creative production: brand templates, asset generation, exports (used by art-director and social batching)
- Optional connectors (Gmail, Notion, Google Drive, Google Calendar) can support distribution and planning — always behind the approval gate; none are required.

The Figma/Playwright/Chrome-DevTools servers used by the Aurelius ancestor are **not** required by this framework.

---

### Parallel Orchestration

Pipeline phases 4-9 run concurrently via the `parallel-orchestration` skill:
- **Dependency graph** defined in `pipeline.config.json → orchestration.phases`
- **Per-asset lanes**: each asset flows draft → QA → channel-check independently
- **Hard barrier** at the approval gate — no lane overtakes it
- **Resource tagging** prevents write conflicts (calendar and brief writes serialize)
- **Streaming results** with a batch summary and speedup factor
- **Fallback** to sequential execution when `orchestration.enabled` is `false`

---

### Automated Hooks (3 Total)

Each hook is a standalone script under `.claude/hooks/`, registered in `.claude/settings.json` as a `PostToolUse` hook on the `Bash` matcher. Hooks receive `$TOOL_INPUT` and `$TOOL_OUTPUT` as positional args, follow a defensive skeleton (`set -u`, `trap 'exit 0' ERR`, always `exit 0`), and are testable in isolation. See [docs/guides/hooks.md](docs/guides/hooks.md) for the full guide.

| Script | Trigger | Action |
|--------|---------|--------|
| `pre-commit-brand-guard.sh` | `git commit` detected | Lints staged content/ files against brand-guidelines.json, warns on violations |
| `editorial-qa-reminder.sh` | Clean brand-voice-lint run | Reminds that readability + fact-check/SEO complete the QA trio |
| `approval-gate-guard.sh` | Publish/send/spend-shaped commands | Warns that human approval must be on record before external actions |

---

## Marketing Standards

### Brand Voice
- `brand-guidelines.json` is the single source of truth — never hardcode voice decisions that contradict it
- Banned words are hard blocks; preferred-term mappings are warnings
- Update the lockfile deliberately (versioned, with rationale) — never silently

### Claims & Citations
- Statistics: linked, dated source or they don't ship
- Superlatives ("best", "#1", "guaranteed"): substantiation on file or reworded
- Testimonials: real, permissioned, documented — always
- Comparative claims: current, accurate, fair; named competitors trigger legal review

### Readability (Flesch Reading Ease targets)
- Blog ≥ 60 · Email ≥ 65 · Landing pages ≥ 65 · Social ≥ 70 · Ads ≥ 75 · Press ≥ 55
- Targets live in `pipeline.config.json → readability.targets`; checked by `readability-score.js`

### SEO
- One intent, one page; SERP-verified intent before drafting
- Title ≤ 60 chars, meta ≤ 155, keyword in title + H1, ≥ 2 internal links, ≥ 1 cited source
- White-hat only — rankings earned by being the best answer

### Email Compliance
- Consent-based sending only; no purchased or scraped lists, ever
- Every send: working unsubscribe, physical address, accurate sender identity
- GDPR/CASL contexts route through legal-compliance-checker before the gate

### Approvals
- `publish`, `send`, `spend`, `schedule` all require explicit human approval per asset
- Spend requests state amount, duration, expected outcome, and kill criteria
- Approvals and waivers are logged in the campaign's approval package

---

### Development Workflow with Claude Code

**1. First-time setup**
```bash
/setup-brand              # create brand-guidelines.json — required before drafting
```

**2. Run a campaign**
```
User: "/build-campaign launch our new reporting feature"
Claude: [9-phase pipeline: brief → lockfile → strategy gate → calendar →
         drafts → editorial QA → approval gate → report]
```

**3. Single assets**
```
User: "/write-content blog-post why attribution models disagree"
Claude: [mini-brief → blog-writer draft → editorial QA loop → QA evidence + approval note]
```

**4. Using Custom Agents**
```
User: "Why did CAC rise last month?"       → marketing-analytics-reporter
User: "Tear down competitor X"             → competitive-analyst (+ /competitor-teardown)
User: "Sharpen this value proposition"     → positioning-messaging
User: "Build the winback flow"             → lifecycle-email (+ /build-email-sequence)
```

---

### Quick Command Reference

**Campaign & Content Pipelines:**
```bash
/build-campaign <goal>        # Full autonomous campaign pipeline (flagship)
/write-content <type> <topic> # Single asset through the QA gates
/create-blog-article <topic>  # SEO article end to end
/build-email-sequence <goal>  # Sequence spec + drafts, staged for approval
/plan-content-calendar [...]  # Standalone calendar planning
/setup-brand [sources]        # Create the brand lockfile (first run)
```

**Research & Analysis:**
```bash
/competitor-teardown <name>   # Sourced competitive teardown
/seo-audit [path|url]         # Prioritized SEO findings
/analyze-performance [data]   # Report from real data (never fabricated)
```

**Quality Verification:**
```bash
/verify-all                   # Run every local quality check (--ci for JSON)
```

**Git Workflows (via commit-commands):**
```bash
/commit                       # Structured commit
/commit-push-pr               # Commit + push + PR
/clean_gone                   # Clean merged branches
```

**Quality Scripts:**
```bash
node scripts/brand-voice-lint.js content/     # Brand lockfile enforcement
node scripts/readability-score.js content/ --check
node scripts/seo-check.js content/
node scripts/validate-content-calendar.js
./scripts/verify-all.sh                       # All checks with summary
./scripts/check-doc-counts.sh                 # Agent/skill count drift
./scripts/validate-pipeline-config.sh         # Config vs schema
```

**Agent Plugins** (custom agents as versioned plugins — see `docs/guides/agent-plugins.md`):
```bash
node scripts/create-agent-plugin.js <name> [--description ...] [--model ...] [--tools ...] [--with-hooks]
node scripts/validate-agent-plugin.js --dir <plugin-dir>   # or --all
node scripts/agent-registry.js (list | resolve <name> | install <name> | uninstall <name>)
node scripts/test-agent-plugin.js --dir <plugin-dir>       # or --all
```

---

**Last Updated:** 2026-07-21
**Architecture:** 42 agents, 13 skills, 4 plugins + gh CLI, Canva MCP, 20 scripts, 3 hooks

> **Keeping counts in sync:** When adding or removing agents or skills, update all count references across the project. Search for the old count number in `*.md` files to find all references: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/onboarding/`, and `.claude/AGENT-NAMING-GUIDE.md`. The agent and skill counts are enforced automatically by `scripts/check-doc-counts.sh` (run in CI and on pre-commit), which recounts `.claude/agents/` and `.claude/skills/` and fails on any documented count that disagrees.
