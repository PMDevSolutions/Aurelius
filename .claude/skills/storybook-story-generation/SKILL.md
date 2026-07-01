---
name: storybook-story-generation
description: Use after React components are built (Phase 4.5 of the Figma/Canva/screenshot pipeline) or whenever a project needs Storybook coverage — auto-generates .stories.tsx and .mdx docs from components via ts-morph AST parsing, with prop controls, variant stories, action args, and default args. Keywords: Storybook, generate stories, .stories.tsx, MDX docs, argTypes, controls, autodocs, CSF3, variant stories, action args, component documentation, story generation, ts-morph
---

# Storybook Story Generation — AST-Based Stories + MDX Docs

## Purpose

Auto-generate Storybook 8 (CSF3) stories and MDX documentation from built React
components. The generator parses each component's TypeScript source with a
`ts-morph` AST — not regex — so it can reliably extract prop types, string-literal
unions, default values, callback props, and JSDoc comments, then emit:

- **`Component.stories.tsx`** — `Meta` with `tags: ['autodocs']`, prop-aware
  `argTypes`/controls, a `Default` story seeded with destructured defaults, one
  variant story per union value, `True`/`False` stories for booleans, action args
  for callbacks, and optional responsive-viewport stories.
- **`Component.mdx`** — an autodocs page with `Meta`, `Canvas`, `Controls`, and
  `ArgTypes` blocks, plus the component's JSDoc description and a `Canvas` per
  variant.

The skill wraps `scripts/generate-stories.sh` (a thin wrapper over
`scripts/generate-stories.js`). It is a **non-blocking** step: a failure never
fails the build.

## When to Use

- **Phase 4.5** of `/build-from-figma`, `/build-from-canva`, and
  `/build-from-screenshot` — immediately after components are built and unit tests
  pass, before/alongside visual QA (runs in parallel, non-blocking).
- Backfilling Storybook coverage for an existing component library.
- When the user asks to "generate Storybook stories", "add stories for these
  components", "create autodocs", or "document components in Storybook".

**Trigger phrases:**
- "Generate Storybook stories"
- "Auto-generate stories for my components"
- "Add MDX docs to Storybook"
- "Create stories with controls and variants"

**Do NOT use for:** hand-authored interaction/`play()` tests (those belong to the
`react-testing-workflows` skill), or non-React output targets.

## Inputs

- **Required:** Built components under `src/components/**/*.tsx` (override with
  `--src-dir`). Components must be **exported** and named with an uppercase first
  letter (function, arrow-const, or default export).
- **Recommended:** A props `interface ComponentNameProps` — the generator keys off
  this naming convention to build controls and variants.
- **Optional:** `.claude/pipeline.config.json` → `storybook` (thresholds and
  toggles; see [Configuration](#configuration)).
- **Optional:** `tsconfig.json` — used by `ts-morph` when present; otherwise a
  sensible in-memory compiler config is used.

## Process

### Step 1: Read configuration

Load `.claude/pipeline.config.json` → `storybook` (falls back to defaults if the
file is missing or `autoGenerate` is unset). Relevant keys: `skipPatterns`,
`generateMdx`, `maxVariantsPerProp`, `includeResponsiveViewports`, `viewports`
(widths resolved from `visualDiff.breakpoints`).

### Step 2: Scan for components

Recursively walk `src/components`, collecting `.tsx` files while excluding
`*.test.tsx`, `*.stories.tsx`, `*.d.ts`, `index.tsx`, and the `node_modules`,
`__tests__`, and `__mocks__` directories. Files matching a `skipPatterns` glob are
skipped. Components that already have a `.stories.tsx` sibling are skipped unless
`--force` is passed.

### Step 3: Extract prop metadata (AST)

For each component the generator:
1. Finds the first exported uppercase component (function decl, exported
   `const`, or default export).
2. Locates its `ComponentNameProps` interface.
3. For each prop, records: name, optionality, control type, union options,
   JSDoc description, and whether it is a callback.
4. Reads default values from the parameter destructuring pattern
   (`({ size = 'md' })` → `size: 'md'`).

**Control mapping:**

| Prop type | Control | Notes |
|-----------|---------|-------|
| `string` | `text` | |
| `number` | `number` | |
| `boolean` | `boolean` | also emits `True`/`False` variant stories |
| `'a' \| 'b' \| 'c'` (string-literal union) | `select` | `options` populated; one variant story per value |
| `on*` function (e.g. `onClick`) | action arg | `{ action: 'clicked' }` (past-tense of the event) |
| other / complex | `text` | falls back to `text`; adjust manually if needed |

### Step 4: Generate `.stories.tsx`

Emit CSF3 with `title: 'Components/<path-relative-to-src>'`, `tags: ['autodocs']`,
`argTypes`, a `Default` story (seeded with destructured defaults), variant stories
(capped at `maxVariantsPerProp` per prop), and viewport stories when
`includeResponsiveViewports` is enabled.

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/ui/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['info', 'success', 'warning', 'error'] },
    onDismiss: { action: 'dismissed' },
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = { args: { variant: 'info' } };
export const Info: Story = { args: { variant: 'info' } };
export const Success: Story = { args: { variant: 'success' } };
// …one per union value
```

### Step 5: Generate `.mdx` (unless `--no-mdx` or `generateMdx: false`)

Emit an autodocs page importing `@storybook/blocks`, referencing the sibling
`.stories`, and embedding the component's JSDoc description, the `Default`
`Canvas`, `Controls`, a `Canvas` per variant, and the full `ArgTypes` table.

```mdx
import { Meta, Canvas, Controls, ArgTypes } from '@storybook/blocks';
import * as Stories from './Badge.stories';

<Meta of={Stories} />

# Badge

A status badge with semantic color variants.

<Canvas of={Stories.Default} />
<Controls of={Stories.Default} />
<Canvas of={Stories.Info} />
<ArgTypes of={Stories} />
```

### Step 6: Run and report

```bash
./scripts/generate-stories.sh            # generate stories + MDX for all components
./scripts/generate-stories.sh --dry-run  # report what would be written, write nothing
./scripts/generate-stories.sh --force    # overwrite existing stories
./scripts/generate-stories.sh --no-mdx   # stories only, skip MDX
./scripts/generate-stories.sh --json     # machine-readable { generated, skipped, files }
```

Because this step is **non-blocking**, log the generated/skipped counts and
continue the pipeline even if generation fails.

## CLI Reference

| Flag | Default | Effect |
|------|---------|--------|
| `--src-dir <path>` | `src/components` | Component source directory to scan |
| `--config <path>` | `.claude/pipeline.config.json` | Pipeline config path |
| `--force` | off | Overwrite existing `.stories.tsx` files |
| `--dry-run` | off | Report only; write nothing |
| `--no-mdx` | off | Skip `.mdx` generation |
| `--json` | off | Emit JSON (suppresses human logs) |

## Configuration

`.claude/pipeline.config.json` → `storybook`:

| Key | Default | Purpose |
|-----|---------|---------|
| `autoGenerate` | `true` | Enable/disable generation in the pipeline |
| `includeResponsiveViewports` | `true` | Add a viewport story per breakpoint |
| `viewports` | `["mobile","tablet","desktop"]` | Which breakpoints to emit (widths from `visualDiff.breakpoints`) |
| `skipPatterns` | `["**/index.ts","**/*.test.*","**/*.stories.*"]` | Globs to exclude |
| `generateMdx` | `true` | Emit `.mdx` docs alongside stories |
| `maxVariantsPerProp` | `10` | Cap variant stories per prop (prevents explosion) |

## Output

| File | Purpose |
|------|---------|
| `src/components/**/Component.stories.tsx` | CSF3 stories with controls, variants, actions |
| `src/components/**/Component.mdx` | Autodocs page (Meta/Canvas/Controls/ArgTypes) |

## Common Mistakes

- **No controls generated.** Props are declared as a `type` alias rather than an
  `interface ComponentNameProps`. The generator detects the type but does not yet
  expand its members — convert to an `interface` (or add controls manually).
- **Component skipped.** The export is lowercase, not exported, or the file is a
  `*.test.tsx`/`index.tsx`. Ensure the component is exported with an uppercase name.
- **Stories not overwritten.** Existing `.stories.tsx` are preserved by design; pass
  `--force` to regenerate.
- **`children`/complex props show a text control.** Non-primitive props fall back to
  a `text` control — refine `argTypes` by hand where richer controls matter.
- **Action name looks odd.** Action args derive a past-tense label from the event
  name (`onClick` → `clicked`, `onChange` → `changed`); rename the arg in the story
  if a different label reads better.

## Integration

- **figma-to-react-workflow skill** — invokes this skill as Phase 4.5, right after
  components are built and unit tests pass (non-blocking, in parallel with visual QA).
- **react-testing-workflows skill** — owns hand-authored `play()`/interaction tests;
  this skill produces the base stories those can extend.
- **parallel-orchestration skill** — runs the `storybook` phase (depends on
  `component-build`, `blocking: false`) alongside `visual-diff` and `dark-mode`.
- **scripts/generate-stories.sh** — bash wrapper; forwards all flags to the Node
  generator.
- **scripts/generate-stories.js** — the `ts-morph` AST generator that does the work.
- **.claude/pipeline.config.json → storybook** — thresholds and toggles.

---

**Skill Version:** 1.0.0
**Last Updated:** 2026-07-01
