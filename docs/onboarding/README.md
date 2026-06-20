# Developer Onboarding Guide

Welcome to **Aurelius** -- a Claude Code-integrated multi-framework app development framework. Named after the Roman Emperor Marcus Aurelius, this project brings discipline, thoughtful automation, and principled engineering to modern app development.

This guide will get you productive with the framework quickly, whether you are building a new app from scratch, converting a Figma design into working code, or contributing to the framework itself.

---

## Documentation Map

| Document | What You Will Learn |
|----------|-------------------|
| [Quickstart Guide](quickstart.md) | Clone, install, create your first project, and run your first pipeline in under 10 minutes |
| [Architecture Overview](architecture.md) | How the 56 agents, 23 skills, 4 pipelines, and 8 hooks fit together |
| [Pipeline Configuration](pipeline-configuration.md) | Every setting in `pipeline.config.json` explained, with examples |
| [Troubleshooting FAQ](troubleshooting.md) | Common issues, error messages, and how to resolve them |
| [Framework Guides](../guides/README.md) | Deep dives into design tokens, visual QA, caching, hooks, error recovery, agent creation, and framework-specific workflows |

---

## Who Is This For?

- **New contributors** who want to understand the project structure before making changes
- **App developers** using Aurelius to build production applications from Figma, Canva, or screenshot designs -- or from a plain conversation (`/build-from-conversation`)
- **Claude Code users** who want to understand how the agents and skills enhance their workflow
- **Framework maintainers** who need to add new agents, skills, or pipeline phases

---

## Prerequisites

Before starting, make sure you have:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18+ | `node --version` |
| pnpm | 8+ | `pnpm --version` |
| Git | 2.30+ | `git --version` |
| Claude Code | Latest | `claude --version` |

Optional (for specific workflows):

| Tool | Required For |
|------|-------------|
| Figma Desktop App | Figma MCP integration (local design access) |
| GitHub CLI (`gh`) | PR creation, issue management |
| Playwright browsers | Cross-browser testing (`./scripts/setup-playwright.sh`) |

---

## Quick Links

- [Main README](../../README.md) -- Project overview
- [Contributing Guide](../../CONTRIBUTING.md) -- Branch naming, PR process, commit conventions
- [Agent Catalog](../../.claude/CUSTOM-AGENTS-GUIDE.md) -- All 56 agents with use cases
- [Skills Catalog](../../.claude/skills/README.md) -- All 23 skills with triggers
- [Plugin Reference](../../.claude/PLUGINS-REFERENCE.md) -- Installed plugins and commands
- [Pipeline Config](../../.claude/pipeline.config.json) -- Thresholds and app-type definitions
- [React Development Standards](../react-development/README.md) -- TypeScript, Tailwind, testing conventions
- [Figma Pipeline Guide](../figma-to-react/README.md) -- Figma-to-React pipeline deep dive
- [Canva Pipeline Guide](../canva-to-react/README.md) -- Canva-to-React pipeline deep dive
- [Screenshot Pipeline Guide](../screenshot-to-app/README.md) -- Screenshot/URL-to-app pipeline
- [Conversation Pipeline Guide](../conversation-to-app/README.md) -- Conversational app creation via generated Figma designs
- [Multi-Framework Guide](../multi-framework/README.md) -- Vue, Svelte, React Native output targets

---

## How to Read These Docs

**If you are setting up for the first time**, start with the [Quickstart Guide](quickstart.md).

**If you want to understand how things work**, read the [Architecture Overview](architecture.md).

**If you are customizing pipeline behavior**, go to [Pipeline Configuration](pipeline-configuration.md).

**If something is not working**, check the [Troubleshooting FAQ](troubleshooting.md).
