# Maecenas

A Claude Code-integrated marketing framework with specialized agents, brand-voice enforcement, and a gated brief-to-publish-ready campaign pipeline.

Named for Gaius Cilnius Maecenas — Augustus's counselor and patron of Virgil and Horace, Rome's first great communications strategist.

## What This Framework Provides

- **42 Custom Agents** — Specialized AI agents for strategy, content, channels, lifecycle growth, analytics, creative direction, and operations
- **13 Marketing Skills** — Automated workflows for campaign briefs, brand-voice locking, editorial QA, keyword research, calendars, email sequences, social batching, ad variants, teardowns, personas, and reporting
- **9-Phase Campaign Pipeline** — Turn a campaign goal into publish-ready, approved assets with a single command
- **Brand Lockfile Enforcement** — `brand-guidelines.json` governs voice, lexicon, claims, and visual identity; a linter and the editorial QA loop enforce it mechanically
- **A Non-Negotiable Approval Gate** — nothing is published, sent, scheduled, or spent without explicit human sign-off
- **Quality Scripts** — brand-voice lint, readability scoring, on-page SEO checks, calendar validation, and a one-command verification suite

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd maecenas

# Install dependencies
pnpm install

# Create your brand lockfile (required before any drafting)
/setup-brand

# Run your first campaign
/build-campaign launch our new feature
```

### Build a Campaign (Autonomous Pipeline)

```
/build-campaign grow newsletter signups to 500/month by September
```

This runs a 9-phase autonomous pipeline:

```
[0] Brand Sync    → Drift check vs brand-guidelines.json (conditional)
[1] Brief Intake  → Interview → campaign-brief.json
[2] Brand Lock    → brand-guidelines.json (hard gate — no lockfile, no drafting)
[3] Strategy Gate → HUMAN approval of objective, audience, channels, budget
[4] Calendar      → content-calendar.json (validated)
[5] Drafts        → Channel specialists draft every asset (parallel lanes)
[6] Editorial QA  → Brand voice + readability + fact-check loop (max 5 revisions)
[7] Channel Checks→ SEO checklist / platform limits (non-blocking)
[8] Approval Gate → HUMAN sign-off per asset — publish/send/spend/schedule all gated
[9] Report        → campaign-report.md + measurement plan
```

## Directory Structure

```
project-root/
├── content/              # Produced assets (blog/, email/, social/, press/, …)
├── brand-guidelines.json # The brand lockfile — single source of truth
├── content-calendar.json # Validated production schedule
├── scripts/              # Marketing utilities
│   ├── brand-voice-lint.js        # Lockfile enforcement (banned words, claims, naming)
│   ├── readability-score.js       # Flesch targets per asset type
│   ├── seo-check.js               # On-page SEO checks
│   ├── validate-content-calendar.js # Calendar structure + lead times
│   ├── verify-all.sh              # Every check, one summary
│   ├── validate-pipeline-config.js # Config vs JSON Schema
│   └── check-doc-counts.sh        # Agent/skill count drift guard
├── templates/            # Starter artifacts
│   ├── brand/                     # brand-guidelines.template.json
│   ├── campaign/                  # campaign-brief.template.json
│   ├── calendar/                  # content-calendar.template.json
│   ├── email/                     # email-sequence.template.json
│   └── content/                   # blog-post + press-release skeletons
├── docs/                 # Documentation
│   ├── onboarding/                # Quickstart, architecture, configuration
│   ├── campaign-pipeline/         # The flagship pipeline guide
│   ├── brand-setup/               # Brand lockfile guide
│   └── marketing-standards/       # Voice, claims, SEO, email, social standards
├── .claude/              # Claude Code configuration
│   ├── agents/                    # 42 custom agents
│   ├── skills/                    # 13 marketing skills
│   ├── commands/                  # Slash commands (/build-campaign, /write-content, …)
│   ├── pipeline.config.json       # Gates, thresholds, asset types, approval scope
│   ├── CUSTOM-AGENTS-GUIDE.md     # Agent catalog
│   └── PLUGINS-REFERENCE.md       # Plugin reference
├── CLAUDE.md             # Claude Code project instructions (the marketing brain)
└── README.md             # This file
```

## The Campaign Pipeline

### How It Works

The `/build-campaign` command takes a goal (or brief document) and autonomously produces a complete, QA'd, approval-ready asset set. Key enforcement rules:

- **The brand lockfile is mandatory** — drafting refuses to start without `brand-guidelines.json`
- **Editorial QA is bounded** — brand-voice lint, readability scoring, and fact-check per asset, max 5 revision iterations, then escalation (never silent shipping)
- **Fabrication blocks unconditionally** — statistics without sources, invented testimonials, and fake urgency never survive QA
- **The approval gate is human** — publish, send, spend, and schedule all require explicit sign-off, recorded per asset

### Supported Asset Types

| Asset Type | Owner Agent | QA Checks | Gated Actions |
|-----------|-------------|-----------|---------------|
| blog-post | blog-writer | voice, readability, fact-check, SEO | publish |
| email / email-sequence | email-marketer / lifecycle-email | voice, readability, fact-check, compliance elements | send |
| social-batch | social-media-manager | voice, readability, fact-check, platform limits, disclosure | publish, schedule |
| ad-campaign | paid-ads-specialist | voice, readability, fact-check, platform policy, message match | **spend**, publish |
| landing-page | copywriter | voice, readability, fact-check, SEO, message match | publish |
| press-release | pr-outreach | voice, fact-check, quote verification | send, publish |
| video-script | video-script-writer | voice, readability, fact-check, hook payoff | publish |

### Pipeline Configuration

All gates and thresholds are configurable in `.claude/pipeline.config.json`:

- Editorial loop limit (default: 5 revisions)
- Readability targets per asset type (Flesch: blog ≥ 60, email ≥ 65, social ≥ 70, ads ≥ 75)
- Fact-check policy (fabrication always blocks — not configurable to anything weaker)
- SEO checklist thresholds (title ≤ 60, meta ≤ 155, links, sources)
- Human approval scope (publish/send/spend/schedule — `required` and `blocking` are schema-pinned to `true`)

## 42 Custom Agents

Agents are auto-selected by Claude Code based on your task:

| Category | Count | Key Agents |
|----------|-------|------------|
| Strategy & Research | 5 | brand-strategist, positioning-messaging, market-researcher, competitive-analyst, customer-persona-builder |
| Content | 7 | content-strategist, copywriter, blog-writer, seo-content-writer, email-marketer, video-script-writer |
| Channel | 9 | social-media-manager, paid-ads-specialist, seo-specialist, pr-outreach, + per-platform specialists |
| Lifecycle & Growth | 4 | growth-marketer, conversion-optimizer, lifecycle-email, retention-specialist |
| Analytics & Ops | 5 | marketing-analytics-reporter, attribution-analyst, budget-planner, marketing-ops, brand-compliance-checker |
| Creative Direction | 2 | art-director, campaign-producer |
| Insights & Planning | 4 | feedback-synthesizer, experiment-tracker, sprint-prioritizer, project-shipper |
| Ops, Meta & Bonus | 6 | legal-compliance-checker, support-responder, agent-expert, command-expert, joker, studio-coach |

Full catalog: `.claude/CUSTOM-AGENTS-GUIDE.md`

## 13 Marketing Skills

### Pipeline Skills

| # | Skill | Purpose |
|---|-------|---------|
| 1 | campaign-brief-intake | Interview → campaign-brief.json |
| 2 | brand-voice-lock | Brand rules → brand-guidelines.json lockfile |
| 3 | content-calendar | Validated production schedule |
| 4 | editorial-qa | Voice + readability + fact-check loop (max 5 revisions) |
| 5 | parallel-orchestration | Concurrent phases with per-asset lanes |

### Research Skills

| # | Skill | Purpose |
|---|-------|---------|
| 6 | seo-keyword-research | Intent-classified keyword plans |
| 7 | competitor-teardown | Sourced, dated competitive teardowns |
| 8 | persona-research | Evidence-labeled personas + verbatim banks |

### Production & Reporting Skills

| # | Skill | Purpose |
|---|-------|---------|
| 9 | email-sequence | Sequence specs + drafts, staged for approval |
| 10 | social-content-batching | Platform-native social batches |
| 11 | ad-copy-variants | One-variable test matrices |
| 12 | landing-page-copy | Full-page conversion copy |
| 13 | analytics-report | Reports from real data — gaps reported, never filled |

Full catalog: `.claude/skills/README.md`

## Scripts

### Editorial QA
```bash
node scripts/brand-voice-lint.js content/     # Banned words, claims, naming, disclaimers
node scripts/readability-score.js content/ --check
node scripts/seo-check.js content/
```

### Planning & Verification
```bash
node scripts/validate-content-calendar.js     # Dates, lead times, cadence caps
./scripts/verify-all.sh                       # All checks, one summary (--ci for JSON)
./scripts/validate-pipeline-config.sh         # Config vs schema + graph checks
./scripts/check-doc-counts.sh                 # Documented counts vs disk
```

Full reference: `scripts/README.md`

## Templates

Starter artifacts for the pipeline — the shapes the validators expect:

| Directory | Contents |
|-----------|----------|
| `templates/brand/` | brand-guidelines.template.json (the lockfile shape) |
| `templates/campaign/` | campaign-brief.template.json |
| `templates/calendar/` | content-calendar.template.json |
| `templates/email/` | email-sequence.template.json |
| `templates/content/` | Blog post and press release skeletons with QA footnotes |

Full reference: `templates/README.md`

## MCP Server Integration

| Server | Purpose | Required For |
|--------|---------|-------------|
| **Canva AI Connector** | Brand templates, creative production, asset export | art-director workflows, social batching (optional) |

Optional connectors (Gmail, Notion, Google Drive, Google Calendar) can support distribution and planning — always behind the approval gate. No MCP server is required to use the framework.

## Claude Code Plugins

```
episodic-memory    # Persistent memory across sessions
commit-commands    # Git workflow automation (/commit, /commit-push-pr)
superpowers        # Advanced development workflows
ai-taskmaster      # Task management (local)
```

GitHub integration via `gh` CLI (not a plugin).

Details: `.claude/PLUGINS-REFERENCE.md`

## Documentation Index

| Document | Location | Description |
|----------|----------|-------------|
| **Onboarding** | `docs/onboarding/README.md` | Start here — quickstart, architecture, configuration, troubleshooting |
| Quickstart guide | `docs/onboarding/quickstart.md` | Clone to first campaign in 10 minutes |
| Architecture overview | `docs/onboarding/architecture.md` | All 42 agents, 13 skills, and how they connect |
| Pipeline configuration | `docs/onboarding/pipeline-configuration.md` | Every setting in pipeline.config.json explained |
| Troubleshooting FAQ | `docs/onboarding/troubleshooting.md` | Common issues and solutions |
| Campaign pipeline guide | `docs/campaign-pipeline/README.md` | The flagship pipeline, phase by phase |
| Brand setup guide | `docs/brand-setup/README.md` | Creating and maintaining brand-guidelines.json |
| Marketing standards | `docs/marketing-standards/README.md` | Voice, claims, readability, SEO, email, social |
| Project instructions | `CLAUDE.md` | Full project config for Claude Code |
| Agent catalog | `.claude/CUSTOM-AGENTS-GUIDE.md` | All 42 agents with use cases |
| Skills catalog | `.claude/skills/README.md` | All 13 skills with triggers |
| Scripts reference | `scripts/README.md` | All scripts with usage examples |
| Pipeline config | `.claude/pipeline.config.json` | Gates, thresholds, asset types |
| Agent naming guide | `.claude/AGENT-NAMING-GUIDE.md` | Conventions for creating new agents |

## Related Projects

| Project | Description |
|---------|-------------|
| [Aurelius](https://github.com/PMDevSolutions/Aurelius) | Claude Code-integrated React app development framework with Figma/Canva design-to-code pipelines — the ancestor this framework was forked from |
| [Flavian](https://github.com/PMDevSolutions/Flavian) | Claude Code-integrated WordPress development framework with FSE block theme tools and Figma-to-WordPress pipelines |
| [Nerva](https://github.com/PMDevSolutions/Nerva) | Claude Code-integrated API and backend development framework with Hono, Cloudflare Workers, and Drizzle ORM |
| [Claudius](https://github.com/PMDevSolutions/Claudius) | Embeddable AI chat widget powered by Claude. React + TypeScript + Cloudflare Workers |

## License

MIT
