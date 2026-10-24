---
paths:
  - "src/**"
  - "app/**"
  - "templates/**"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---

# App code standards

These apply to the apps Aurelius builds: `src/` or `app/` at the project root, apps scaffolded beside the framework (`./scripts/setup-project.sh my-app`), and the starters in `templates/`. React is the default target; Vue, Svelte and React Native follow the same rules in their own idiom.

## TypeScript
- Strict mode. No `any`: use interfaces, generics and `unknown` with narrowing.
- Export each component's props interface beside it; use discriminated unions for props with exclusive variants.

## Components
- Functional components only, with a props interface for every component and `children`/`className` passthrough where it makes sense.
- Reusable logic goes in custom hooks; prefer composition over inheritance.

## Styling
- Utility-first Tailwind. Every color, size, space, radius and string of design copy comes from the token lockfile (`src/styles/design-tokens.lock.json`) through the Tailwind config or CSS variables. No hex or rgb literals, no arbitrary `w-[13px]` values, no inline `style={{}}`; a deliberate exception carries `// token-ok`. The token guard denies a commit that adds one, and `./scripts/verify-tokens.sh` reports them.
- Mobile-first breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`); `cn()` (clsx + tailwind-merge) for conditional classes.

## Tests
- Tests come before the component, and they are the specification: when a test fails, change the component, never the test.
- Vitest for pure functions, hooks and utilities; React Testing Library for interactions, rendering and accessibility; Storybook for states and responsive variants; Playwright for critical flows and cross-browser checks.
- Every component has a test file (`./scripts/verify-test-coverage.sh`); coverage meets `pipeline.config.json → tdd.coverageThreshold` (80%).

## Accessibility
- WCAG 2.1 AA at minimum: semantic landmarks and heading order, ARIA on interactive elements, full keyboard support, 4.5:1 text contrast.

## Code quality
- ESLint (React, TypeScript, jsx-a11y) and Prettier; 2-space indentation; pnpm for every package command.
