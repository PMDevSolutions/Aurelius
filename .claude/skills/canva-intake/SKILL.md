---
name: canva-intake
description: Structured discovery for Canva designs. Uses Canva AI Connector MCP to export screenshots, Claude vision to analyze page structure and components, and targeted user questions to produce a build-spec.json. Entry point for /build-from-canva pipeline. Keywords: Canva intake, build spec, Canva discovery, Canva interview, Canva design
---

# Canva Intake — Structured Discovery

## Purpose

Gather everything needed to build a React app from a Canva design in a single structured pass. Uses the Canva AI Connector MCP to export screenshots, Claude's vision capabilities to analyze design structure, asks the user only what it must, and outputs a machine-readable `build-spec.json` that downstream skills consume without re-asking questions.

## When to Use

- First phase of `/build-from-canva` pipeline
- Any time a user provides a Canva URL and wants to build from it
- When you need to understand a Canva design's structure before generating code

## Inputs

- **Required:** Canva design URL (e.g., `https://www.canva.com/design/DAGxyz.../...`)
- **Optional:** Existing project directory to integrate into

## Process

### Step 1: Auto-Discovery (No User Input)

**Extract from Canva via MCP:**

Use the Canva AI Connector MCP to interact with the design:

```
1. Search/identify the design from the URL
   → Design name, dimensions, page count
2. Export full-page screenshots (PNG, 2x scale)
   → One screenshot per page at high resolution
3. If multi-page: export each page separately
   → Individual page screenshots for detailed analysis
```

**Vision analysis of screenshots:**

Feed each exported screenshot to Claude for structural analysis:

```
1. Page structure:
   - Identify distinct sections (hero, navigation, features, footer, etc.)
   - Detect layout patterns (grid, flex, sidebar, stacked)
   - Note responsive hints (if multiple artboards exist)

2. Component candidates:
   - Buttons (variants: primary, secondary, ghost, etc.)
   - Cards, inputs, modals, navbars, footers
   - Repeated patterns that suggest reusable components

3. Visual hierarchy:
   - Heading levels (H1, H2, H3) from size/weight
   - Primary vs secondary actions
   - Content grouping and spacing patterns

4. Text content:
   - All visible text strings (headings, body, labels, CTAs)
   - Placeholder text vs real content
```

**Simultaneously scan the local project** (identical to figma-intake):

```
1. Detect framework via the renderer registry:
   - Run: node scripts/renderer-registry.js detect . --json
   - On { "renderer": "<name>", "language": "<lang>" }:
       set build-spec renderer = <name>
       set build-spec outputTarget = <language>  (react | vue | svelte | react-native)
   - On { "renderer": null }:
       no framework detected → New project needed (ask output target question)
   Do not hand-sniff config files or package.json deps; the registry owns detection.

2. Detect app type:
   - manifest.json with "manifest_version" → Chrome Extension
   - manifest.json with "start_url" or "display" → PWA
   - Otherwise → Web App

3. Scan existing components:
   - Glob: src/components/**/*.tsx, app/components/**/*.tsx
   - Build inventory: name, props interface, file path

4. Check package.json for UI libraries:
   - @shadcn/ui, @radix-ui/*, @headlessui/react
   - tailwindcss, @emotion/*, styled-components
   - State: zustand, jotai, @tanstack/react-query

5. Check for existing design tokens:
   - tailwind.config.ts theme.extend
   - src/styles/tokens.css or similar
   - design-tokens.lock.json (from prior runs)

6. Load pipeline config:
   - Read .claude/pipeline.config.json for thresholds and app type definitions
   - Read canva section for export settings
```

### Step 2: Compile Discovery Summary

Present findings to the user in a structured format:

```
## Canva Design: [name]
- Pages: [count] pages exported
- Dimensions: [width x height per page]
- Sections detected: [list from vision analysis]
- Component candidates: [count] identified

## Vision Analysis Confidence
- Layout structure: [high/medium/low]
- Component identification: [high/medium/low]
- Text extraction: [high/medium/low]

## Local Project
- Framework: [detected or "none"]
- Existing components: [count] in [path]
- UI library: [detected or "none"]
- Design tokens: [existing or "none"]

## Component Mapping
| Detected Component | Confidence | Existing Match? | Action |
|-------------------|------------|-----------------|--------|
| Primary Button    | High       | src/.../Button  | Reuse / Regenerate |
| Hero Section      | High       | (none)          | Generate new |
| Card              | Medium     | (none)          | Generate (confirm) |
```

### Step 3: Ask Targeted Questions (Max 5)

Only ask questions whose answers cannot be derived from the design or local project.

**Question 1 — Scope:**
> Which pages should I build? [Show numbered list with detected sections]
> (Default: all pages)

**Question 2 — Component Confirmation:**
> I detected these components from the design screenshots. Confirm or correct:
> [Show table from Step 2 with confidence levels]
> (This question is always asked for Canva — unlike Figma, detection is vision-based)

**Question 3 — Component Reuse:**
> I found [N] existing components that match detected components. Should I:
> a) Reuse them and only generate missing ones
> b) Regenerate all from the Canva design (replaces existing)
> c) Generate alongside with new names (no overwrites)
> (Only ask if existing components were found)

**Question 4 — Business Logic:**
> Are there any interactions or business logic beyond what's visible in the design?
> (e.g., form validation rules, API calls, auth requirements, state machines)
> (Default: pure presentational)

**Question 5 — Integration:**
> Should this be:
> a) A standalone app (new project scaffold)
> b) Integrated into the existing project at [detected path]
> (Only ask if existing project detected)

**Question 6 — Output Target (only if no framework detected):**
> Run `node scripts/renderer-registry.js list --json` and present the returned
> renderer names as the choices (each entry has `name` and `language`):
> "Which renderer should I build this in? [numbered list of registry renderers]"
> - Greenfield React default: `vite`.
> - Set build-spec `renderer` = the chosen name and `outputTarget` = its `language`.
> (Skip if the registry already detected a framework for the existing project.)

### Step 4: Generate build-spec.json

Write the spec file that all downstream phases consume:

```jsonc
// .claude/plans/build-spec.json
{
  "version": "1.0.0",
  "source": "canva",
  "outputTarget": "react",    // "react" | "vue" | "svelte" | "react-native"
  "createdAt": "2026-03-18T12:00:00Z",
  "canva": {
    "designId": "DAGxyz...",
    "designName": "My App Design",
    "url": "https://www.canva.com/design/DAGxyz/...",
    "exportedScreenshots": [
      ".claude/visual-qa/screenshots/canva/page-1.png",
      ".claude/visual-qa/screenshots/canva/page-2.png"
    ]
  },
  "appType": "web-app",
  "framework": {
    "type": "vite",           // "nextjs-app" | "nextjs-pages" | "vite" | "remix" | "nuxt" | "sveltekit" | "expo"
    "version": "6.0.0",
    "outputDir": "src"
  },
  "styling": {
    "approach": "tailwind",
    "uiLibrary": "shadcn",
    "existingTokens": false
  },
  "pages": [
    {
      "canvaPageIndex": 0,
      "screenshotPath": ".claude/visual-qa/screenshots/canva/page-1.png",
      "name": "Home",
      "route": "/",
      "sections": ["hero", "features", "pricing", "footer"]
    }
  ],
  "components": [
    {
      "detectedName": "Primary Button",
      "confidence": "high",
      "reactName": "Button",
      "category": "ui",
      "action": "generate",
      "existingPath": null,
      "variants": ["primary", "secondary", "outline"],
      "props": ["variant", "size", "disabled", "children"]
    }
  ],
  "textContent": {
    "hero-heading": "Build faster with AI",
    "hero-subheading": "Ship production apps in days, not months",
    "cta-primary": "Get Started",
    "cta-secondary": "Learn More"
  },
  "businessLogic": {
    "forms": [],
    "apiCalls": [],
    "auth": null,
    "stateManagement": null
  },
  "e2e": {
    "strategy": "navigate-interact-verify",
    "flows": [
      {
        "name": "page-navigation",
        "description": "Navigate between all pages and verify rendering",
        "steps": ["navigate to /", "verify hero section visible", "click nav link"]
      }
    ]
  },
  "testStrategy": {
    "unit": true,
    "e2e": true,
    "visual": true,
    "crossBrowser": false,
    "coverageThreshold": 80
  },
  "options": {
    "componentReuse": "reuse",
    "integration": "existing"
  }
}
```

**Key differences from Figma build-spec:**
- `source` is `"canva"` instead of `"figma"`
- `canva` block replaces `figma` block (different metadata)
- `exportedScreenshots` array — paths to exported PNGs (used by token inference and visual diff)
- Components have `confidence` field (high/medium/low) since detection is vision-based
- Pages reference `canvaPageIndex` and `screenshotPath` instead of `figmaNodeId`

### Step 5: Confirm and Proceed

Present a summary of the build plan:

```
## Build Plan Summary
- Source: Canva design "[name]"
- Framework: Vite 6.0
- Pages: 3 (Home, Pricing, Dashboard)
- Components: 12 to generate (8 high-confidence, 3 medium, 1 low)
- Existing to reuse: 4
- Output: src/components/, src/pages/
- Token extraction: AI-powered inference (will need your confirmation)

Proceed with token inference? (This starts the autonomous pipeline)
```

Wait for user confirmation before the pipeline continues.

## Output

**Primary:** `.claude/plans/build-spec.json`
**Secondary:** Exported screenshots in `.claude/visual-qa/screenshots/canva/`
**Tertiary:** Build plan summary displayed to user

## Error Handling

- **Canva MCP unavailable:** Ask user to check Canva AI Connector setup. Offer to proceed with manually provided screenshots.
- **Export fails:** Fall back to asking user to export PNGs from Canva and provide file paths.
- **Low confidence on most components:** Warn user that vision-based detection has limitations. Ask for more details or suggest exporting to Figma for higher accuracy.
- **Multi-page design ambiguity:** Show all pages and ask user to specify which to build.
- **Rate limited by Canva API:** Apply retry protocol from `pipeline.config.json > canva.retry`. Log each retry attempt. If all retries fail, ask user to wait 2 minutes and re-invoke Phase 1.
- **MCP timeout during export:** Retry up to 3 times with exponential backoff. If persistent, reduce export scale to 1x and retry. Fall back to manual export as last resort.

## Integration

- **Consumed by:** `canva-token-inference`, `tdd-from-figma`, `canva-react-converter`, `/build-from-canva`
- **Uses:** Canva AI Connector MCP (search, export), Claude vision analysis, Glob, Read
