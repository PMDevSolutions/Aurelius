# Agent Naming Guide

**Last Updated:** 2026-07-21

## Naming Convention

All 42 agents use unique, hyphenated names (e.g., `copywriter`, `brand-compliance-checker`). There are no naming conflicts in the current agent set.

Agent files live in `.claude/agents/` as `<agent-name>.md`.

## How Agents Are Selected

Claude Code automatically selects agents based on task context. You do not need to specify which agent to use unless you want to override the default selection.

**Examples:**

| Your Request | Agent Selected |
|-------------|---------------|
| "Write a landing page for the spring offer" | copywriter |
| "Why is our CAC rising?" | marketing-analytics-reporter |
| "Tear down competitor X's pricing page" | competitive-analyst |
| "Build the welcome email flow" | lifecycle-email |
| "Plan next quarter's content" | content-strategist |
| "Check this post against our brand voice" | brand-compliance-checker |
| "Coordinate the product launch" | project-shipper |

## Explicit Selection

To force a specific agent, name it in your request:

```
User: "Use the positioning-messaging agent to sharpen this value prop"
User: "Have the pr-outreach agent draft the press release"
```

## Agent Categories

Agents are grouped into 10 categories: Strategy & Research, Content, Channel, Lifecycle & Growth, Analytics & Operations, Creative Direction, Insights & Planning, Operations & Support, Meta, and Bonus.

See `.claude/CUSTOM-AGENTS-GUIDE.md` for the full catalog with descriptions.
