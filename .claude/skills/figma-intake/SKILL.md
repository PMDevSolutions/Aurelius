---
name: figma-intake
description: Structured interview that auto-discovers Figma file structure, project context, and asks 3-5 targeted questions to produce a build-spec.json. Entry point for the autonomous build pipeline. Keywords: Figma intake, build spec, project discovery, figma interview, build plan
---

# Figma Intake — Structured Discovery

## Purpose

Gather everything needed to build a React app from a Figma design in a single structured pass. Auto-discovers what it can, asks the user only what it must, and outputs a machine-readable `build-spec.json` that downstream skills consume without re-asking questions.

## When to Use

- First phase of `/build-from-figma` pipeline
- Any time a user provides a Figma URL and wants to build from it
- When you need to understand a Figma file's structure before generating code

## Inputs

- **Required:** Figma file URL (with optional node-id)
- **Optional:** Existing project directory to integrate into

## Process

### Step 1: Auto-Discovery (No User Input)

Run these Figma MCP calls to gather context automatically:

```
1. get_metadata(fileKey)        → File name, pages, frames, component counts
2. get_variable_defs(fileKey)   → Design tokens (colors, typography, spacing)
3. get_screenshot(fileKey)      → Visual overview of each page/top-level frame
```

Simultaneously scan the local project:

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
   - Use appTypes[detected] for E2E strategy defaults
```

### Step 2: Compile Discovery Summary

Present findings to the user in a structured format:

```
## Figma File: [name]
- Pages: [list with frame counts]
- Components: [count] unique components
- Design tokens: [count] variables defined
- Color modes: [list if any]

## Local Project
- Framework: [detected or "none"]
- Existing components: [count] in [path]
- UI library: [detected or "none"]
- Design tokens: [existing or "none"]

## Component Mapping
| Figma Component | Existing Match? | Action |
|----------------|-----------------|--------|
| Button/Primary | src/components/ui/Button.tsx | Reuse / Regenerate |
| Card           | (none)                       | Generate new       |
| ...            | ...                          | ...                |
```

### Step 3: Ask Targeted Questions (Max 5)

Only ask questions whose answers cannot be derived from the Figma file or local project. Skip any question where the answer is obvious from context.

**Question 1 — Scope:**
> Which pages/frames should I build? [Show numbered list from Figma]
> (Default: all top-level frames)

**Question 2 — Component Reuse:**
> I found [N] existing components that match Figma components. Should I:
> a) Reuse them and only generate missing ones
> b) Regenerate all from Figma (replaces existing)
> c) Generate alongside with new names (no overwrites)
> (Only ask if existing components were found)

**Question 3 — Business Logic:**
> Are there any interactions or business logic beyond what's visible in the design?
> (e.g., form validation rules, API calls, auth requirements, state machines)
> (Default: pure presentational)

**Question 4 — Text Content:**
> I extracted these labels/text from Figma. Confirm they're correct as-is?
> [Show condensed list of headings, button labels, placeholder text]
> (Default: use as-is)

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

**Question 7 — App Type (only if ambiguous):**
> I detected this as a [chrome-extension / web-app / pwa]. Is that correct?
> (Skip if detection is unambiguous. Skip if manifest.json clearly identifies type.)

### Step 4: Generate build-spec.json

Write the spec file that all downstream phases consume:

```jsonc
// .claude/plans/build-spec.json
{
  "version": "1.0.0",
  "source": "figma",              // "figma" | "canva"
  "renderer": "vite",             // registry renderer name (from `renderer-registry list`): "nextjs" | "vite" | "sveltekit" | "expo" | ...
  "outputTarget": "react",    // resolved language; equals the renderer's language. "react" | "vue" | "svelte" | "react-native"
  "createdAt": "2026-03-16T12:00:00Z",
  "figma": {
    "fileKey": "abc123",
    "fileName": "My App Design",
    "url": "https://figma.com/file/abc123/My-App-Design"
  },
  "appType": "web-app",          // "web-app" | "chrome-extension" | "pwa"
  "framework": {
    "type": "vite",           // DEPRECATED — superseded by top-level `renderer`. Retained for back-compat only.
    "version": "6.0.0",
    "outputDir": "src"
  },
  "styling": {
    "approach": "tailwind",   // "tailwind" | "css-modules" | "styled-components"
    "uiLibrary": "shadcn",   // "shadcn" | "radix" | "headless" | "none"
    "existingTokens": false
  },
  "pages": [
    {
      "figmaNodeId": "1:2",
      "name": "Home",
      "route": "/",
      "sections": ["hero", "features", "pricing", "footer"]
    }
  ],
  "components": [
    {
      "figmaNodeId": "3:45",
      "figmaName": "Button/Primary",
      "reactName": "Button",
      "category": "ui",          // "ui" | "layout" | "sections" | "pages"
      "action": "generate",      // "generate" | "reuse" | "extend"
      "existingPath": null,      // path if reusing
      "variants": ["primary", "secondary", "outline"],
      "props": ["variant", "size", "disabled", "children"]
    }
  ],
  "textContent": {
    "hero-heading": "Build faster with AI",
    "hero-subheading": "Ship production apps in days, not months",
    "cta-primary": "Get Started",
    "cta-secondary": "Learn More"
    // ... all text extracted from Figma
  },
  "businessLogic": {
    // User-provided requirements beyond the design
    "forms": [],
    "apiCalls": [],
    "auth": null,
    "stateManagement": null
  },
  "e2e": {
    "strategy": "navigate-interact-verify",  // From pipeline.config.json appTypes
    "flows": [
      {
        "name": "page-navigation",
        "description": "Navigate between all pages and verify rendering",
        "steps": ["navigate to /", "verify hero section visible", "click nav link"]
      }
    ],
    // Chrome extension specific (when appType === "chrome-extension"):
    "extensionManifest": {
      "hasPopup": true,
      "hasBackground": true,
      "hasContentScript": true,
      "contentScriptMatches": ["*://*.example.com/*"],
      "permissions": ["storage", "activeTab"],
      "buildCommand": "pnpm build",
      "extensionPath": "dist"
    }
  },
  "testStrategy": {
    "unit": true,                 // Vitest + RTL for components
    "e2e": true,                  // Playwright E2E
    "visual": true,               // Screenshot comparison
    "crossBrowser": false,        // Firefox + WebKit (web apps only)
    "coverageThreshold": 80
  },
  "options": {
    "componentReuse": "reuse",    // "reuse" | "regenerate" | "alongside"
    "integration": "existing"     // "standalone" | "existing"
  }
}
```

**Renderer fields:**
- `renderer` (string) is the authoritative framework field. Valid values are the renderer names from `node scripts/renderer-registry.js list --json` (currently `nextjs`, `vite`, `sveltekit`, `expo`).
- `outputTarget` is retained and **equals the resolved renderer's `language`** (react / vue / svelte / react-native). Set both together from the registry `detect`/`resolve` output.
- `framework.type` is **deprecated** — folded into `renderer`. Keep it only for back-compat with older specs; `renderer` wins on any conflict.
- **Back-compat rule:** a build-spec carrying only `outputTarget` (no `renderer`) resolves to that language's DEFAULT renderer: `react → vite`, `svelte → sveltekit`, `react-native → expo`. (`vue` has no renderer yet — its default is unsupported/future.)

### Step 5: Confirm and Proceed

Present a summary of the build plan:

```
## Build Plan Summary
- Framework: Vite 6.0
- Pages: 3 (Home, Pricing, Dashboard)
- Components: 12 to generate, 4 to reuse
- Design tokens: 45 variables to extract
- Output: src/components/, src/pages/

Proceed with token extraction? (This starts the autonomous pipeline)
```

Wait for user confirmation before the pipeline continues.

## Output

**Primary:** `.claude/plans/build-spec.json`
**Secondary:** Build plan summary displayed to user

## Error Handling

- **Figma MCP unavailable:** Ask user to verify Figma Desktop is running or provide file key manually
- **No Figma variables defined:** Warn that token extraction will rely on computed styles (less accurate)
- **Ambiguous framework:** Ask user to specify rather than guessing
- **Empty Figma file:** Abort with clear message

## Integration

- **Consumed by:** `design-token-lock`, `tdd-from-figma`, `figma-to-react-workflow`, `/build-from-figma`
- **Uses:** Figma MCP (`get_metadata`, `get_variable_defs`, `get_screenshot`), Glob, Read
