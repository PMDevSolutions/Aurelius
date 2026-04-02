# Vue Converter Workflow Guide

The pipeline generates Vue 3 components from any design source (Figma, Canva, or screenshots/URLs). This guide covers the Vue-specific details of the conversion process. For general multi-framework pipeline information, see [docs/multi-framework/README.md](../multi-framework/README.md).

## When Vue Is Selected

Vue output is activated in one of two ways:

1. **Explicit selection** -- set `"outputTarget": "vue"` in `build-spec.json` during the intake phase.
2. **Auto-detection** -- the pipeline detects `vue` in the project's `package.json` dependencies and sets the target automatically. If `nuxt.config.*` is present, Nuxt 3 conventions are used instead of plain Vue + Vite.

The intake skills (`figma-intake`, `canva-intake`, `screenshot-intake`) ask the user to confirm or override the detected target during the interview.

## The `vue-converter` Agent

The `vue-converter` agent (defined in `.claude/agents/vue-converter.md`) is dispatched during Phase 4 (Build) of the pipeline. It reads:

- **`build-spec.json`** -- component list, layout hierarchy, and page structure
- **`design-tokens.lock.json`** -- the single source of truth for all design values
- **Screenshots** -- used for layout decisions only; token values always come from the lockfile

The agent generates components in dependency order (leaf components first, then composites), runs `pnpm vitest run` after each batch, and tracks progress via TodoWrite. It operates autonomously with no user prompts during the build phase.

## Component Patterns Generated

### Single-File Components

Every component is a `.vue` file with three blocks:

```vue
<script setup lang="ts">
interface Props {
  title: string
  variant?: 'primary' | 'secondary'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <div class="rounded-lg bg-surface p-4">
    <h2 class="text-lg font-semibold text-foreground">{{ title }}</h2>
    <slot />
    <button @click="emit('click', $event)">Action</button>
  </div>
</template>

<style scoped>
/* Component-specific overrides only; Tailwind handles the rest */
</style>
```

### Key patterns

- **Props** -- defined with `defineProps<T>()` and a TypeScript interface. Defaults via `withDefaults()`.
- **Events** -- typed with `defineEmits<{...}>()`. Templates use `@click`, `@input`, etc.
- **Slots** -- `<slot />` for default content projection (equivalent to React `children`). Named slots (`<slot name="header" />`) for multiple insertion points.
- **Composables** -- reusable logic extracted into `use*.ts` files (equivalent to React custom hooks). Return reactive state via `ref()` and `reactive()`.

## Styling

Tailwind utility classes are applied directly in `<template>` markup. Design tokens from `design-tokens.lock.json` are mapped to the Tailwind config so that classes like `bg-primary`, `text-foreground`, and `rounded-lg` resolve to the locked design values.

Unlike the React pipeline, there is no `cn()` utility (clsx + tailwind-merge). Conditional classes use Vue's built-in `:class` binding:

```vue
<button :class="[
  'rounded-lg font-medium transition-colors',
  variant === 'primary' ? 'bg-primary text-white' : 'bg-secondary text-foreground'
]">
```

Use `<style scoped>` only for component-specific overrides that cannot be expressed with utility classes.

## Testing

Vue components are tested with **Vitest + @vue/test-utils**. Test files use the `.test.ts` extension (not `.test.tsx` since there is no JSX).

```typescript
import { mount } from '@vue/test-utils';
import MyComponent from './MyComponent.vue';

test('renders with props', () => {
  const wrapper = mount(MyComponent, { props: { title: 'Hello' } });
  expect(wrapper.text()).toContain('Hello');
});

test('emits click event', async () => {
  const wrapper = mount(MyComponent, { props: { title: 'Hello' } });
  await wrapper.find('button').trigger('click');
  expect(wrapper.emitted('click')).toHaveLength(1);
});
```

Key testing patterns:

- `mount()` renders a component with props, slots, and plugins
- `wrapper.find()` and `wrapper.findAll()` locate elements by CSS selector
- `wrapper.emitted()` asserts which events a component fired
- `wrapper.text()` and `wrapper.html()` inspect rendered output

## Template Files

The `templates/vue/` directory provides starter configs for new Vue projects:

| File | Purpose |
|------|---------|
| `vite.config.ts.tpl` | Vite config with `@vitejs/plugin-vue` |
| `tsconfig.json` | TypeScript config for Vue 3 + Vite |
| `vitest.config.ts.tpl` | Vitest config with @vue/test-utils |
| `tailwind.config.ts` | Tailwind CSS config with design token structure |
| `package.json` | Dependencies for Vue 3, Vite, Vitest, Tailwind |

## Differences from the React Pipeline

| Aspect | React | Vue 3 |
|--------|-------|-------|
| Component format | `.tsx` files with JSX | `.vue` single-file components with `<template>` |
| State | `useState`, `useEffect` | `ref()`, `reactive()`, `watch()`, `onMounted()` |
| Reusable logic | Custom hooks (`useX()`) | Composables (`useX()`) |
| Children | `children` prop | `<slot />` |
| Class merging | `cn()` utility (clsx + tailwind-merge) | `:class` binding (built-in) |
| Events | `onClick`, `onChange` | `@click`, `@change` |
| Conditionals | `{cond && <X />}` | `v-if` / `v-show` |
| Lists | `{items.map(...)}` | `v-for` |
| Ref forwarding | `forwardRef` | `defineExpose()` |
| Test extension | `.test.tsx` | `.test.ts` |
| Test library | @testing-library/react | @vue/test-utils |

Storybook is supported for Vue but requires the `@storybook/vue3` package instead of `@storybook/react`.

## Related Documentation

- [Multi-Framework Output](../multi-framework/README.md) -- pipeline dispatch details and framework auto-detection
- [Design Tokens Guide](design-tokens.md) -- how tokens are extracted, locked, and enforced
- [Visual QA Guide](visual-qa.md) -- pixel-diff verification (shared across all targets)
- `templates/vue/` -- starter configs for Vue 3 + Vite + Tailwind + Vitest
- `.claude/agents/vue-converter.md` -- full agent definition
