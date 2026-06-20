# Skills Catalog

**Last Updated:** 2026-06-11
**Total Skills:** 23
**Location:** `.claude/skills/`

Skills are documentation-based workflows that trigger automatically when relevant keywords appear in conversation. They provide systematic guidance, not tool integrations.

---

## Skills Index

### Figma-to-React Pipeline Skills

These skills power the `/build-from-figma` and `/build-from-canva` autonomous pipelines. They run in sequence (Phase 1 through Phase 6) but can also be invoked independently.

#### 1. figma-intake (Phase 1)
- **Purpose:** Structured interview that auto-discovers Figma file structure, scans the local project, asks 3-5 targeted questions, and produces a `build-spec.json`
- **Triggers:** Phase 1 of `/build-from-figma`, or any Figma URL conversation
- **Output:** `.claude/plans/build-spec.json`

#### 2. design-token-lock (Phase 2)
- **Purpose:** Extracts all design values from Figma and writes a lockfile that becomes the single source of truth for colors, typography, spacing, and text content
- **Triggers:** Phase 2 of `/build-from-figma`, "extract tokens", "design tokens"
- **Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

#### 3. tdd-from-figma (Phase 3)
- **Purpose:** Writes failing tests for every component BEFORE implementation. App-type-aware: generates Chrome extension tests (popup, service worker, Chrome API mocks), PWA tests (manifest, offline), or standard web app tests.
- **Triggers:** Phase 3 of `/build-from-figma`, "write tests first", "TDD"
- **Output:** `src/components/**/*.test.tsx` (RED phase -- all tests fail)

#### 4. figma-to-react-workflow (Phase 4)
- **Purpose:** Orchestrates the full Figma-to-React conversion pipeline. Generates React components that pass the tests from Phase 3. Includes pixel-diff visual QA loop and quality gate.
- **Triggers:** "convert Figma", "Figma to React", "design to code"
- **Works with:** figma-react-converter agent, asset-cataloger agent

#### 5. e2e-test-generator (Phase 6)
- **Purpose:** Generates Playwright E2E tests from `build-spec.json`. App-type-aware: web apps get page navigation/form/responsive tests, Chrome extensions get load/popup/storage/content-script tests, PWAs get install/offline tests.
- **Triggers:** Phase 6 of `/build-from-figma`, "generate E2E tests", "Playwright tests"
- **Output:** `e2e/` directory with Playwright config and test files

#### 6. visual-qa-verification (Phase 5)
- **Purpose:** Automated pixel-diff visual QA using `scripts/visual-diff.js`. Captures Figma screenshots, renders the app, compares with pixelmatch, and iterates fixes up to 5 times. Includes cross-browser verification.
- **Triggers:** "visual QA", "compare to Figma", "screenshot diff", "verify app"
- **Works with:** visual-qa-agent, Chrome DevTools MCP, Figma MCP

#### 7. parallel-orchestration (Phases 4-9)
- **Purpose:** Concurrent phase runner that dispatches independent pipeline phases in parallel, respecting the dependency graph and resource constraints defined in `pipeline.config.json`.
- **Triggers:** Invoked by pipeline commands after Phase 3 (TDD gate)
- **Works with:** all build/QA phases; falls back to sequential execution when disabled

### Canva & Screenshot Pipeline Skills

These skills power the `/build-from-canva` and `/build-from-screenshot` autonomous pipelines. They handle source-specific phases (1, 2) before converging with the shared pipeline (phases 3-9).

#### 8. canva-intake (Phase 1 -- Canva)
- **Purpose:** Structured discovery for Canva designs. Exports screenshots via Canva AI Connector MCP, uses Claude vision to analyze page structure and components, asks 3-5 targeted questions, and produces a `build-spec.json` with `source: "canva"`.
- **Triggers:** Phase 1 of `/build-from-canva`, or any Canva design URL conversation
- **Output:** `.claude/plans/build-spec.json`

#### 9. canva-token-inference (Phase 2 -- Canva/Screenshot)
- **Purpose:** AI-powered token extraction from Canva or screenshot sources with confidence scoring. Uses Claude vision to infer colors, typography, spacing, and effects. Presents tokens with confidence levels for user confirmation before locking.
- **Triggers:** Phase 2 of `/build-from-canva` and `/build-from-screenshot`, "extract Canva tokens", "Canva design tokens"
- **Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

#### 10. screenshot-intake (Phase 1 -- Screenshot)
- **Purpose:** Structured discovery from a URL or provided screenshot files. Captures pages via Chrome DevTools or Playwright MCP, analyzes structure with Claude vision, and produces a `build-spec.json` with `outputTarget`.
- **Triggers:** Phase 1 of `/build-from-screenshot`, "build from screenshot", "clone this site"
- **Output:** `.claude/plans/build-spec.json`

### Conversation Pipeline Skills

These skills power the `/build-from-conversation` autonomous pipeline. They run *before* the shared pipeline: Phase C0 produces the build spec and design brief from an interview, Phase C1 generates a real Figma file from the brief, and the standard `/build-from-figma` pipeline takes over from there (its `figma-intake` skill fast-paths on conversation-sourced build specs).

#### 11. conversation-intake (Phase C0 -- Conversation)
- **Purpose:** Structured interview (max 7 questions) that turns a natural-language app description into a `build-spec.json` with `source: "conversation"` plus a `design-brief.json`. Dispatches the conversation-designer agent to make concrete design decisions. No design file required.
- **Triggers:** Phase C0 of `/build-from-conversation`, "describe an app", "talk to build"
- **Output:** `.claude/plans/build-spec.json`, `.claude/plans/design-brief.json`

#### 12. design-brief-to-figma (Phase C1 -- Conversation)
- **Purpose:** Generates a real Figma file from the design brief: renders per-page HTML mockups (conversation-designer agent), serves them locally, creates a new Figma file, and captures each mockup into it via the Figma MCP `generate_figma_design` tool. Maps the generated node IDs back into the build spec.
- **Triggers:** Phase C1 of `/build-from-conversation`, "generate a Figma design from a description"
- **Output:** Figma file URL + updated `.claude/plans/build-spec.json`

### React Development Skills

These skills provide patterns and best practices. They trigger on relevant keywords during any React development work.

#### 13. react-component-development
- **Purpose:** Component patterns, TypeScript conventions, custom hooks, composition, and Tailwind CSS best practices
- **Triggers:** "create component", "component pattern", "custom hook", "React best practices"
- **Works with:** frontend-developer agent, ui-designer agent

#### 14. react-testing-workflows
- **Purpose:** Testing strategy with Vitest, React Testing Library, Playwright, and Storybook
- **Triggers:** "write tests", "test coverage", "Vitest", "Playwright", "Storybook"
- **Works with:** test-writer-fixer agent, test-results-analyzer agent

#### 15. react-performance-optimization
- **Purpose:** Performance profiling, bundle analysis, code splitting, and Web Vitals
- **Triggers:** "performance", "bundle size", "Web Vitals", "lazy loading", "profiling"
- **Works with:** performance-benchmarker agent, analytics-reporter agent

#### 16. react-accessibility
- **Purpose:** WCAG 2.1 AA patterns for React, ARIA usage, keyboard navigation, focus management
- **Triggers:** "accessibility", "WCAG", "ARIA", "a11y", "keyboard navigation"
- **Works with:** accessibility-auditor agent, ux-researcher agent

#### 17. state-management
- **Purpose:** State architecture decisions — Zustand for global UI state, TanStack Query for server state, URL state patterns, and anti-patterns to avoid
- **Triggers:** "state management", "zustand", "tanstack query", "react query", "global state", "data fetching", "caching"
- **Works with:** frontend-developer agent

#### 18. form-handling
- **Purpose:** Form patterns with React Hook Form + Zod — typed forms, reusable field components, dynamic field arrays, multi-step wizards, server actions, and accessible error handling
- **Triggers:** "form", "form handling", "react hook form", "zod", "validation", "multi-step form", "wizard"
- **Works with:** frontend-developer agent, accessibility-auditor agent

#### 19. auth-flows
- **Purpose:** Authentication patterns — Auth.js v5 (NextAuth), Clerk, Supabase Auth. Covers session management, protected routes, OAuth, and role-based access control (RBAC)
- **Triggers:** "auth", "authentication", "login", "sign in", "session", "protected route", "OAuth", "clerk", "supabase auth"
- **Works with:** backend-architect agent, frontend-developer agent

#### 20. animation-motion
- **Purpose:** Animation patterns — Framer Motion (motion/react), CSS transitions, page transitions, scroll-driven animations, staggered lists, and reduced-motion accessibility
- **Triggers:** "animation", "framer motion", "transition", "micro-interaction", "page transition", "scroll animation", "motion"
- **Works with:** frontend-developer agent, whimsy-injector agent

#### 21. seo-metadata
- **Purpose:** SEO patterns — Next.js Metadata API, Open Graph tags, dynamic OG images, structured data (JSON-LD), sitemaps, robots.txt, and Vite SPA SEO with react-helmet-async
- **Triggers:** "SEO", "metadata", "open graph", "og image", "sitemap", "structured data", "json-ld", "meta tags"
- **Works with:** frontend-developer agent, content-creator agent

### Export Skills

#### 22. export-design-system
- **Purpose:** Exports generated components + `design-tokens.lock.json` as a publishable pnpm workspace. Generates a framework-agnostic tokens package and a framework-specific component library (React/Vue/Svelte via Vite library mode, React Native via tsc), with Tailwind preset, ThemeProvider, and Changesets versioning.
- **Triggers:** `/export-design-system`, "export design system", "publishable component library"
- **Output:** `packages/` pnpm workspace (tokens + component library)

### InDesign Skills

#### 23. indesign-conversion

- **Purpose:** Converts an exported InDesign IDML package or PDF into typed React components, design tokens (Tailwind preset + `tokens.css`/`tokens.ts` + Style Dictionary JSON), and Storybook stories via the `@aurelius/pipeline` InDesign pipeline; reads the generation report to propose follow-ups.
- **Triggers:** "InDesign to React", "IDML", "PDF to React", "indesign pipeline", "brochure to React", "aurelius pipeline indesign"
- **Output:** A React project (`components`, `stories`, `index.ts`, `tokens/`, extracted assets, plus Markdown + JSON reports)

---

## Pipeline Flow

```
Conversation ("describe your app")
    |
    v
[Phase C0] conversation-intake → build-spec.json + design-brief.json
    |
    v
[Phase C1] design-brief-to-figma → generated Figma file
    |
    v  (figma-intake fast-paths conversation-sourced specs)
Figma Design                    Canva Design
    |                               |
    v                               v
[Phase 1] figma-intake      [Phase 1] canva-intake
    |                               |
    v                               v
[Phase 2] design-token-lock  [Phase 2] canva-token-inference
    |                               |
    +---------- build-spec.json ----+
                    |
                    v
    [Phase 3] tdd-from-figma → failing tests (RED)
                    |
        +-- react-component-development (component patterns)
        +-- react-accessibility (WCAG compliance)
                    |
                    v
    [Phase 4] figma-to-react-workflow (Figma)
              OR canva-react-converter (Canva)
              → components pass tests (GREEN)
                    |
                    v
    [Phase 5] visual-qa-verification → pixel-diff loop (max 5 iterations)
                    |
                    v
    [Phase 6] e2e-test-generator → Playwright E2E tests
                    |
        +-- react-testing-workflows (test strategy)
        +-- react-performance-optimization (bundle/runtime)
                    |
                    v
    Production-Ready Application

Supporting skills (used throughout):
  - state-management (Zustand, TanStack Query decisions)
  - form-handling (React Hook Form + Zod patterns)
  - auth-flows (Auth.js, Clerk, Supabase patterns)
  - animation-motion (Framer Motion, CSS transitions)
  - seo-metadata (Next.js Metadata API, JSON-LD)
```

## Skills vs Agents vs Plugins

| Type | Purpose | Invocation |
|------|---------|------------|
| **Skills** | Systematic workflows and best practices | Automatic keyword detection |
| **Agents** | Specialized task execution | Task tool (auto or explicit) |
| **Plugins** | Tool integrations and commands | Manual `/` commands |

## Skill File Structure

```yaml
---
name: skill-name
description: Use when [triggers]. Keywords: term1, term2
---

# Skill Name
## Overview
## When to Use
## Quick Reference
## Implementation
## Common Mistakes
```
