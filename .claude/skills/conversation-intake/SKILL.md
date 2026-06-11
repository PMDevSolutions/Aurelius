---
name: conversation-intake
description: Structured interview that turns a natural-language app description into a build-spec.json and a design-brief.json — no design file required. Auto-discovers local project context, asks at most 7 targeted questions, and dispatches the conversation-designer agent to make concrete design decisions. Entry point (Phase C0) for the /build-from-conversation pipeline. Keywords: conversation intake, describe an app, talk to build, design brief, build spec, no Figma file
---

# Conversation Intake — Structured Discovery

## Purpose

Gather everything needed to design and build an app from nothing but a conversation. Where `figma-intake` discovers an existing design file, this skill discovers the user's *intent*: it interviews them (maximum of 7 questions), expands the answers into concrete design decisions via the `conversation-designer` agent, and outputs two machine-readable artifacts that the rest of the pipeline consumes without re-asking questions:

- `.claude/plans/build-spec.json` with `"source": "conversation"` — same contract every other intake skill produces
- `.claude/plans/design-brief.json` — the new artifact that drives Figma design generation in Phase C1

## When to Use

- Phase C0 of `/build-from-conversation`
- Any time a user describes an app they want built but has no Figma/Canva file, screenshot, or URL
- When you need a structured design brief from a free-form product description

## Inputs

- **Optional:** Initial description from `$ARGUMENTS` (seed answers; skip any question it already answers)
- **Optional:** Existing project directory to integrate into
- **Reads:** `.claude/pipeline.config.json` → `conversation.interview` (`maxQuestions`, `confirmBriefWithUser`)

## Process

### Step 1: Auto-Discovery (No User Input)

Scan the local project exactly as the other intake skills do:

```
1. Detect framework via the renderer registry:
   - Run: node scripts/renderer-registry.js detect . --json
   - On { "renderer": "<name>", "language": "<lang>" }:
       set build-spec renderer = <name>
       set build-spec outputTarget = <language>  (react | vue | svelte | react-native)
   - On { "renderer": null }:
       no framework detected → ask the output-target question (Question 5)
   Do not hand-sniff config files or package.json deps; the registry owns detection.

2. Detect app type:
   - manifest.json with "manifest_version" → Chrome Extension
   - manifest.json with "start_url" or "display" → PWA
   - Otherwise → Web App

3. Scan existing components:
   - Glob: src/components/**/*.tsx, app/components/**/*.tsx
   - Build inventory: name, props interface, file path
   - (Only triggers Question 7 if matches exist)

4. Check package.json for UI libraries and state management
   (same list as figma-intake)

5. Check for existing design tokens:
   - tailwind.config.ts theme.extend, src/styles/tokens.css,
     design-tokens.lock.json (from prior runs)
   - Existing tokens become constraints for the design brief, not questions

6. Load pipeline config:
   - .claude/pipeline.config.json → conversation.interview.maxQuestions (default 7)
     and appTypes[detected] for E2E strategy defaults
```

If `$ARGUMENTS` contains an initial description, parse it first and pre-fill every answer it covers. A description like "a minimal analytics dashboard with auth and dark mode, brand color #2563EB" already answers Questions 1 (partially), 3, 4, and 6 — only ask what is still missing.

### Step 2: Structured Interview (Maximum of 7 Questions)

Hard cap: `conversation.interview.maxQuestions` (default 7). Skip any question whose answer is already known from `$ARGUMENTS`, the project scan, or an earlier answer. Use `AskUserQuestion` with concrete options wherever choices are enumerable.

**Question 1 — Purpose & Audience (always asked unless fully covered by $ARGUMENTS):**
> What does the app do, and who is it for?
> (One or two sentences is plenty — this drives every downstream design decision)

**Question 2 — Pages/Screens:**
> Which pages or screens does it need?
> (Offer a suggested set inferred from the purpose, e.g. for a dashboard: Dashboard, Settings — accept "yes" or a corrected list)

**Question 3 — Style Direction:**
> What should it look like?
> a) Minimal — clean, restrained, lots of whitespace
> b) Bold — high contrast, large type, saturated color
> c) Playful — rounded, colorful, friendly
> d) Corporate — conservative, dense, trustworthy
> e) Dark — dark surfaces, accent highlights
> f) Custom — describe it in your own words

**Question 4 — Color Preferences:**
> Any brand colors I should use? (hex codes welcome)
> (Default: I'll derive a palette from the style direction)

**Question 5 — Output Target (only if the registry detected no framework):**
> Run `node scripts/renderer-registry.js list --json` and present the returned
> renderer names as the choices (each entry has `name` and `language`).
> Greenfield React default: `vite`. Set build-spec `renderer` = the chosen name
> and `outputTarget` = its `language`.
> (Skip if the registry already detected a framework.)

**Question 6 — Special Requirements (multi-select):**
> Anything beyond the visible UI?
> Options: auth, dark mode, i18n, animations, forms with validation, API integration
> (Default: none — pure presentational)

**Question 7 — Component Reuse (only if Step 1 found existing components):**
> I found [N] existing components. Should I:
> a) Reuse them and only generate missing ones
> b) Regenerate all (replaces existing)
> c) Generate alongside with new names (no overwrites)

### Step 3: Design Expansion (conversation-designer)

Dispatch the `conversation-designer` agent with the interview answers and project constraints. The agent:

1. Makes every remaining design decision concrete (layout grid, sidebar vs top-nav, density, type pairing, palette with exact hex values, component anatomy)
2. Writes `.claude/plans/design-brief.json` (schema owned by the agent definition)
3. Returns the component inventory and drafted text content for the build spec

Do not relay the agent's open design questions to the user unless answering them is impossible from context — the agent is instructed to decide and record reasoning; the confirmation gate (Step 5) is where the user corrects course.

### Step 4: Generate build-spec.json

Write the spec file that all downstream phases consume:

```jsonc
// .claude/plans/build-spec.json
{
  "version": "1.0.0",
  "source": "conversation",
  "renderer": "vite",             // registry renderer name, from Step 1 detection or Question 5
  "outputTarget": "react",        // equals the renderer's language
  "createdAt": "2026-06-11T09:00:00Z",
  "conversation": {
    "description": "Verbatim or condensed user description of the app",
    "designBrief": ".claude/plans/design-brief.json",
    "interviewQuestionCount": 6
  },
  "figma": null,                  // populated by design-brief-to-figma after generation:
                                  // { "fileKey", "fileName", "url", "generated": true }
  "appType": "web-app",
  "framework": { "type": "vite", "version": "8.0.0", "outputDir": "src" },
  "styling": { "approach": "tailwind", "uiLibrary": "none", "existingTokens": false },
  "pages": [
    {
      "figmaNodeId": null,        // filled in by design-brief-to-figma per captured page
      "name": "Dashboard",
      "route": "/",
      "mockupPath": null,         // filled in by design-brief-to-figma (mockup HTML path)
      "sections": ["sidebar", "stats-overview", "revenue-chart", "customer-table"]
    }
  ],
  "components": [
    {
      "reactName": "StatsCard",   // described in design-brief.json > componentDescriptions
      "category": "ui",           // "ui" | "layout" | "sections" | "pages"
      "action": "generate",       // or "reuse"/"extend" per Question 7
      "existingPath": null,
      "variants": ["positive", "negative", "neutral"],
      "props": ["label", "value", "delta"]
    }
  ],
  "textContent": {
    // Drafted by conversation-designer from the purpose/audience answers.
    // Real copy, not lorem ipsum — TDD asserts against these strings.
  },
  "businessLogic": {
    "forms": [],
    "apiCalls": [],
    "auth": null,                 // "required" when Question 6 selected auth
    "stateManagement": null
  },
  "e2e": {
    "strategy": "navigate-interact-verify",   // from pipeline.config.json appTypes
    "flows": []                                // defaults per appType + flows implied by pages
  },
  "testStrategy": {
    "unit": true, "e2e": true, "visual": true,
    "crossBrowser": false, "coverageThreshold": 80
  },
  "options": { "componentReuse": "reuse", "integration": "standalone" }
}
```

**Renderer fields** follow the same rules as every other intake skill: `renderer` is authoritative, `outputTarget` equals the renderer's language, and a spec carrying only `outputTarget` resolves to that language's default renderer.

**Key differences from the figma/canva/screenshot build-specs:**
- `source` is `"conversation"`
- `conversation` block records the description and points at the design brief
- `figma` starts as `null` and is populated by `design-brief-to-figma` — the spec is *completed*, not created, by design generation
- `pages[].figmaNodeId` and `pages[].mockupPath` start as `null` for the same reason
- Components are *designed* rather than *detected*, so there is no `confidence` field; their visual contracts live in `design-brief.json > componentDescriptions`

### Step 5: Confirm and Proceed

When `conversation.interview.confirmBriefWithUser` is `true` (default), present the combined plan and wait for confirmation:

```
## Build Plan Summary
- App: Pulse Analytics — analytics dashboard for a small SaaS team
- Style: minimal, cool-neutral palette, primary #2563EB (user-provided)
- Pages: 2 (Dashboard, Settings)
- Components: 6 to generate, 0 reused
- Framework: Vite (react) — detected
- Requirements: auth, dark mode

Next: I'll generate the Figma design from this brief, show it to you,
then run the standard build pipeline against it.

Proceed with Figma design generation?
```

On corrections, update the brief/spec (re-dispatch `conversation-designer` for design-level changes) and re-confirm. This consumes no interview-question budget.

## Output

**Primary:** `.claude/plans/build-spec.json` (`"source": "conversation"`, `figma: null` pending generation)
**Secondary:** `.claude/plans/design-brief.json` (written by `conversation-designer`)
**Tertiary:** Build plan summary displayed to user

## Error Handling

- **User description too thin to design from:** Ask Question 1 follow-ups within the question budget; never proceed with an empty purpose.
- **Question budget exhausted with gaps remaining:** Fill gaps with style-direction defaults from the `conversation-designer` agent and flag every assumption in the Step 5 summary.
- **Existing build-spec.json found:** Ask whether to reuse it (skip to Phase C1 or the handoff, depending on its `figma` block) or start a fresh interview.
- **Renderer registry detects nothing and the user declines to choose:** Default to `vite` / `react` and say so in the summary.

## Integration

- **Consumed by:** `design-brief-to-figma` (Phase C1), `/build-from-conversation` orchestrator; downstream phases consume the completed build-spec exactly as if `figma-intake` had produced it
- **Uses:** `conversation-designer` agent, `AskUserQuestion`, renderer registry (`node scripts/renderer-registry.js detect . --json`), Glob, Read, Write
- **Config keys read:** `pipeline.config.json` → `conversation.interview.*`, `appTypes.*`
