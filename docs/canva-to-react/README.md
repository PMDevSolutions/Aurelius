# Canva-to-React Pipeline

Convert Canva designs into fully working, tested React applications with a single command.

## Overview

The `/build-from-canva` command runs the same 12-phase autonomous pipeline as `/build-from-figma`, with Canva-specific phases for design discovery (Phase 1), token extraction (Phase 2), and component generation (Phase 4):

```
[0] Token Sync  → sync-tokens.sh → drift check (conditional)
[1] Intake      → canva-intake skill → build-spec.json (Canva-specific)
[2] Token Infer → canva-token-inference skill → lockfile + Tailwind config (AI-powered)
[3] TDD (Gate)  → tdd-from-figma skill → failing tests (RED)
[4] Build       → canva-react-converter agent → components pass tests (GREEN)
[4.5] Storybook → generate-stories.sh → auto-generated stories
[5] Visual Diff → visual-qa-verification skill → pixel-diff loop
[5.5] Dark Mode → check-dark-mode.sh → dark mode verification
[6] E2E Tests   → e2e-test-generator skill → Playwright tests
[7] Cross-Browser→ Firefox/WebKit screenshots (non-blocking)
[8] Quality Gate → coverage + TypeScript + build + tokens + Lighthouse + mutation score (opt-in)
[8.5] Responsive→ check-responsive.sh → screenshots at 5 breakpoints (non-blocking)
[9] Report      → .claude/visual-qa/build-report.md + docs/components/
```

## Prerequisites

- **Claude Code** with the framework's agents, skills, and plugins installed
- **Canva AI Connector MCP** configured (for design search, export, and interaction)
- **Chrome DevTools MCP** for screenshots and Lighthouse audits
- **Playwright MCP** for cross-browser testing
- **Node.js 18+** and **pnpm** installed
- **Canva design URL** with designs ready for development

## Quick Start

```
/build-from-canva https://www.canva.com/design/DAGxyz.../My-Design
```

The pipeline handles everything: Canva screenshot export, AI-powered token inference, test generation, component building, visual verification, E2E testing, and quality gates.

## How It Differs from Figma Pipeline

| Aspect | Figma Pipeline | Canva Pipeline |
|--------|---------------|----------------|
| **Design access** | Figma MCP reads structured layer data | Canva MCP exports screenshots for vision analysis |
| **Token extraction** | Direct API extraction from Figma variables/styles | AI-powered inference from screenshots with confidence scoring |
| **User confirmation** | Not required (tokens are exact) | Required for inferred tokens below confidence threshold |
| **Component detection** | Figma frames/components with names | Vision-based detection from screenshot analysis |
| **Reference screenshots** | Captured from Figma MCP | Exported from Canva MCP |
| **Phase 1 skill** | figma-intake | canva-intake |
| **Phase 2 skill** | design-token-lock | canva-token-inference |
| **Phase 4 agent** | figma-react-converter | canva-react-converter |
| **Phases 3, 5-9** | Shared | Shared (identical) |

## Token Inference Accuracy

Since Canva does not expose design tokens via API, the pipeline uses Claude vision to infer values from screenshots. Expected accuracy by token type:

| Token Type | Expected Accuracy | Notes |
|-----------|-------------------|-------|
| Colors | 95%+ | High confidence from pixel sampling |
| Font families | 70-85% | May require user confirmation for similar fonts |
| Font sizes | 85-95% | Relative sizing is reliable; exact px may vary |
| Spacing | 80-90% | Padding/margin inferred from layout analysis |
| Border radius | 90%+ | Geometric detection is reliable |
| Shadows | 75-85% | Blur, spread, and offset approximated from visual analysis |

Tokens below the confidence threshold (default: 0.7) are flagged for user confirmation before being locked into `design-tokens.lock.json`.

## Canva MCP Setup

The Canva AI Connector MCP server must be configured in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "canva": {
      "type": "url",
      "url": "https://mcp.canva.com/sse"
    }
  }
}
```

Test the connection:
```
mcp__canva__whoami
```

## Configuration

Canva-specific settings in `.claude/pipeline.config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `canva.enabled` | true | Enable Canva pipeline support |
| `canva.tokenInference.confirmWithUser` | true | Require user confirmation for inferred tokens |
| `canva.tokenInference.confidenceThreshold` | 0.7 | Minimum confidence to auto-accept a token |
| `canva.export.format` | "png" | Screenshot export format |
| `canva.export.scale` | 2 | Export scale factor (2x for retina) |
| `canva.export.quality` | 90 | Export quality (1-100) |

All other settings (visual diff threshold, TDD enforcement, coverage threshold, Lighthouse minimums) are shared with the Figma pipeline.

## Canva-Specific Skills

| Skill | Phase | Purpose |
|-------|-------|---------|
| canva-intake | 1 | Exports Canva screenshots, uses Claude vision to analyze page structure, asks targeted questions, produces build-spec.json with `source: "canva"` |
| canva-token-inference | 2 | Infers design tokens from screenshots using Claude vision. Assigns confidence scores. Presents tokens for user confirmation before locking. |

## Canva-Specific Agent

| Agent | Role |
|-------|------|
| **canva-react-converter** | Reads Canva screenshots, generates React components with Tailwind CSS. Works with canva-token-inference output for accurate styling. |

## Supported App Types

Identical to the Figma pipeline:

| App Type | Detection | E2E Strategy | Special Handling |
|----------|-----------|-------------|-----------------|
| **Web App** | Default | Page navigation, forms, responsive | Standard Playwright |
| **Chrome Extension** | `manifest.json` with `manifest_version` | Extension load, popup, storage, content scripts | Persistent browser context with `--load-extension` |
| **PWA** | `manifest.json` with `start_url` | Install prompt, offline fallback | Service worker and offline tests |

## Troubleshooting

- **Canva MCP unavailable:** Verify the Canva AI Connector MCP is configured in `.claude/settings.json`. Test with `mcp__canva__whoami`. Ensure you have an active Canva session.
- **Export fails:** Check that the Canva design URL is valid and accessible. The MCP needs permission to read the design. Try re-authenticating.
- **Token inference inaccurate:** Increase the export scale (`canva.export.scale: 3`) for better resolution. Lower the confidence threshold to flag more tokens for manual review. Review the inferred tokens table before confirming.
- **Font identification wrong:** Canva uses licensed fonts that may not match system fonts. The pipeline will suggest the closest Google Font or system font. Confirm or override during the token confirmation step.
- **Visual diff threshold too strict:** Adjust `visualDiff.threshold` in `pipeline.config.json`. Canva designs may have subtle rendering differences -- consider using 3% threshold instead of the default 2%.
- **Tests won't pass after 3 attempts:** Pipeline marks the component for manual intervention and continues with remaining components.
- **Session interrupted:** The pipeline tracks its run in `.claude/plans/pipeline-state.json`, and the next session's status block says where it stopped. Re-run `/build-from-canva`: completed phases are skipped and the run resumes at the first incomplete one.

## Related Documentation

- `docs/figma-to-react/README.md` -- Figma-to-React conversion pipeline
- `scripts/README.md` -- Scripts reference (visual-diff.js, verify-tokens.sh, verify-test-coverage.sh)
- `templates/README.md` -- Starter configs including Chrome extension E2E templates
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
- `docs/react-development/README.md` -- React development standards
