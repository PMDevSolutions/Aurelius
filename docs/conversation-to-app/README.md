# Conversation-to-App Pipeline

Build a working, tested app from nothing but a conversation. `/build-from-conversation` interviews you, generates a **real Figma file** from the resulting design brief, and hands off to the standard `/build-from-figma` pipeline — which runs unchanged.

## Overview

```
You describe the app ("a minimal analytics dashboard with auth and dark mode")
        │
        ▼
[C0] conversation-intake ──► build-spec.json (source: "conversation")
        │                    design-brief.json
        ▼
[C1] design-brief-to-figma ─► per-page HTML mockups (conversation-designer agent)
        │                     new Figma file (create_new_file)
        │                     one capture per page (generate_figma_design)
        ▼
/build-from-figma <generated URL> ─► phases 0-9, unchanged
        (figma-intake fast-paths the conversation-sourced build spec)
```

The result is the same as any other pipeline run — locked tokens, TDD'd components, pixel-diff visual QA, E2E tests, quality gate — plus a real, editable Figma file in your account that you own going forward.

## Prerequisites

- Figma MCP connected and authenticated (`whoami` must succeed) — the pipeline creates a file in your Figma account
- A Figma plan to create the file in (if you belong to multiple teams/orgs, the pipeline asks which one)
- Node.js for the local mockup server (`npx serve`)

No Figma desktop app, no existing design file, no screenshots required.

## Quick Start

```
/build-from-conversation
```

or seed the interview with a description (questions it already answers are skipped):

```
/build-from-conversation a playful recipe-sharing app with three pages and dark mode
```

The interview asks at most 7 questions (purpose, pages, style direction, colors, framework if undetected, special requirements, component reuse if any exist). You confirm the build plan once before any Figma file is created, and review the generated design once before the build starts. Both gates are configurable.

## How Design Generation Works

There is no text-to-Figma API. The Figma MCP's `generate_figma_design` tool imports a **rendered web page** into an existing Figma file pixel-perfectly. The pipeline exploits that:

1. The `conversation-designer` agent expands your answers into `design-brief.json` — concrete decisions with reasoning (exact palette, type pairing, layout grid, per-component anatomy)
2. The same agent renders one **self-contained HTML mockup per page** (static, no JS, exact brief values, real copy from the build spec) into `.claude/design-mockups/`
3. The mockups are served locally and a new Figma file is created (`whoami` → `create_new_file`)
4. Each page is captured into the file with `generate_figma_design` — one single-use capture per page, polled until complete
5. `get_metadata` maps the generated frame node IDs back into `build-spec.json`, completing the same contract `figma-intake` would have produced

Because the captured Figma frames are rendered from the brief's exact values, Phase 5's pixel diff later verifies the built app against the very design the conversation produced — the loop is closed end to end.

## How It Differs from the Other Pipelines

| | Figma / Canva / Screenshot | Conversation |
|---|---|---|
| Input | An existing design (file, URL, or image) | A description |
| Phase 1 | Discover the design | Interview → **design** the design |
| Design artifact | Pre-existing | Generated Figma file (you keep it) |
| Token source | Figma variables / AI inference | Computed styles from the generated file (no variables exist in captured designs — expected, and accurate because the mockups came from the brief) |
| Extra artifact | — | `design-brief.json` + HTML mockups |

Everything from TDD scaffolding onward is byte-for-byte the Figma pipeline. The `figma-intake` skill detects `"source": "conversation"` in the existing build spec and fast-paths: no second interview, no rediscovery.

## Configuration

All settings live in `.claude/pipeline.config.json` under `conversation` (see the [Pipeline Configuration Guide](../onboarding/pipeline-configuration.md#conversation-pipeline-conversation)):

- `interview.maxQuestions` (default `7`) and `interview.confirmBriefWithUser` (default `true`)
- `designGeneration.mockupDir`, `mockupServerPort`, `reviewBeforeHandoff`, `maxRegenerationAttempts`, `capturePollIntervalMs`, `capturePollMaxAttempts`
- `retry` — exponential backoff for capture failures (shared `retryOptions` shape)

## Conversation-Specific Skills

| Skill | Phase | Output |
|-------|-------|--------|
| `conversation-intake` | C0 | `build-spec.json` (`source: "conversation"`) + `design-brief.json` |
| `design-brief-to-figma` | C1 | Figma file URL + build spec completed with `figma` block and node IDs |

## Conversation-Specific Agent

`conversation-designer` — interprets natural language into concrete design decisions, authors the design brief, and generates the HTML mockups. Its style-direction defaults table (minimal / bold / playful / corporate / dark) is what turns "make it clean" into specific hex values and spacing.

## The design-brief.json Artifact

```jsonc
{
  "version": "1.0.0",
  "source": "conversation",
  "appName": "Pulse Analytics",
  "styleDirection": "minimal",                  // minimal | bold | playful | corporate | dark | custom
  "colorPreferences": { "primary": "#2563EB", "style": "cool-neutral", "userProvided": true, "notes": "…" },
  "typography": { "style": "modern-sans", "headingStyle": "bold-clean", "notes": "…" },
  "layoutStyle": { "density": "comfortable", "maxWidth": "1280px", "sidebar": true, "notes": "…" },
  "componentDescriptions": { "StatsCard": "White card with muted label, large metric, delta badge…" },
  "darkMode": true,
  "animations": "subtle",                       // none | subtle | expressive
  "specialRequirements": ["auth", "dark-mode"]
}
```

Every decision carries a `notes` field — the designer's reasoning survives into review, so disagreements are about recorded choices, not guesses.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Figma MCP unauthenticated" at C1 | No Figma session | Verify with `whoami`; re-authenticate the Figma MCP. C0 artifacts survive — resume at C1. |
| Asked which team/org to use | Multiple Figma plans | Answer once; the `planKey` is used for `create_new_file`. The pipeline never guesses. |
| Capture times out | Slow render or MCP hiccup | Retried automatically per `conversation.retry` with a fresh capture. Persistent failures are listed for manual re-capture. |
| Mockup server port conflict | Port 4173 in use | The pipeline increments the port and retries; or set `designGeneration.mockupServerPort`. |
| "No Figma variables found" in Phase 2 | Captured designs carry styles, not variable definitions | Expected. `design-token-lock` falls back to computed styles, which match the brief because the mockups were generated from it. |
| Generated design isn't what you meant | Brief misread your intent | Reject at the review gate with feedback — affected pages regenerate (max `maxRegenerationAttempts`), or hand-edit the Figma file and run `/build-from-figma <url>` directly. |

## Related Documentation

- [Figma-to-React Pipeline](../figma-to-react/README.md) — the pipeline this one hands off to
- [Pipeline Configuration Guide](../onboarding/pipeline-configuration.md) — every `conversation.*` setting
- [Architecture Overview](../onboarding/architecture.md) — how the four pipelines fit together
- `.claude/commands/build-from-conversation.md` — the orchestrator command
- `.claude/skills/conversation-intake/SKILL.md`, `.claude/skills/design-brief-to-figma/SKILL.md` — phase skills
- `.claude/agents/conversation-designer.md` — the designing agent
