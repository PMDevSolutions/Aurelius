---
name: figma-to-react-workflow
description: Orchestrates end-to-end Figma-to-React conversion pipeline with enforced TDD, automated pixel-diff visual QA, E2E testing, and app-type awareness (web apps, Chrome extensions, PWAs). Keywords: Figma to React, design tokens, autonomous component generation, Figma conversion, Tailwind config, component library, TDD, E2E, pixel-perfect
---

# Figma-to-React Autonomous Workflow

## Overview

This skill orchestrates the complete pipeline for converting Figma designs into production-ready React applications. It extracts design systems (colors, typography, spacing, effects) from Figma, transforms them into Tailwind CSS configuration and CSS custom properties, then generates functional TypeScript React components that faithfully reproduce the source design.

The workflow operates in four phases: interactive discovery, TDD scaffold, autonomous execution, and verified delivery. The result is a set of React components, pages, and a design token system ready for integration into Next.js, Vite, or Remix projects — verified to pixel-level accuracy against the Figma source.

**Core Principles:**
- **TDD is mandatory** — tests are written before components, never after
- Every component is a functional TypeScript component with explicit prop interfaces
- All styling uses Tailwind utility classes backed by design tokens from Figma
- No hardcoded color values, font sizes, or spacing -- everything references the token system
- Images use proper imports or public directory references, never broken paths
- Output is framework-aware (Next.js App Router, Vite SPA, Remix routes)
- **Pixel-perfect verification** — automated diff loop with pixelmatch, not manual comparison
- **App-type aware** — Chrome extensions, PWAs, and web apps each get appropriate test strategies

## When to Use

Use this skill when:
- Converting a Figma design file into a React application
- Extracting a design system from Figma into Tailwind configuration
- Generating a component library from Figma component sets
- Rebuilding an existing UI from a Figma redesign
- Starting a new React project from a Figma prototype

**Trigger phrases:**
- "Convert this Figma design to React"
- "Generate React components from Figma"
- "Extract design tokens from Figma"
- "Build a React app from this Figma file"
- "Figma to Next.js"
- "Figma to Vite"

## Phase 1: Discovery (Interactive)

This phase requires user input. Do not proceed autonomously until the user confirms the plan.

### Pipeline Integration Check

**Before asking any questions**, check if upstream artifacts exist:

```
1. Check: .claude/plans/build-spec.json
   → If exists: SKIP all discovery questions. Load spec directly.
   → Log: "Found build-spec.json from figma-intake — skipping discovery"

2. Check: src/styles/design-tokens.lock.json
   → If exists: SKIP token extraction in Phase 2. Use lockfile values.
   → Log: "Found design-tokens.lock.json — using locked token values"
```

If `build-spec.json` exists, jump directly to Phase 2 with the spec's framework, components, and options pre-loaded.

### Step 1.1: Gather Figma Context

Use the Figma MCP to inspect the design file.

```
1. get_metadata        — File name, pages, last modified, component counts
2. get_variable_defs   — Design tokens (colors, typography, spacing, effects)
3. get_design_context  — Layout structure, component hierarchy, auto-layout settings
4. get_screenshot      — Visual reference for each page/frame
```

### Step 1.2: Extract Design Tokens

Map Figma variables and styles to a token structure:

```
Design Tokens
├── Colors
│   ├── Primitives (blue-500, gray-100, etc.)
│   ├── Semantic (primary, secondary, destructive, muted)
│   └── Component-specific (card-bg, button-primary, input-border)
├── Typography
│   ├── Font families (with fallback stacks)
│   ├── Font sizes (scale: xs through 5xl)
│   ├── Font weights
│   ├── Line heights
│   └── Letter spacing
├── Spacing
│   ├── Base unit
│   └── Scale (0.5 through 96)
├── Border Radius
│   ├── Scale (sm, md, lg, xl, full)
│   └── Component-specific overrides
├── Shadows / Effects
│   ├── Box shadows (sm, md, lg, xl)
│   └── Drop shadows
└── Breakpoints
    └── Mobile, tablet, desktop, wide
```

### Step 1.3: Survey Components

Identify all Figma components and map them to React components:

| Figma Component | React Component | Category |
|----------------|-----------------|----------|
| Button/Primary | `<Button variant="primary">` | Primitives |
| Card | `<Card>` | Containers |
| Navigation/Header | `<Header>` | Layout |
| Hero Section | `<HeroSection>` | Sections |
| Input/Text | `<Input type="text">` | Forms |

### Step 1.4: Confirm Output Target

Ask the user to confirm:
1. **Framework:** Next.js (App Router), Next.js (Pages Router), Vite, or Remix
2. **Styling approach:** Tailwind CSS (default), CSS Modules, or styled-components
3. **Component library base:** shadcn/ui, Radix UI, Headless UI, or none
4. **State management:** React state, Zustand, Jotai, or none
5. **Output directory:** e.g., `src/components/`, `app/`, etc.

Present the component inventory and token summary for user approval before proceeding.

## Phase 2: Execution (Autonomous)

Once the user approves the discovery plan, proceed autonomously through all steps.

### Token Lockfile Constraint

**If `src/styles/design-tokens.lock.json` exists**, ALL generated code MUST reference lockfile values:
- Colors: Use Tailwind classes mapped in the lockfile, never approximate hex values
- Typography: Use exact font families, sizes, and weights from the lockfile
- Spacing: Use lockfile spacing scale values
- Text content: Use exact strings from `lockfile.textContent`

**Never approximate or guess values when a lockfile exists.** If a value isn't in the lockfile, add it to the lockfile first, then reference it.

### Test-First Gate (MANDATORY)

**TDD is enforced.** Component implementation MUST NOT begin until test files exist. This is a hard gate, not a suggestion.

```
BEFORE writing any component implementation:

  1. Run: ./scripts/verify-test-coverage.sh
     → If exit code 1: STOP. Invoke tdd-from-figma skill first.
     → If exit code 0: Proceed to implementation.

  2. For each component to generate:
     a. REQUIRE: src/components/**/{ComponentName}.test.tsx exists
        → If missing: STOP. Write test first (invoke tdd-from-figma).
        → This is not optional. No component ships without pre-existing tests.
     b. Read test file to understand expected behavior
     c. Implementation MUST make all tests pass
     d. Run: pnpm vitest run {test-file} after writing component
     e. If test fails: fix component, NOT the test

  3. After all components in a batch are written:
     → Run: pnpm vitest run --reporter=verbose
     → ALL tests must pass (Green phase) before proceeding
     → If any fail: fix components until green. Do not proceed to Phase 3.

  4. Verify test coverage meets threshold:
     → Run: pnpm vitest run --coverage
     → Must meet: pipeline.config.json → tdd.coverageThreshold (default: 80%)
```

**Why this gate exists:** Tests encode exact values from the lockfile (text content, ARIA roles, component structure). Without pre-written tests, there is no mechanism to verify the implementation matches the design. Tests are the contract between the Figma design and the React code.

### Step 2.1: Generate Tailwind Configuration

Create or extend `tailwind.config.ts` with extracted tokens:

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens mapped from Figma variables
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
          // ... full scale
        },
        // ... all color tokens
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Mapped from Figma typography styles
      },
      spacing: {
        // Mapped from Figma spacing variables
      },
      borderRadius: {
        // Mapped from Figma corner radius tokens
      },
      boxShadow: {
        // Mapped from Figma effect styles
      },
    },
  },
  plugins: [],
};

export default config;
```

Generate a companion CSS file with custom properties:

```css
/* src/styles/tokens.css */
:root {
  /* Colors - Primitives */
  --color-blue-500: #3b82f6;
  /* ... */

  /* Colors - Semantic */
  --color-primary: var(--color-blue-500);
  --color-primary-foreground: #ffffff;
  /* ... */

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-heading: "Plus Jakarta Sans", system-ui, sans-serif;
  /* ... */
}
```

### Step 2.2: Generate React Components

For each component identified in Phase 1, generate:

**File structure per component:**
```
src/components/
├── ui/
│   ├── button.tsx          # Primitive components
│   ├── input.tsx
│   ├── card.tsx
│   └── ...
├── layout/
│   ├── header.tsx          # Layout components
│   ├── footer.tsx
│   └── ...
├── sections/
│   ├── hero-section.tsx    # Page sections
│   ├── features-grid.tsx
│   └── ...
└── pages/                  # Full page compositions (or app/ for Next.js)
    ├── home-page.tsx
    └── ...
```

**Component template:**
```typescript
// src/components/ui/button.tsx
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground hover:bg-primary/90": variant === "primary",
            "bg-secondary text-secondary-foreground hover:bg-secondary/90": variant === "secondary",
            "border border-input bg-transparent hover:bg-accent": variant === "outline",
            "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
          },
          {
            "h-8 px-3 text-sm": size === "sm",
            "h-10 px-4 text-sm": size === "md",
            "h-12 px-6 text-base": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, type ButtonProps };
```

**Rules for component generation:**
1. All components are functional with `forwardRef` where appropriate
2. Every component has an explicit TypeScript `interface` for props
3. All styling uses Tailwind classes referencing token values
4. Components accept a `className` prop for composition
5. Use `cn()` utility (clsx + tailwind-merge) for class merging
6. Include proper ARIA attributes for interactive elements
7. Export both the component and its props type

### Step 2.3: Generate Page Compositions

Compose section components into full pages matching Figma frames:

```typescript
// app/page.tsx (Next.js App Router)
import { Header } from "@/components/layout/header";
import { HeroSection } from "@/components/sections/hero-section";
import { FeaturesGrid } from "@/components/sections/features-grid";
import { Footer } from "@/components/layout/footer";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeaturesGrid />
      </main>
      <Footer />
    </div>
  );
}
```

### Step 2.4: Handle Images and Assets

**For static images from Figma:**
```typescript
// Next.js - use next/image
import Image from "next/image";
import heroImage from "@/assets/images/hero.webp";

<Image src={heroImage} alt="Hero illustration" width={1200} height={600} priority />

// Vite - use standard imports
import heroImage from "@/assets/images/hero.webp";

<img src={heroImage} alt="Hero illustration" width={1200} height={600} loading="eager" />
```

**Rules:**
- Export images from Figma at 1x and 2x for retina
- Use WebP format with JPEG/PNG fallback
- Place in `public/images/` or `src/assets/images/`
- Every `<img>` must have a meaningful `alt` attribute
- Hero/above-fold images use `priority` (Next.js) or `loading="eager"`
- Below-fold images use `loading="lazy"`

### Step 2.5: Generate Utility Files

```
src/lib/
├── utils.ts          # cn() helper, formatters
└── fonts.ts          # Font loading (Next.js: next/font, Vite: @fontsource)
```

### Step 2.6: Run Tests (if test files exist)

After generating all components, if test files were written by `tdd-from-figma`:

```bash
pnpm vitest run --reporter=verbose
```

**If tests fail:** Fix the component implementation to match test expectations. The tests are authoritative — they encode exact values from the lockfile. Do not modify tests to match implementation.

Iterate until all tests pass (Green phase of TDD).

### Step 2.7: Generate Storybook Stories (Non-Blocking)

Once components are built and their unit tests pass, auto-generate Storybook
stories and MDX docs. Invoke the **storybook-story-generation** skill (or run the
script directly). This is **Phase 4.5** of the pipeline and is **non-blocking** —
a failure here logs a warning and the pipeline continues.

```bash
# Generate .stories.tsx + .mdx for every component (skips ones that already have stories)
./scripts/generate-stories.sh

# Preview without writing, or force-regenerate:
./scripts/generate-stories.sh --dry-run
./scripts/generate-stories.sh --force
```

The generator parses each component with a `ts-morph` AST and emits CSF3 stories
with prop-aware controls, one variant story per string-literal-union value,
`True`/`False` stories for booleans, action args for `on*` callbacks, and an MDX
autodocs page. Behavior is configured by `.claude/pipeline.config.json` →
`storybook`. See the storybook-story-generation skill for the full reference.

When running under `parallel-orchestration`, this maps to the `storybook` phase
(`depends: [component-build]`, `blocking: false`) and runs alongside the visual
diff and dark-mode checks.

## Phase 3: Verification

After generation completes, invoke verification checks.

### Step 3.1: Build Verification

```bash
# Verify the project builds without errors
pnpm build

# Verify TypeScript types pass
pnpm tsc --noEmit

# Verify linting passes
pnpm lint
```

### Step 3.2: Visual QA (Automated Pixel-Diff Loop)

Perform automated visual comparison using `pixelmatch` via `scripts/visual-diff.js`. This replaces manual "eyeball" comparison with programmatic diff analysis.

**Configuration:** Read `.claude/pipeline.config.json` for thresholds:
- `iterationLoop.maxVisualIterations` (default: 5)
- `iterationLoop.diffPassThreshold` (default: 0.02 = 2% mismatch)

```
For each page in build-spec:
  1. Start dev server (if appType requires it): pnpm dev (background)
  2. Wait for server ready
  3. Capture Figma screenshots once:
     → Figma MCP: get_screenshot for the page/frame at each breakpoint
     → Save to: .claude/visual-qa/screenshots/figma/

  4. FOR iteration IN 1..maxVisualIterations:

     a. CAPTURE app screenshots:
        → Chrome DevTools MCP: navigate_page, resize_page, take_screenshot
        → At breakpoints: 1440px, 768px, 375px
        → Save to: .claude/visual-qa/screenshots/chromium/

     b. DIFF against Figma:
        → node scripts/visual-diff.js --batch \
            .claude/visual-qa/screenshots/chromium \
            .claude/visual-qa/screenshots/figma \
            --output-dir .claude/visual-qa/diffs --json

     c. ANALYZE results:
        → Parse JSON: check mismatchPct per file
        → Check region analysis: identify problem areas
        → Log: "Iteration {N}: {page} at {breakpoint} — {pct}% diff"

     d. DECIDE:
        IF all files mismatchPct <= diffPassThreshold:
          → Mark page as verified
          → Break loop
          → Log: "Visual QA PASSED on iteration {N}"

        ELSE IF iteration < maxVisualIterations:
          → For each failing comparison:
            - Read diff image to see where mismatches are
            - Use region analysis: "top-right: 8% diff → likely header issue"
            - Fix the specific component code
            - Run: pnpm vitest run (ensure tests still pass after fix)
          → Continue to next iteration

        ELSE (final iteration, still failing):
          → Save diff images for manual review
          → Log remaining mismatch percentages
          → Mark page as "needs manual review"

  5. Stop dev server
```

### Step 3.2.5: Cross-Browser Verification

After Chromium passes the visual diff loop, diff Firefox and WebKit against
their committed baselines (RFC 0002):

```bash
# Compare current firefox/webkit screenshots against committed baselines
# (threshold from visualBaselines.threshold, 0.03 for cross-engine tolerance)
./scripts/cross-browser-baseline.sh compare http://localhost:3000 --json
```

If no cross-browser baselines exist yet, the compare skips with a hint —
capture them deterministically first and commit the result:

```bash
./scripts/cross-browser-baseline.sh capture http://localhost:3000   # pinned Playwright container
git add .claude/visual-qa/baselines && git commit -m "test: add cross-browser baselines"
```

Each baseline's provenance (engine, Playwright version, container image,
sha256, host) is verified from `baselines/manifest.json` before diffing, so
stale or locally-captured baselines are flagged instead of producing false
pixel diffs. Results are logged in the build report but are **not blocking**
by default (`visualBaselines.blocking`).

### Step 3.3: E2E Tests

Generate and run E2E tests appropriate to the app type.

```
1. Invoke the e2e-test-generator skill:
   → Reads build-spec.json (appType, pages, e2e.flows)
   → Generates Playwright E2E test files in e2e/
   → Generates appropriate config (web app vs Chrome extension vs PWA)

2. Run E2E tests:
   → Web app: pnpm exec playwright test
   → Chrome ext: pnpm build && pnpm exec playwright test --config=playwright.chrome-ext.config.ts
   → PWA: pnpm exec playwright test (includes offline tests)

3. If E2E tests fail:
   → Read failure output
   → Fix component/page code
   → Re-run pnpm vitest run (ensure unit tests still pass)
   → Re-run E2E tests (max 2 retry attempts)

4. Save results to .claude/visual-qa/e2e-report.md
```

### Step 3.4: Token Integrity Check

Run the token verification script:

```bash
./scripts/verify-tokens.sh
```

This checks for:
- Hardcoded hex colors in `.tsx` files
- Arbitrary pixel values not in the lockfile
- Inline `style={{}}` attributes
- Text content diverging from lockfile entries

### Step 3.5: Quality Gate

Run the full quality gate. All checks must pass for the pipeline to succeed.

```bash
# 1. Unit test coverage (threshold from pipeline.config.json, default: 80%)
pnpm vitest run --coverage

# 2. Test existence verification
./scripts/verify-test-coverage.sh

# 3. TypeScript
pnpm tsc --noEmit

# 4. Production build
pnpm build

# 5. Token verification
./scripts/verify-tokens.sh

# 6. E2E tests (if not already run in Step 3.3)
# Web app: pnpm exec playwright test
# Chrome ext: pnpm exec playwright test --config=playwright.chrome-ext.config.ts

# 7. Lighthouse audit (via Chrome DevTools MCP)
# → lighthouse_audit for each page URL
# → Thresholds from pipeline.config.json → qualityGate.lighthouseThresholds
```

If any check fails, attempt to fix automatically (max 2 attempts per check). If still failing, report the failure and continue to the report phase.

### Step 3.6: Generate Build Report

Write a build report to `.claude/visual-qa/build-report.md`:

```markdown
# Build Report — [Project Name]
Generated: [timestamp]
Figma Source: [URL]

## Summary
- Pages: [N] built, [N] verified
- Components: [N] generated, [N] reused
- Test coverage: [X]%
- Build status: PASS/FAIL

## Visual QA Results
| Page | Desktop (1440) | Tablet (768) | Mobile (375) | Status |
|------|---------------|--------------|--------------|--------|
| Home | ✓ Match | ✓ Match | ⚠ Minor diff | Verified |

## Quality Gate
| Check | Status | Details |
|-------|--------|---------|
| vitest | ✓ | 45/45 tests pass, 87% coverage |
| tsc | ✓ | No type errors |
| build | ✓ | Bundle: 142kb gzipped |
| tokens | ✓ | No violations |
| Lighthouse | ✓ | Perf: 95, A11y: 100, BP: 100, SEO: 100 |

## Remaining Issues
- [List any items that need manual review]
```

## Output Summary

At the end of a successful conversion, the following artifacts are produced:

```
project/
├── tailwind.config.ts          # Extended with Figma design tokens
├── src/
│   ├── styles/
│   │   ├── tokens.css          # CSS custom properties from Figma
│   │   └── design-tokens.lock.json  # Lockfile (if generated)
│   ├── lib/
│   │   ├── utils.ts            # Utility functions (cn, etc.)
│   │   └── fonts.ts            # Font loading configuration
│   ├── components/
│   │   ├── ui/                 # Primitive UI components
│   │   ├── layout/             # Layout components (header, footer)
│   │   └── sections/           # Page sections
│   └── app/ or pages/          # Page compositions
├── .claude/
│   ├── plans/
│   │   └── build-spec.json     # Build specification (if generated)
│   └── visual-qa/
│       └── build-report.md     # Visual QA and quality report
└── public/
    └── images/                 # Exported Figma assets
```

## Common Failures

### 1. Colors Don't Match Figma

**Symptom:** Colors are visibly different from the Figma design.

**Cause:** Figma uses a different color space, or variables were not resolved correctly.

**Fix:** Re-extract colors using `get_variable_defs`. If lockfile exists, verify lockfile values against Figma screenshot. Ensure Figma color mode is sRGB.

### 2. Typography Scale Is Off

**Symptom:** Text sizes or line heights don't match Figma.

**Cause:** Figma measures in logical pixels; CSS may differ depending on root font size.

**Fix:** Ensure `html { font-size: 16px }` as baseline. Map Figma text styles 1:1 with rem values. Cross-reference lockfile typography section.

### 3. Spacing Inconsistencies

**Symptom:** Padding and margins differ from Figma auto-layout values.

**Cause:** Figma auto-layout padding/gap values were not mapped to the Tailwind spacing scale.

**Fix:** Use exact pixel values from Figma auto-layout settings. Add custom spacing values to `tailwind.config.ts` if they don't fit the default scale.

### 4. Components Missing Variants

**Symptom:** A Figma component has hover/active/disabled states that aren't implemented.

**Cause:** Component variants in Figma were not fully surveyed in Phase 1.

**Fix:** Re-inspect the component in Figma using `get_design_context` to capture all variant properties.

### 5. Tests Fail After Generation

**Symptom:** `pnpm vitest run` fails after component generation.

**Cause:** Component implementation doesn't match lockfile values encoded in tests.

**Fix:** Read the failing test assertions. They contain exact expected values from the lockfile. Fix the component to match — do NOT modify the test.

## Integration

This skill works with:
- **figma-intake skill** — Produces `build-spec.json` consumed by Phase 1 (includes appType, e2e flows)
- **design-token-lock skill** — Produces `design-tokens.lock.json` consumed by Phase 2
- **tdd-from-figma skill** — Produces test files that Phase 2 MUST satisfy (hard gate)
- **e2e-test-generator skill** — Generates Playwright E2E tests in Phase 3.3
- **storybook-story-generation skill** — Auto-generates Storybook stories + MDX docs in Phase 4.5 (non-blocking)
- **figma-react-converter agent** — Generates React components during Phase 2
- **visual-qa-agent** — Performs screenshot comparison in Phase 3
- **accessibility-auditor agent** — Validates ARIA and keyboard navigation
- **Figma MCP** — Source design extraction (`get_metadata`, `get_variable_defs`, `get_design_context`, `get_screenshot`)
- **Chrome DevTools MCP** — Browser-based visual verification and Lighthouse audits
- **Playwright MCP** — Cross-browser screenshot comparison and E2E testing
- **scripts/visual-diff.js** — Pixel-level screenshot comparison with region analysis
- **scripts/verify-tokens.sh** — Token integrity enforcement in quality gate
- **scripts/verify-test-coverage.sh** — Test existence verification (TDD gate)
- **scripts/cross-browser-baseline.sh** — Cross-browser baseline capture + provenance-verified comparison (RFC 0002)
- **scripts/cross-browser-test.sh** — Ad-hoc multi-browser screenshot capture (no comparison)
- **scripts/generate-stories.sh** — AST-based Storybook story + MDX generation (Phase 4.5)
- **.claude/pipeline.config.json** — Thresholds, iteration limits, app type config

---

**Skill Version:** 3.0.0
**Last Updated:** 2026-03-17
