# Design Token System

Design tokens are the single source of truth for colors, spacing, typography, and other visual properties extracted from Figma, Canva, or screenshot sources. Aurelius uses a lockfile-based system to ensure every component references the same values and to catch drift before it ships.

## Token Structure

All tokens live in `design-tokens.lock.json`. The top-level keys map directly to Tailwind config sections:

```json
{
  "colors": {
    "primary": "#3B82F6",
    "secondary": "#10B981",
    "background": "#FFFFFF",
    "foreground": "#111827"
  },
  "spacing": {
    "sm": "0.5rem",
    "md": "1rem",
    "lg": "1.5rem",
    "xl": "2rem"
  },
  "typography": {
    "heading": { "fontFamily": "Inter", "fontWeight": 700 },
    "body": { "fontFamily": "Inter", "fontWeight": 400 }
  },
  "borderRadius": {
    "sm": "0.25rem",
    "md": "0.5rem",
    "lg": "1rem"
  },
  "shadows": {
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 6px rgba(0,0,0,0.1)"
  },
  "textContent": {
    "heroHeading": "Build faster with Aurelius",
    "ctaButton": "Get Started"
  },
  "metadata": {
    "source": "figma",
    "fileKey": "abc123",
    "exportedAt": "2026-04-01T12:00:00Z"
  }
}
```

The lockfile also supports a nested `designTokens` wrapper (e.g., `lock.designTokens.colors`). Both scripts handle either format automatically.

## Lockfile Locations

The scripts search for the lockfile in this order:

1. `src/styles/design-tokens.lock.json`
2. `design-tokens.lock.json` (project root)

First found wins. If neither exists, token drift checks are skipped and `sync-tokens.sh` exits with code 2.

## How Tokens Flow

```
Design Source (Figma / Canva / Screenshot)
        │
        ▼
  Phase 2 — Token Lock
  Extracts tokens → design-tokens.lock.json
        │
        ├──────────────────────┐
        ▼                      ▼
  tailwind.config.ts        tokens.css
  theme.extend.colors       --primary: #3B82F6;
  theme.extend.spacing      --spacing-sm: 0.5rem;
        │                      │
        ▼                      ▼
  Components use            Components use
  Tailwind classes          CSS custom properties
  (bg-primary, p-md)       (var(--primary))
```

Phase 2 of any pipeline (`/build-from-figma`, `/build-from-canva`, `/build-from-screenshot`) creates or updates the lockfile. From there, values are mapped into `tailwind.config.ts` (`theme.extend.colors`, `theme.extend.spacing`, etc.) and into CSS custom properties in `tokens.css`. Components then consume tokens through Tailwind utility classes or CSS variables — never through hardcoded values.

## Token Validation (`verify-tokens.sh`)

Run the validation script to catch hardcoded values that bypass the token system:

```bash
./scripts/verify-tokens.sh
```

The script performs five checks against your `src/` directory:

| Check | What It Catches | Pattern |
|-------|----------------|---------|
| 1. Hardcoded hex colors in TSX | `color="#3B82F6"` in components | `#[0-9a-fA-F]{3,8}` in `*.tsx` |
| 2. Arbitrary Tailwind values | `w-[200px]`, `p-[24px]` | `(w\|h\|p\|m\|gap\|...)-\[[0-9]+px\]` in `*.tsx` |
| 3. Inline style attributes | `style={{ color: 'red' }}` | `style=\{\{` in `*.tsx` |
| 4. Text content drift | Lockfile text missing from source | Compares `textContent` entries against `*.tsx` |
| 5. Hardcoded colors in CSS | `color: #3B82F6;` outside token files | `#[0-9a-fA-F]{3,8}` in `*.css` (excludes `tokens.css` and `globals.css`) |

**Exit codes:** 0 = all checks pass, 1 = violations found.

Example output:

```
=== Token Verification ===

▸ Checking for hardcoded hex colors in .tsx files...
  ✗ Hardcoded hex colors found:
    src/components/Hero.tsx:12:  <div className="bg-[#3B82F6]">

▸ Checking for arbitrary Tailwind values (w-[...], h-[...], p-[...], etc.)...
  ✓ No arbitrary pixel values

▸ Checking for inline style={{}} attributes...
  ✓ No inline styles

▸ Checking text content against lockfile (src/styles/design-tokens.lock.json)...
  ✓ All lockfile text content found in source

▸ Checking for hardcoded colors in CSS files (outside tokens)...
  ✓ No hardcoded hex colors in CSS

=== Summary ===
✗ 1 violation(s) found
  Fix violations or add '// token-ok' comment to intentional exceptions
```

## Token Drift Detection (`sync-tokens.sh`)

While `verify-tokens.sh` checks components for hardcoded values, `sync-tokens.sh` checks whether the lockfile and your config files agree. Run it when you suspect tokens have drifted after a lockfile update:

```bash
# Report-only mode (default)
./scripts/sync-tokens.sh

# Sync source files to match lockfile
./scripts/sync-tokens.sh --update

# Machine-readable output
./scripts/sync-tokens.sh --json
```

The script performs three checks:

1. **Color tokens** — Every color in the lockfile must appear in `tailwind.config.ts`/`tailwind.config.js`.
2. **Spacing tokens** — Every spacing value in the lockfile must appear in the Tailwind config.
3. **CSS custom properties** — Every token category (`colors`, `spacing`, `typography`, `borderRadius`, `shadows`, `fontSizes`) is compared against `tokens.css`. Catches both value mismatches and missing properties.

Tokens CSS is searched at `src/styles/tokens.css`, `src/tokens.css`, and `styles/tokens.css` (first found wins).

**Exit codes:** 0 = no drift, 1 = drift detected, 2 = no lockfile found.

**Drift classification:**

| Drift Items | Status |
|-------------|--------|
| 0 | `no-drift` |
| 1-3 | `minor-drift` |
| 4+ | `major-drift` |

In `--update` mode, the script rewrites CSS custom property values in `tokens.css` to match the lockfile. Tailwind config updates are flagged for manual review.

## Pipeline Integration

Tokens are checked and enforced at three points in the pipeline:

- **Phase 0 (Token Sync)** — If a lockfile already exists, `sync-tokens.sh` runs automatically to detect drift before the build begins.
- **Phase 2 (Token Lock)** — The `design-token-lock` skill extracts tokens from the design source and writes `design-tokens.lock.json`.
- **Pre-commit hook** — `verify-tokens.sh` runs automatically on every `git commit`. If violations are found, the commit is blocked with a warning.

This means tokens are validated on entry (Phase 0), created/updated mid-pipeline (Phase 2), and enforced on exit (pre-commit).

## The `// token-ok` Escape Hatch

Add `// token-ok` to any line to suppress `verify-tokens.sh` warnings for that line:

```tsx
// Third-party brand color — intentionally hardcoded
<Icon color="#1DA1F2" /> // token-ok

// Tailwind arbitrary value needed for external embed
<div className="w-[640px] h-[360px]"> // token-ok
```

Use this sparingly. Valid use cases include third-party brand colors, embedded widget dimensions, and SVG path data. If you find yourself adding `// token-ok` to many lines, the lockfile is probably missing tokens — update it instead.

## Troubleshooting

**"No design-tokens.lock.json found"**
The lockfile does not exist yet. Either run the pipeline (Phase 2 creates it) or create one manually following the structure above. Place it at `src/styles/design-tokens.lock.json` or in the project root.

**"Token drift detected" / exit code 1 from sync-tokens.sh**
The lockfile and your config files disagree. Run `./scripts/sync-tokens.sh --update` to sync CSS custom properties automatically, then manually review your Tailwind config for any remaining mismatches.

**"Hardcoded hex color at src/components/Foo.tsx:42"**
Replace the hardcoded value with a Tailwind token class (e.g., `bg-primary` instead of `bg-[#3B82F6]`) or a CSS variable (`var(--primary)`). If the value is intentionally hardcoded, add `// token-ok` to the line.

**"Arbitrary pixel values found"**
Replace arbitrary Tailwind values like `w-[200px]` with token-based classes like `w-48`. If the lockfile defines custom spacing (e.g., `"sidebar": "200px"`), map it in `tailwind.config.ts` under `theme.extend.spacing` and use `w-sidebar`.

**"Missing text from lockfile"**
A `textContent` entry in the lockfile does not appear anywhere in your `src/**/*.tsx` files. Either the text was changed in the component (update the lockfile) or a component was removed (remove the entry from `textContent`).
