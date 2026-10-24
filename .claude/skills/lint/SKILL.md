---
name: lint
description: Run ESLint and Prettier across the project, auto-fix what they can, type-check, and report what is left. Use when asked to lint, format or clean up code style. Keywords: lint, format, eslint, prettier, code style
argument-hint: "[--check]"
allowed-tools: Bash(./scripts/lint-and-format.sh *), Bash(pnpm eslint *), Bash(pnpm prettier *), Bash(pnpm tsc *)
---

# Lint & Format

Run ESLint and Prettier across the project.

## Purpose

This command checks and fixes code quality and formatting issues using ESLint and Prettier.

## Usage

```
/lint            # fix what can be fixed, report the rest
/lint --check    # report only, change nothing
```

## What this command does

1. **Runs ESLint** to check for code quality issues
2. **Runs Prettier** to check formatting
3. **Auto-fixes** where possible
4. **Reports** remaining issues that need manual attention

## Steps

### 1. Check if tools are installed
```bash
pnpm eslint --version && pnpm prettier --version
```

### 2. Run ESLint with auto-fix
```bash
pnpm eslint . --fix --ext .ts,.tsx,.js,.jsx
```

### 3. Run Prettier
```bash
pnpm prettier --write "src/**/*.{ts,tsx,js,jsx,css,json,md}"
```

### 4. Type check
```bash
pnpm tsc --noEmit
```

## Or use the project script

```bash
./scripts/lint-and-format.sh $ARGUMENTS
```

With `--check` the script reports without changing files, as CI runs it.

## Common Issues

- **Missing ESLint config**: Copy `templates/shared/eslint.config.js` to project root
- **Missing Prettier config**: Copy `templates/shared/prettier.config.js` to project root
- **Conflicting rules**: Ensure eslint-config-prettier is installed to disable formatting rules in ESLint
