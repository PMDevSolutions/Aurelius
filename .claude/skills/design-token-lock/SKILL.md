---
name: design-token-lock
description: Extracts exact design values from Figma and writes a lockfile that becomes the single source of truth for colors, typography, spacing, and text content. Generates tailwind.config.ts and tokens.css from the lockfile. Keywords: design tokens, lockfile, Figma variables, token extraction, style drift, Tailwind config generation
---

# Design Token Lock — Single Source of Truth

## Purpose

Solve the #1 recurring pain point in Figma-to-code: **style drift**. This skill extracts every design value from Figma, writes a versioned lockfile (`design-tokens.lock.json`), and generates Tailwind config + CSS custom properties from it. The lockfile becomes the single source of truth — tests assert against it, components reference it, and the verify-tokens script enforces it.

## When to Use

- Phase 2 of the `/build-from-figma` pipeline (after `figma-intake`)
- Any time you need to extract or refresh design tokens from Figma
- When regenerating Tailwind config from a Figma file

## Inputs

- **Required:** Figma file key (from build-spec.json or URL)
- **Optional:** `.claude/plans/build-spec.json` (for component-specific token scoping)

## Process

### Step 1: Extract Tokens from Figma

Call Figma MCP to get all design values:

```
1. get_variable_defs(fileKey)
   → Color variables, typography variables, spacing variables
   → Variable collections and modes (light/dark)

2. get_design_context(fileKey, nodeId) — for each top-level frame
   → Computed styles on actual elements
   → Auto-layout padding, gap, corner radius values
   → Text styles with exact font-family, size, weight, lineHeight

3. get_screenshot(fileKey, nodeId) — for color reference verification
   → Visual reference to cross-check extracted values
```

### Step 2: Build Token Structure

Organize extracted values into a normalized structure. Every value must trace back to Figma.

**Color tokens:**
- Extract from Figma variables first (most accurate)
- Fall back to computed styles on elements if no variables defined
- Record: hex, rgb, hsl, and suggested Tailwind class name
- Group: primitives (raw values), semantic (roles), component-specific

**Typography tokens:**
- Font family with full fallback stack
- Size scale in px and rem (assuming 16px base)
- Weight values (numeric, not named)
- Line height as unitless ratio
- Letter spacing in em

**Spacing tokens:**
- Extract from auto-layout padding, gap, itemSpacing
- Map to Tailwind spacing scale where possible
- Record exact px values for custom entries

**Effect tokens:**
- Box shadows: offset-x, offset-y, blur, spread, color
- Border radius values per component
- Opacity values

**Text content:**
- Every visible text string in the design
- Keyed by component/section for easy lookup
- Includes: headings, body, labels, placeholders, button text, tooltips

### Step 3: Write Lockfile

Write `src/styles/design-tokens.lock.json`:

```jsonc
{
  "version": "1.0.0",
  "generatedAt": "2026-03-16T12:00:00Z",
  "figmaFileKey": "abc123",
  "figmaLastModified": "2026-03-15T10:30:00Z",

  "colors": {
    "primitives": {
      "blue-50": { "hex": "#eff6ff", "rgb": "239, 246, 255", "tailwind": "blue-50" },
      "blue-500": { "hex": "#3b82f6", "rgb": "59, 130, 246", "tailwind": "blue-500" },
      "blue-600": { "hex": "#2563eb", "rgb": "37, 99, 235", "tailwind": "blue-600" },
      "gray-50": { "hex": "#f9fafb", "rgb": "249, 250, 251", "tailwind": "gray-50" },
      "gray-900": { "hex": "#111827", "rgb": "17, 24, 39", "tailwind": "gray-900" }
    },
    "semantic": {
      "primary": { "ref": "blue-600", "hex": "#2563eb", "tailwind": "primary" },
      "primary-foreground": { "ref": null, "hex": "#ffffff", "tailwind": "primary-foreground" },
      "background": { "ref": null, "hex": "#ffffff", "tailwind": "background" },
      "foreground": { "ref": "gray-900", "hex": "#111827", "tailwind": "foreground" },
      "muted": { "ref": "gray-50", "hex": "#f9fafb", "tailwind": "muted" },
      "destructive": { "ref": null, "hex": "#dc2626", "tailwind": "destructive" }
    },
    "component": {
      "card-bg": { "ref": null, "hex": "#ffffff", "tailwind": "card" },
      "input-border": { "ref": null, "hex": "#d1d5db", "tailwind": "input" }
    }
  },

  "typography": {
    "families": {
      "sans": { "value": "Inter", "fallback": "system-ui, -apple-system, sans-serif" },
      "heading": { "value": "Plus Jakarta Sans", "fallback": "system-ui, sans-serif" }
    },
    "scale": {
      "xs": { "px": 12, "rem": "0.75rem", "tailwind": "text-xs" },
      "sm": { "px": 14, "rem": "0.875rem", "tailwind": "text-sm" },
      "base": { "px": 16, "rem": "1rem", "tailwind": "text-base" },
      "lg": { "px": 18, "rem": "1.125rem", "tailwind": "text-lg" },
      "xl": { "px": 20, "rem": "1.25rem", "tailwind": "text-xl" },
      "2xl": { "px": 24, "rem": "1.5rem", "tailwind": "text-2xl" },
      "3xl": { "px": 30, "rem": "1.875rem", "tailwind": "text-3xl" },
      "4xl": { "px": 36, "rem": "2.25rem", "tailwind": "text-4xl" }
    },
    "weights": {
      "normal": 400,
      "medium": 500,
      "semibold": 600,
      "bold": 700
    },
    "lineHeights": {
      "tight": 1.25,
      "normal": 1.5,
      "relaxed": 1.75
    }
  },

  "spacing": {
    "scale": {
      "0.5": { "px": 2 },
      "1": { "px": 4 },
      "2": { "px": 8 },
      "3": { "px": 12 },
      "4": { "px": 16 },
      "5": { "px": 20 },
      "6": { "px": 24 },
      "8": { "px": 32 },
      "10": { "px": 40 },
      "12": { "px": 48 },
      "16": { "px": 64 }
    },
    "custom": {}
  },

  "borderRadius": {
    "sm": { "px": 4 },
    "md": { "px": 6 },
    "lg": { "px": 8 },
    "xl": { "px": 12 },
    "2xl": { "px": 16 },
    "full": { "px": 9999 }
  },

  "shadows": {
    "sm": { "value": "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
    "md": { "value": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" },
    "lg": { "value": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }
  },

  "textContent": {
    "hero-heading": "Build faster with AI",
    "hero-subheading": "Ship production apps in days, not months",
    "cta-primary": "Get Started",
    "cta-secondary": "Learn More",
    "nav-home": "Home",
    "nav-pricing": "Pricing",
    "nav-docs": "Docs"
  }
}
```

### Step 4: Generate Framework Config

The lockfile and token extraction above are framework-agnostic; only the config target changes. Resolve the build-spec's `renderer` manifest to select it:

```bash
node scripts/renderer-registry.js resolve <renderer> --json
```

Use `manifest.language` to choose the styling approach and `manifest.template` to locate where the framework's config lives:

- **`react` / `vue` / `svelte`** — Tailwind CSS-variable approach (the path documented here). Generate or update the Tailwind config (e.g. `tailwind.config.ts`, alongside `manifest.template`). Astro reuses this same React/Tailwind path (its language is `react`).
- **`react-native`** — NativeWind: generate the NativeWind/Tailwind config plus a StyleSheet token module for the Expo template instead of a web `tokens.css`.

The Figma pipeline targets React renderers (nextjs, vite), so in practice this resolves to the Tailwind path below.

Generate or update the Tailwind config from the lockfile:

```typescript
// Read design-tokens.lock.json and map to Tailwind theme
// Every value references a CSS custom property
// Custom properties are defined in tokens.css (Step 5)
```

**Rules:**
- All color values use `var(--color-*)` references, not raw hex
- Typography references `var(--font-*)` for families
- Custom spacing values added to `theme.extend.spacing`
- Border radius and shadows mapped to `theme.extend`
- Never hardcode values directly in tailwind.config.ts

### Step 5: Generate CSS Custom Properties

Generate `src/styles/tokens.css` from the lockfile:

```css
/* Auto-generated from design-tokens.lock.json — do not edit manually */
:root {
  /* Color Primitives */
  --color-blue-50: #eff6ff;
  --color-blue-500: #3b82f6;
  /* ... */

  /* Color Semantic */
  --color-primary: var(--color-blue-600);
  --color-primary-foreground: #ffffff;
  --color-background: #ffffff;
  --color-foreground: var(--color-gray-900);
  /* ... */

  /* Typography */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-heading: "Plus Jakarta Sans", system-ui, sans-serif;
  /* ... */

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  /* ... */
}
```

### Step 6: Validate Lockfile

After generation, verify:

1. **Completeness:** Every color/font/spacing used in the Figma file has a lockfile entry
2. **Consistency:** No duplicate values with different keys
3. **Tailwind mapping:** Every lockfile entry has a valid Tailwind class suggestion
4. **Cross-reference:** Spot-check 3-5 values against Figma screenshots

Report any gaps to the user before proceeding.

## Output

| File | Purpose |
|------|---------|
| `src/styles/design-tokens.lock.json` | Versioned lockfile — single source of truth |
| `tailwind.config.ts` | Tailwind theme extended from lockfile |
| `src/styles/tokens.css` | CSS custom properties from lockfile |

## Lockfile Update Flow

When the Figma file changes:
1. Re-run this skill
2. Diff new lockfile against existing
3. Show changes to user for approval
4. Regenerate tailwind.config.ts and tokens.css
5. Run `scripts/verify-tokens.sh` to catch any components that now drift

## Error Handling

- **No Figma variables:** Fall back to computed styles from `get_design_context`. Warn user that extraction is less accurate.
- **Color space mismatch:** Figma uses sRGB internally. If values look wrong, re-extract with explicit sRGB conversion.
- **Missing fonts:** List required fonts and suggest `@fontsource` packages or Google Fonts links.

## Integration

- **Produces:** `design-tokens.lock.json`, `tailwind.config.ts`, `tokens.css`
- **Consumed by:** `tdd-from-figma` (test assertions), `figma-to-react-workflow` (component generation), `verify-tokens.sh` (enforcement)
- **Uses:** Figma MCP (`get_variable_defs`, `get_design_context`, `get_screenshot`)
