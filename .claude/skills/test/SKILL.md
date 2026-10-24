---
name: test
description: Run the Vitest suite (React Testing Library for components): everything, one file, a name pattern, or with coverage, and report failures clearly. Use when asked to run tests or check coverage. Keywords: test, vitest, coverage, run tests
argument-hint: "[file | -t pattern] [--coverage]"
allowed-tools: Bash(pnpm vitest *), Bash(./scripts/run-tests.sh *)
---

# Test Runner

Run Vitest tests with coverage reporting.

## Purpose

This command runs the project's test suite using Vitest and React Testing Library.

## Usage

```
/test                                   # whole suite
/test src/components/Button.test.tsx    # one file
/test -t "should render" --coverage     # by name, with coverage
```

With arguments, run `pnpm vitest run $ARGUMENTS`; without, run the whole suite.

## What this command does

1. **Detects test configuration** (vitest.config.ts or vite.config.ts)
2. **Runs all tests** with proper configuration
3. **Shows coverage report** if configured
4. **Reports failures** with clear error details

## Steps

### 1. Run all tests
```bash
pnpm vitest run
```

### 2. Run with coverage
```bash
pnpm vitest run --coverage
```

### 3. Run specific test file
```bash
pnpm vitest run src/components/Button.test.tsx
```

### 4. Run in watch mode (interactive development)
```bash
pnpm vitest
```

### 5. Run tests matching a pattern
```bash
pnpm vitest run -t "should render"
```

## Or use the project script

```bash
./scripts/run-tests.sh
```

## Test Types

| Type | Tool | Pattern | Purpose |
|------|------|---------|---------|
| Unit | Vitest | `*.test.ts` | Pure functions, utilities |
| Component | Vitest + RTL | `*.test.tsx` | React component behavior |
| Hook | Vitest + RTL | `*.test.ts` | Custom hook logic |
| E2E | Playwright | `*.spec.ts` | Full user flows |
| Visual | Storybook | `*.stories.tsx` | Component states |

## Common Issues

- **Missing setup file**: Create `src/test/setup.ts` with `import '@testing-library/jest-dom'`
- **JSX not recognized**: Ensure `environment: 'jsdom'` in vitest config
- **Module resolution**: Check `resolve.alias` matches tsconfig paths
