---
name: canva-token-inference
description: AI-powered design token extraction from Canva screenshots. Uses Claude vision to infer colors, typography, spacing, and effects with confidence scoring. Presents tokens for user confirmation before locking. Keywords: Canva tokens, token inference, design tokens, Canva extraction, AI token detection, color extraction, typography detection
---

# Canva Token Inference — AI-Powered Token Extraction

## Purpose

Extract design tokens from Canva design screenshots using Claude's vision capabilities. Unlike Figma's programmatic token extraction, Canva doesn't expose design data through APIs. This skill bridges that gap by analyzing screenshots to infer colors, typography, spacing, and effects, then presenting them with confidence scores for user confirmation before writing the lockfile.

The output is identical to `design-token-lock` — a `design-tokens.lock.json` that downstream phases consume with no awareness of the source.

## When to Use

- Phase 2 of the `/build-from-canva` pipeline (after `canva-intake`)
- Phase 2 of the `/build-from-screenshot` pipeline (after `screenshot-intake`)
- Any time you need to extract design tokens from Canva screenshots
- Any time you need to extract design tokens from screenshots (any source)
- When regenerating Tailwind config from Canva screenshots

## Inputs

- **Required:** `.claude/plans/build-spec.json` with `"source": "canva"` or `"source": "screenshot"` and screenshot paths
  - For canva: reads `canva.exportedScreenshots[]`
  - For screenshot: reads `screenshot.capturedScreenshots[]`
- **Optional:** User-provided brand guidelines, style guide, or color palette

## Process

### Step 1: Gather Screenshots for Analysis

Read `build-spec.json` and collect all exported screenshots:

```
1. Determine source type from build-spec.json.source
2. If "canva": read canva.exportedScreenshots[]
3. If "screenshot": read screenshot.capturedScreenshots[]
4. Verify all screenshot files exist
5. If missing:
   - canva: re-export via Canva MCP
   - screenshot URL: re-capture via Chrome DevTools/Playwright MCP
   - screenshot files: ask user to re-provide
```

### Step 2: AI Vision Token Extraction

Analyze each screenshot with Claude vision. Extract tokens in stages:

**Pass 1 — Colors:**
```
Analyze the screenshots and extract ALL distinct colors used in the design.
Group them as:

1. Brand/Primary colors (dominant, used for CTAs and key UI)
2. Secondary/Accent colors
3. Neutral/Gray scale (backgrounds, borders, muted text)
4. Semantic colors (success green, error red, warning amber, info blue)
5. Background colors (page, card, section backgrounds)
6. Text colors (headings, body, muted, links)

For each color, provide:
- Exact hex value (best estimate from the screenshot)
- Suggested semantic name
- Where it appears in the design
- Confidence: high (clear, solid color) / medium (gradient or subtle) / low (ambiguous)
```

**Pass 2 — Typography:**
```
Analyze the screenshots and extract ALL typography styles:

1. Font families (identify by visual characteristics)
   - Heading font
   - Body font
   - Monospace font (if any)
   - Note: may need user confirmation since fonts can't be identified
     with 100% accuracy from screenshots

2. Size scale (estimate px values from relative sizing)
   - Each distinct text size used
   - Map to semantic names (xs, sm, base, lg, xl, 2xl, etc.)

3. Font weights used
   - Normal (400), Medium (500), Semibold (600), Bold (700)

4. Line heights (estimate from text block spacing)

For each, provide confidence level.
```

**Pass 3 — Spacing:**
```
Analyze the screenshots for spacing patterns:

1. Component internal padding
2. Section padding (top/bottom, left/right)
3. Gap between repeated elements (cards, list items)
4. Margin between sections
5. Container max-width

Estimate px values. Map to Tailwind spacing scale where possible.
```

**Pass 4 — Effects & Advanced Styling:**
```
Extract ALL visual effects and advanced styling:

1. Border radius values (per component type: buttons, cards, inputs, avatars)
2. Box shadows (subtle, medium, large — note direction and spread)
3. Border styles (width, color, style: solid/dashed/dotted)
4. Opacity values (structural vs decorative)
5. Gradients:
   - Direction (top-to-bottom, left-to-right, diagonal)
   - Color stops with positions
   - Type (linear, radial)
6. Backdrop effects:
   - Blur radius estimates
   - Background opacity behind blur
7. Text effects:
   - Letter spacing (tight, normal, wide)
   - Text shadows (color, offset, blur)
8. Transitions/motion hints:
   - Elements that appear to have hover states
   - Progress indicators or animated elements

For each, provide confidence level and specific Tailwind mapping suggestion.
```

### Step 3: Confidence Scoring

Assign confidence to each extracted token:

```
High   — Clear, unambiguous value
         Examples: solid button color, large heading size, obvious border radius
         Action: Include in lockfile automatically

Medium — Likely correct but could be slightly off
         Examples: body text size (14px or 16px?), muted text color, subtle shadow
         Action: Include in lockfile, flag for user review

Low    — Best guess, needs confirmation
         Examples: font family identification, exact spacing values, gradient stops
         Action: Include tentative value, require user confirmation
```

### Step 4: Present Tokens for User Confirmation

Display extracted tokens grouped by category with confidence indicators:

```
## Extracted Design Tokens from Canva

### Colors (12 detected)

**Brand**
[High]   primary:           #2563EB (blue, used for CTAs and links)
[High]   primary-hover:     #1D4ED8 (darker blue, button hover state)
[High]   secondary:         #7C3AED (purple, accent elements)

**Neutral**
[High]   background:        #FFFFFF (page background)
[High]   surface:           #F9FAFB (card/section backgrounds)
[High]   border:            #E5E7EB (dividers and input borders)
[Medium] muted-text:        #6B7280 — could be #64748B, hard to tell

**Semantic**
[High]   destructive:       #DC2626 (error states)
[Low]    success:           #16A34A — I see green but it's small, confirm?

### Typography (2 families detected)

[Medium] heading-font:      "Inter" — looks like Inter or possibly Outfit. Which?
         Options: a) Inter  b) Outfit  c) Something else: ___
[High]   body-font:         "Inter" — consistent weight/metrics with Inter
[Low]    mono-font:         Not detected — do you use a monospace font?

**Size scale:**
[High]   h1:  48px (2xl-3xl range)
[High]   h2:  36px
[High]   h3:  24px
[High]   body: 16px
[Medium] small: 14px — or 13px?

### Spacing
[High]   section-padding:    64px (py-16)
[High]   card-padding:       24px (p-6)
[Medium] card-gap:           24px — or 32px?
[High]   container-max:      1280px (max-w-7xl)

### Effects
[High]   card-radius:        12px (rounded-xl)
[High]   button-radius:      8px (rounded-lg)
[Medium] card-shadow:        0 4px 6px -1px rgba(0,0,0,0.1) — subtle, confirm?
[High]   input-border:       1px solid #E5E7EB

---

Please confirm or correct the flagged values (Medium and Low confidence).
You can also add any tokens I missed.
```

Wait for user response. Update values based on their corrections.

### Step 5: Write Lockfile

After user confirmation, write `src/styles/design-tokens.lock.json` in the same format as `design-token-lock`:

```jsonc
{
  "version": "1.0.0",
  "generatedAt": "2026-03-18T12:00:00Z",
  "source": "canva",
  "canvaDesignId": "DAGxyz...",
  "inferenceConfidence": "high",

  "colors": {
    "primitives": {
      "blue-600": { "hex": "#2563eb", "rgb": "37, 99, 235", "tailwind": "blue-600" }
    },
    "semantic": {
      "primary": { "ref": "blue-600", "hex": "#2563eb", "tailwind": "primary" }
    },
    "component": {
      "card-bg": { "ref": null, "hex": "#f9fafb", "tailwind": "card" }
    }
  },

  "typography": {
    "families": {
      "sans": { "value": "Inter", "fallback": "system-ui, -apple-system, sans-serif" }
    },
    "scale": {
      "base": { "px": 16, "rem": "1rem", "tailwind": "text-base" }
    },
    "weights": { "normal": 400, "medium": 500, "semibold": 600, "bold": 700 },
    "lineHeights": { "tight": 1.25, "normal": 1.5, "relaxed": 1.75 }
  },

  "spacing": {
    "scale": {
      "4": { "px": 16 },
      "6": { "px": 24 },
      "8": { "px": 32 }
    },
    "custom": {}
  },

  "borderRadius": {
    "lg": { "px": 8 },
    "xl": { "px": 12 }
  },

  "shadows": {
    "md": { "value": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }
  },

  "textContent": {
    "hero-heading": "Build faster with AI",
    "cta-primary": "Get Started"
  }
}
```

### Step 6: Generate Framework Config and CSS Properties

The token-extraction above is framework-agnostic; only the config target changes. Resolve the build-spec's `renderer` manifest to pick the target:

```bash
node scripts/renderer-registry.js resolve <renderer> --json
```

Use `manifest.language` to choose the styling approach and `manifest.template` to locate where the framework's config lives and what shape it takes:

- **`react` / `vue` / `svelte`** — Tailwind CSS-variable approach. Generate or update the Tailwind config (e.g. `tailwind.config.ts`, alongside `manifest.template`) plus `src/styles/tokens.css`. All values reference `var(--color-*)` — no raw hex in config. (Astro reuses this React/Tailwind path: its language is `react`.)
- **`react-native`** — NativeWind. Generate the NativeWind/Tailwind config and a StyleSheet token module for the Expo template (`manifest.template`) instead of a web `tokens.css`.

Steps otherwise mirror `design-token-lock` Steps 4-5.

### Step 7: Validate Lockfile

After generation, verify:

1. **Completeness:** Every section of the design has corresponding tokens
2. **Consistency:** No duplicate values with different keys
3. **Tailwind mapping:** Every lockfile entry has a valid Tailwind class
4. **Cross-reference:** Spot-check 3-5 values against the Canva screenshots

Report any gaps to the user before proceeding.

## Output

| File | Purpose |
|------|---------|
| `src/styles/design-tokens.lock.json` | Versioned lockfile — identical format to Figma path |
| Framework config (`tailwind.config.ts` for react/vue/svelte/astro; NativeWind config for react-native) | Theme extended from lockfile, target chosen from `manifest.language` |
| `src/styles/tokens.css` (web) / StyleSheet token module (react-native) | CSS custom properties from lockfile, or RN token module |

## Accuracy Expectations

| Token Type | Expected Accuracy | Notes |
|-----------|-------------------|-------|
| Colors | 95%+ | Solid colors are easy; gradients less so |
| Font families | 70-85% | Visual similarity between fonts is common |
| Font sizes | 85-95% | Relative sizing is reliable; exact px may be off by 1-2px |
| Spacing | 80-90% | Depends on screenshot resolution and alignment |
| Border radius | 90%+ | Distinctive visual feature |
| Shadows | 75-85% | Subtle shadows are hard to quantify |

User confirmation compensates for lower accuracy areas.

## Error Handling

- **Screenshots too low resolution:** Re-export at higher scale (3x or 4x)
- **Font not identifiable:** Present top 3 candidates, ask user to confirm
- **Inconsistent colors across pages:** Flag and ask if intentional (theme/branding) or error
- **User provides brand guidelines:** Use as ground truth, skip inference for covered tokens

## Integration

- **Produces:** `design-tokens.lock.json`, `tailwind.config.ts`, `tokens.css`
- **Consumed by:** `tdd-from-figma` (test assertions), `canva-react-converter` (component generation), `verify-tokens.sh` (enforcement), `/build-from-screenshot` (screenshot pipeline)
- **Uses:** Canva MCP (export), Claude vision analysis, Read
