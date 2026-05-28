# Multi-Framework Output

The pipeline supports generating code for multiple frontend frameworks from any design source (Figma, Canva, or screenshots/URLs).

## The `renderer` and `outputTarget` Fields

The `renderer` field in `build-spec.json` is the **authoritative** field controlling which framework the pipeline generates code for. Its valid values are the renderer names from the renderer registry (`node scripts/renderer-registry.js list --json`) — currently `nextjs`, `vite`, `astro`, `sveltekit`, `expo`.

```json
{
  "source": "figma",
  "appType": "web-app",
  "renderer": "vite",
  "outputTarget": "react",
  "components": [...]
}
```

The `outputTarget` field is **retained** and **equals the resolved `renderer`'s `language`**. Each renderer manifest declares a `language`; resolving a renderer yields the matching `outputTarget`:

| Renderer | `language` (= `outputTarget`) |
|----------|------------------------------|
| `nextjs` | `react` |
| `vite` | `react` |
| `astro` | `react` |
| `sveltekit` | `svelte` |
| `expo` | `react-native` |

Valid `outputTarget` values: `"react"` (default), `"vue"`, `"svelte"`, `"react-native"`.

> **`framework.type` is deprecated.** It has been folded into `renderer`. Older specs may still carry `framework.type`; it is kept for back-compat only and `renderer` wins on any conflict.

### Back-compat: resolving `outputTarget` without `renderer`

A build-spec carrying only `outputTarget` (no `renderer`) resolves to that language's **default renderer**:

| `outputTarget` | Default renderer |
|----------------|------------------|
| `react` | `vite` |
| `svelte` | `sveltekit` |
| `react-native` | `expo` |
| `vue` | _(no renderer yet — future/unsupported)_ |

## Framework Auto-Detection

If `renderer` is not explicitly set during intake, the pipeline detects the framework from the project context via the renderer registry:

```bash
node scripts/renderer-registry.js detect . --json
# → { "renderer": "<name>", "language": "<lang>" }  or  { "renderer": null }
```

When a renderer is detected, both `renderer` (the detected name) and `outputTarget` (the resolved `language`) are written to the build-spec. The registry owns all detection logic — the intake skills no longer hand-sniff config files or `package.json` dependencies. When detection returns `null` (greenfield), the intake skills present the registry's renderer list to the user; the greenfield React default is `vite`.

The intake skills (`figma-intake`, `canva-intake`, `screenshot-intake`) also ask the user to confirm or override the detected renderer during the interview phase.

## Output Targets

### React (default)

- **Converter agents:** `figma-react-converter`, `canva-react-converter`
- **Styling:** Tailwind CSS with `cn()` utility (clsx + tailwind-merge)
- **Test library:** Vitest + @testing-library/react
- **Templates:** `templates/nextjs/` (Next.js App Router) or `templates/vite/` (Vite + React)
- **Component pattern:** Functional components with TypeScript, props interfaces, `children`/`className` passthrough

### Astro (hybrid islands)

- **Converter agent:** `astro-converter`
- **Renderer:** `astro` (`language`/`outputTarget` = `react`)
- **Styling:** Tailwind CSS via `@astrojs/tailwind`
- **Test library:** Vitest + @testing-library/react (islands) + Astro Container API (`.astro` statics)
- **Template:** `templates/astro/` (`@astrojs/react` islands + `@astrojs/tailwind`)
- **Component pattern:** Hybrid — zero-JS static `.astro` files for presentational components, React islands (`.tsx`) for interactive ones, composed under file-based `src/pages/*.astro` routes.

The `astro-converter` agent classifies every component from `build-spec.json`:
- A component with an `action`, an interactive `category`, or any
  `businessLogic` involvement → a **React island** (`.tsx`), referenced from the
  page with a `client:*` directive (`client:load` above the fold,
  `client:visible` below).
- Otherwise → a **static `.astro`** component (zero JS), props typed via the
  frontmatter `interface Props`.

Islands are tested with Vitest + @testing-library/react (the React path);
static `.astro` components are tested with the Astro Container API
(`experimental_AstroContainer` from `astro/container`).

### Vue 3

- **Converter agent:** `vue-converter`
- **Styling:** Tailwind CSS with utility classes in `<template>` blocks
- **Test library:** Vitest + @vue/test-utils
- **Template:** `templates/vue/` (Vue 3 + Vite + Tailwind + Vitest)
- **Component pattern:** `<script setup lang="ts">` with Composition API, `defineProps`/`defineEmits`, TypeScript interfaces

The `vue-converter` agent generates:
- Single-file components (`.vue`) with `<script setup>`, `<template>`, and `<style>` blocks
- Composables for reusable logic (equivalent to React custom hooks)
- Props defined with `defineProps<T>()` for full type safety
- Tailwind utility classes applied directly in templates

### Svelte / SvelteKit

- **Converter agent:** `svelte-converter`
- **Styling:** Tailwind CSS with utility classes in markup
- **Test library:** Vitest + @testing-library/svelte
- **Template:** `templates/sveltekit/` (SvelteKit + Tailwind + Vitest)
- **Component pattern:** `.svelte` files with `<script lang="ts">`, exported props via `export let` (Svelte 4) or `$props()` rune (Svelte 5)

The `svelte-converter` agent generates:
- Svelte components (`.svelte`) with TypeScript script blocks
- SvelteKit routes for page-level components (`+page.svelte`, `+layout.svelte`)
- Stores for shared state (writable, derived)
- Tailwind utility classes applied directly in markup

### React Native / Expo

- **Converter agent:** `react-native-converter`
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **Test library:** Jest + @testing-library/react-native
- **Template:** `templates/expo/` (Expo + NativeWind + Jest)
- **Component pattern:** Functional components with TypeScript, `View`/`Text`/`Pressable` primitives

The `react-native-converter` agent generates:
- React Native components using Expo-compatible APIs
- NativeWind `className` prop for Tailwind-style styling
- Platform-specific variants where needed (`Platform.OS` checks)
- Navigation structure with Expo Router
- Adapted layouts: web grid/flex patterns mapped to React Native `View` + `ScrollView`

**Key differences from web React:**
- No HTML elements -- uses `View`, `Text`, `Image`, `Pressable`, `ScrollView`
- No CSS media queries -- uses `useWindowDimensions` or NativeWind responsive classes
- No `onClick` -- uses `onPress`
- Shadows use platform-specific APIs (`shadowColor`/`elevation`)

## Pipeline Phase Dispatch

Most pipeline phases are shared across all output targets. Only Phase 4 (Build) dispatches to a framework-specific converter agent:

| Phase | Shared? | Notes |
|-------|---------|-------|
| [0] Token Sync | Shared | Design tokens are framework-agnostic |
| [1] Intake | Shared | Produces `outputTarget` in build-spec.json |
| [2] Token Lock/Infer | Shared | Tokens map to Tailwind config (or NativeWind for React Native) |
| [3] TDD (Gate) | Target-specific | Test file format and library vary by target |
| [4] Build | **Target-specific** | Dispatches to `vue-converter`, `svelte-converter`, `react-native-converter`, or React converter |
| [4.5] Storybook | React/Vue only | Svelte uses SvelteKit stories; React Native skips |
| [5] Visual Diff | Shared | Compares screenshots regardless of framework |
| [5.5] Dark Mode | Shared | Theme token verification |
| [6] E2E Tests | Shared | Playwright for web; Detox/Maestro for React Native |
| [7] Cross-Browser | Web only | React Native skips (tested on simulators instead) |
| [8] Quality Gate | Shared | Coverage, types, build, tokens, Lighthouse (web only) |
| [8.5] Responsive | Shared | Screenshots at breakpoints (web); device sizes (React Native) |
| [9] Report | Shared | Final build report |

## Phase 3: TDD by Target

The `tdd-from-figma` skill generates framework-appropriate test files:

| Target | Test Runner | Test Library | Test File Extension |
|--------|------------|-------------|-------------------|
| React | Vitest | @testing-library/react | `.test.tsx` |
| Vue | Vitest | @vue/test-utils | `.test.ts` |
| Svelte | Vitest | @testing-library/svelte | `.test.ts` |
| React Native | Jest | @testing-library/react-native | `.test.tsx` |

## Phase 4: Agent Dispatch Table

| outputTarget | Source: Figma | Source: Canva | Source: Screenshot |
|-------------|--------------|--------------|-------------------|
| `react` | figma-react-converter | canva-react-converter | figma-react-converter |
| `vue` | vue-converter | vue-converter | vue-converter |
| `svelte` | svelte-converter | svelte-converter | svelte-converter |
| `react-native` | react-native-converter | react-native-converter | react-native-converter |

For Figma and screenshot sources with non-React targets, the converter agent reads the design tokens and build-spec, then generates framework-specific components directly (no intermediate React step).

## Related Documentation

- [`renderers.md`](./renderers.md) -- The renderer model (three-axis: outputTarget/renderer/appType), manifest field reference, registry CLI + validator, and how to add a renderer
- `docs/figma-to-react/README.md` -- Figma conversion pipeline
- `docs/canva-to-react/README.md` -- Canva conversion pipeline
- `docs/screenshot-to-app/README.md` -- Screenshot/URL conversion pipeline
- `templates/README.md` -- Starter configs for all supported frameworks
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
