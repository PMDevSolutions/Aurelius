# React Development Standards

Development standards, tooling, and conventions used in this framework.

## TypeScript

All React code is written in TypeScript with strict mode enabled.

**Conventions:**
- Use `interface` for component props, `type` for unions and utility types
- Export prop interfaces alongside components
- No `any` -- use `unknown` and narrow with type guards
- Prefer `const` assertions and discriminated unions over enums

```ts
interface ButtonProps {
  variant: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  onClick?: () => void;
}
```

**Type checking:**
```bash
./scripts/check-types.sh       # Or: pnpm tsc --noEmit
```

## Tailwind CSS

Tailwind is the primary styling approach. No CSS modules or styled-components.

**Conventions:**
- Use design token classes from `tailwind.config.ts` (not arbitrary values)
- Group classes logically: layout, spacing, typography, color, state
- Extract repeated patterns into components, not CSS classes
- Use `cn()` (clsx + tailwind-merge) for conditional classes

```tsx
import { cn } from "@/lib/utils";

<button
  className={cn(
    "px-4 py-2 rounded-lg font-medium transition-colors",
    variant === "primary" && "bg-brand-primary text-white hover:bg-brand-primary-hover",
    variant === "ghost" && "bg-transparent text-content-primary hover:bg-surface-hover"
  )}
>
```

### Design Token Enforcement

All colors, font sizes, and spacing values must come from the Tailwind config (which is generated from the Figma lockfile). No hardcoded hex values, pixel sizes, or arbitrary Tailwind values in components.

Enforced by: `./scripts/verify-tokens.sh`

## Component Patterns

**File structure:**
```
src/components/
├── Button/
│   ├── Button.tsx           # Component implementation
│   ├── Button.test.tsx      # Tests (Vitest + RTL)
│   ├── Button.stories.tsx   # Storybook stories
│   └── index.ts             # Re-export
```

**Component guidelines:**
- One component per file
- Named exports (no default exports)
- Props interface defined and exported
- Forward refs for DOM-wrapping components
- Composition over configuration (prefer children/slots over prop-driven rendering)

## Testing Strategy

### TDD Workflow (Mandatory for Pipeline)

When using the `/build-from-figma` pipeline, TDD is enforced:

1. **RED** -- Tests are written first from the Figma design (Phase 3)
2. **GREEN** -- Components are built to pass the tests (Phase 4)
3. **REFACTOR** -- Components are refined during visual QA (Phase 5)

Tests must exist before components. Enforced by `./scripts/verify-test-coverage.sh`.

### Four Testing Layers

#### Vitest (Unit Tests)
- Pure logic, hooks, utilities
- Fast, runs in Node
- **Run:** `./scripts/run-tests.sh` or `pnpm vitest`

#### React Testing Library (Component Tests)
- Component behavior from the user's perspective
- Query by role, label, text -- never by class or test ID unless necessary
- **Run:** `pnpm vitest` (same runner, jsdom environment)

#### Storybook (Visual Development)
- Component isolation and documentation
- Visual states, variants, edge cases
- **Run:** `pnpm storybook`

#### Playwright (E2E Tests)
- Critical user flows across browsers (Chromium, Firefox, WebKit)
- App-type-aware: web apps, Chrome extensions, and PWAs each get tailored tests
- **Setup:** `./scripts/setup-playwright.sh`
- **Run:** `pnpm exec playwright test`
- **Chrome extensions:** `pnpm exec playwright test --config=playwright.chrome-ext.config.ts`

### Visual QA (Pixel Diff)

Automated pixel-level comparison using `scripts/visual-diff.js`:
- Compares app screenshots against Figma reference screenshots
- Iterates up to 5 times to achieve < 2% mismatch
- Region-based analysis identifies which areas need fixes
- **Run:** `node scripts/visual-diff.js --batch actual/ expected/ --json`

## Code Quality Tools

### ESLint
- React, TypeScript, and accessibility rules
- **Run:** `./scripts/lint-and-format.sh`

### Prettier
- Consistent formatting, integrated with ESLint
- **Run:** `./scripts/lint-and-format.sh`

### Bundle Analysis
- Track bundle size and identify heavy dependencies
- **Run:** `./scripts/check-bundle-size.sh`

### Accessibility Checks
- Automated a11y scanning with eslint-plugin-jsx-a11y
- **Run:** `./scripts/check-accessibility.sh`

## Available Scripts

All scripts are in the `scripts/` directory:

| Script | Purpose |
|--------|---------|
| `setup-project.sh` | Initialize project with dependencies |
| `setup-playwright.sh` | Install Playwright browsers |
| `run-tests.sh` | Run Vitest test suite |
| `cross-browser-test.sh` | Run Playwright cross-browser tests |
| `check-types.sh` | TypeScript type checking |
| `lint-and-format.sh` | ESLint + Prettier |
| `check-bundle-size.sh` | Bundle size analysis |
| `check-accessibility.sh` | Automated accessibility scan |
| `verify-tokens.sh` | Design token enforcement |
| `verify-test-coverage.sh` | Component test file verification |
| `visual-diff.js` | Pixel-level screenshot comparison |

Full reference: `scripts/README.md`

## Project Structure

```
project-root/
├── app/                  # Application code
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utility functions
│   │   ├── types/        # Shared TypeScript types
│   │   ├── styles/       # Global styles, design tokens
│   │   └── assets/       # Images, fonts, static files
│   ├── e2e/              # Playwright E2E tests
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── vitest.config.ts
├── scripts/              # Development automation
├── templates/            # Starter configs (shared, Next.js, Vite, Chrome ext)
├── docs/                 # Documentation
└── .claude/              # Claude Code configuration
    ├── agents/           # 53 custom agents
    ├── skills/           # 20 development skills
    └── pipeline.config.json
```

## Development Workflow

```bash
# Start development
pnpm dev

# Run tests in watch mode
pnpm vitest --watch

# Type check
pnpm tsc --noEmit

# Lint and format
pnpm lint && pnpm format

# Build for production
pnpm build
```

## Related Documentation

- `docs/figma-to-react/README.md` -- Figma-to-React conversion pipeline
- `docs/canva-to-react/README.md` -- Canva-to-React conversion pipeline
- `.claude/skills/README.md` -- Skills catalog (20 skills)
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Agent catalog (53 agents)
- `.claude/PLUGINS-REFERENCE.md` -- Plugin reference
- `scripts/README.md` -- Scripts reference
- `templates/README.md` -- Template configs reference
