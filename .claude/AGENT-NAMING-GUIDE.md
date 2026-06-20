# Agent Naming Guide

**Last Updated:** 2026-06-11

## Naming Convention

All 56 agents use unique, hyphenated names (e.g., `frontend-developer`, `figma-react-converter`). There are no naming conflicts in the current agent set.

Agent files live in `.claude/agents/` as `<agent-name>.md`.

## How Agents Are Selected

Claude Code automatically selects agents based on task context. You do not need to specify which agent to use unless you want to override the default selection.

**Examples:**

| Your Request | Agent Selected |
|-------------|---------------|
| "Build a login form component" | frontend-developer |
| "Write tests for the useAuth hook" | test-writer-fixer |
| "Convert this Figma design to React" | figma-react-converter |
| "Check this page for accessibility" | accessibility-auditor |
| "Optimize the bundle size" | performance-benchmarker |
| "Set up the CI pipeline" | devops-automator |
| "Design the component API" | backend-architect |

## Explicit Selection

To force a specific agent, name it in your request:

```
User: "Use the visual-qa-agent to compare these screenshots"
User: "Have the docusaurus-expert set up the docs site"
```

## Agent Categories

Agents are grouped into 12 categories: Engineering, Design, Design-to-Code, Testing & QA, Product, Marketing, Project Management, Operations, Documentation, Meta, and Bonus.

See `.claude/CUSTOM-AGENTS-GUIDE.md` for the full catalog with descriptions.
