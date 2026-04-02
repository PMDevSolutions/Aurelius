# Svelte Converter Workflow Guide

The pipeline generates SvelteKit components from any design source (Figma, Canva, or screenshots/URLs). Svelte compiles to vanilla JavaScript with no virtual DOM, producing highly optimized imperative DOM updates at build time. This guide covers the Svelte-specific details of the conversion process. For general multi-framework pipeline information, see [docs/multi-framework/README.md](../multi-framework/README.md).

## When Svelte Is Selected

Svelte output is activated in one of two ways:

1. **Explicit selection** -- set `"outputTarget": "svelte"` in `build-spec.json` during the intake phase.
2. **Auto-detection** -- the pipeline detects `svelte.config.*` in the project root or `svelte` in the project's `package.json` dependencies and sets the target automatically.

The intake skills (`figma-intake`, `canva-intake`, `screenshot-intake`) ask the user to confirm or override the detected target during the interview.

## The `svelte-converter` Agent

The `svelte-converter` agent (defined in `.claude/agents/svelte-converter.md`) is dispatched during Phase 4 (Build) of the pipeline. It reads:

- **`build-spec.json`** -- component list, layout hierarchy, and page structure
- **`design-tokens.lock.json`** -- the single source of truth for all design values
- **Screenshots** -- used for layout decisions only; token values always come from the lockfile

The agent generates components in dependency order (leaf components first, then composites), runs `pnpm vitest run` after each batch, and tracks progress via TodoWrite. It operates autonomously with no user prompts during the build phase.

## Component Patterns Generated

### Svelte 5 (Preferred)

Every component is a `.svelte` file with a `<script lang="ts">` block followed by HTML-like markup:

```svelte
<script lang="ts">
  interface Props {
    title: string
    variant?: 'primary' | 'secondary'
    disabled?: boolean
    onclick?: (event: MouseEvent) => void
    children?: import('svelte').Snippet
  }

  let {
    title,
    variant = 'primary',
    disabled = false,
    onclick,
    children,
  }: Props = $props()

  let count = $state(0)
  let doubled = $derived(count * 2)
</script>

<div class="rounded-lg bg-surface p-4">
  <h2 class="text-lg font-semibold text-foreground">{title}</h2>
  {@render children?.()}
  <button {disabled} {onclick}>Clicked {count} times (doubled: {doubled})</button>
</div>
```

Key Svelte 5 runes:

- **`$props()`** -- typed props with a TypeScript interface and destructured defaults
- **`$state()`** -- reactive state (replaces `let` reactivity from Svelte 4)
- **`$derived()`** -- computed values that update when dependencies change
- **`$effect()`** -- side effects that re-run when dependencies change

### Svelte 4 Fallback

When a project uses Svelte 4, the agent falls back to legacy patterns:

- **`export let propName`** for props
- **`$:`** reactive declarations for computed values and side effects
- **`<slot />`** instead of `{@render children()}`

### SvelteKit Routes

Page-level components use SvelteKit file-based routing:

- **`+page.svelte`** -- page components in `src/routes/`
- **`+layout.svelte`** -- shared layouts wrapping child pages
- **`+page.server.ts`** -- server-side data loading via `load()` functions

## Styling

Tailwind utility classes are applied directly in component markup. Design tokens from `design-tokens.lock.json` are mapped to the Tailwind config so that classes like `bg-primary`, `text-foreground`, and `rounded-lg` resolve to the locked design values.

Conditional classes use template expressions:

```svelte
<button
  class="rounded-lg font-medium transition-colors {variant === 'primary'
    ? 'bg-primary text-white'
    : 'bg-secondary text-foreground'}"
>
```

Use `<style>` blocks (scoped by default in Svelte) only for component-specific overrides that cannot be expressed with utility classes.

## Testing

Svelte components are tested with **Vitest + @testing-library/svelte**. Test files use the `.test.ts` extension.

```typescript
import { render, screen } from '@testing-library/svelte';
import MyComponent from './MyComponent.svelte';

test('renders heading', () => {
  render(MyComponent, { props: { title: 'Hello' } });
  expect(screen.getByText('Hello')).toBeInTheDocument();
});

test('responds to click', async () => {
  render(MyComponent, { props: { title: 'Hello' } });
  const button = screen.getByRole('button');
  await button.click();
  expect(screen.getByText(/Clicked 1 times/)).toBeInTheDocument();
});
```

Key testing patterns:

- `render()` mounts a component with props
- `screen.getByText()`, `screen.getByRole()` locate elements by accessible queries
- `fireEvent` and direct `.click()` trigger user interactions
- Assertions use `@testing-library/jest-dom` matchers

## Template Files

The `templates/sveltekit/` directory provides starter configs for new SvelteKit projects:

| File | Purpose |
|------|---------|
| `svelte.config.js` | SvelteKit config with adapter and preprocessor settings |
| `vite.config.ts.tpl` | Vite config for SvelteKit |
| `tsconfig.json` | TypeScript config for Svelte + SvelteKit |
| `vitest.config.ts.tpl` | Vitest config with @testing-library/svelte |
| `package.json` | Dependencies for SvelteKit, Vite, Vitest, Tailwind |

## Built-In Transitions

Svelte provides transition directives out of the box, so no external animation library (like Framer Motion) is needed:

```svelte
<script lang="ts">
  import { fade, slide, fly } from 'svelte/transition';
</script>

{#if visible}
  <div transition:fade>Fades in and out</div>
  <div in:fly={{ y: 20 }} out:fade>Flies in, fades out</div>
  <div transition:slide>Slides open and closed</div>
{/if}
```

The converter uses these built-in transitions when the design spec includes animation or motion tokens.

## Differences from the React Pipeline

| Aspect | React | Svelte |
|--------|-------|--------|
| Runtime | Virtual DOM diffing | Compiled to imperative DOM updates |
| Component format | `.tsx` files with JSX | `.svelte` files with HTML-like markup |
| State | `useState` / `useEffect` | `$state()` / `$effect()` runes |
| Computed values | `useMemo` | `$derived()` rune |
| Reusable logic | Custom hooks (`useX()`) | Stores (`writable`, `derived`) or helper modules |
| Children | `children` prop | `{@render children()}` (Svelte 5) or `<slot />` (Svelte 4) |
| Conditionals | `{cond && <X />}` | `{#if cond}...{/if}` |
| Lists | `{items.map(...)}` | `{#each items as item}...{/each}` |
| Two-way binding | `value` + `onChange` handler | `bind:value` (no handler needed) |
| Animations | Framer Motion (external) | Built-in `transition:` directives |
| Class merging | `cn()` utility (clsx + tailwind-merge) | Template expressions (built-in) |
| Test library | @testing-library/react | @testing-library/svelte |
| Storybook | @storybook/react | @storybook/svelte |

## Related Documentation

- [Multi-Framework Output](../multi-framework/README.md) -- pipeline dispatch details and framework auto-detection
- [Design Tokens Guide](design-tokens.md) -- how tokens are extracted, locked, and enforced
- [Visual QA Guide](visual-qa.md) -- pixel-diff verification (shared across all targets)
- `templates/sveltekit/` -- starter configs for SvelteKit + Tailwind + Vitest
- `.claude/agents/svelte-converter.md` -- full agent definition
