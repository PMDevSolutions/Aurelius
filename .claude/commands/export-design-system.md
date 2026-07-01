---
allowed-tools: Skill, Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# /export-design-system — Export Components as a Publishable Library

Export the generated components and design tokens from this project as a publishable pnpm workspace with a framework-agnostic token package and a framework-specific component library (Vite library mode for web, `tsc` for React Native).

## Input

`$ARGUMENTS` — optional flags forwarded to the export script. Common patterns:

- _(none)_ — default: detect framework from `build-spec.json`, scope from `package.json`, output to `dist/design-system/`.
- `--scope @acme` — override the npm scope.
- `--output packages/design-system` — pick a different output location.
- `--framework vue` — override detected framework.
- `--dry-run` — preview without writing.
- `--force` — overwrite existing output dir.
- `--json` — machine-readable summary.

## Preconditions

This command requires:
1. **`design-tokens.lock.json`** in `src/styles/` or project root (produced by the `design-token-lock` skill or any of the `/build-from-*` pipelines).
2. **At least one component** in `src/components/` (or pass `--components-dir`).
3. **Framework discoverable** via `build-spec.json` (`outputTarget`), `package.json` deps, or `--framework` flag.

If any precondition is missing, stop and tell the user which one and how to fix it (run a build pipeline, pass a flag, etc.) — do not attempt to repair the project automatically.

## Steps

### 1. Sanity check inputs

Run a quick detection pass before invoking the skill:

```bash
test -f src/styles/design-tokens.lock.json || test -f design-tokens.lock.json
ls src/components 2>/dev/null | head -1
```

If lockfile is missing, surface the error and recommend running `/build-from-figma`, `/build-from-canva`, or `/build-from-screenshot` first.

### 2. Confirm scope and output (only if user did not pass them)

If the user did not provide `--scope` or `--output`, ask them once via `AskUserQuestion`:

- **Scope:** "What npm scope should the packages publish under? (e.g. `@acme`)" — default to the value detected from the project's `package.json`, or `@my-app`.
- **Output dir:** offer `dist/design-system` as the default and let them confirm or override.

Skip the prompt if `$ARGUMENTS` already includes either flag.

### 3. Invoke the skill

Use the `export-design-system` skill with the resolved arguments.

The skill calls the underlying script:

```bash
./scripts/export-design-system.sh [resolved flags]
```

If the user passed `--dry-run` or `--json`, forward them as-is.

### 4. Report

After the script returns, report to the user:

- Framework and scope used.
- Package names generated (`<scope>/design-tokens` and `<scope>/<framework>-components`).
- Number of components exported.
- Output directory path.
- Next steps:
  ```bash
  cd <output>
  pnpm install
  pnpm build
  ```
- Note any framework-specific caveats (especially: React Native uses `tsc`, not Vite).

If the script exited non-zero, surface the exit code and the stderr message verbatim — do not attempt remediation without confirming with the user.

## Failure modes

- **Lockfile missing (exit 2):** Tell the user to run a build pipeline first.
- **Framework undetectable (exit 2):** Ask the user which framework to target via `--framework`.
- **Output directory exists (exit 1):** Ask the user whether to `--force` overwrite or pick a new path.
- **Unsupported framework (exit 3):** Only `react`, `vue`, `svelte`, `react-native` are supported.

## Round-trip / re-import

The export is reversible. To reconstruct a `design-tokens.lock.json` from an
exported workspace — or to verify the round-trip in CI — use the inverse script:

```bash
./scripts/import-design-tokens.sh --from dist/design-system --out design-tokens.lock.json
./scripts/import-design-tokens.sh --from dist/design-system --verify src/styles/design-tokens.lock.json
```

Only `tokens.json`/`tokens.ts` round-trip losslessly (`tokens.css` and the
Tailwind preset are derived views). See `docs/design-system-export/consumers.md`
for the interchange contract and how Flavian (WordPress `theme.json`) and Nerva
(typed tokens) consume the export.

## Out of scope

This command does NOT:
- Run `pnpm install` or `pnpm build` in the generated workspace.
- Publish to npm.
- Modify files inside the source project.
- Re-extract tokens from Figma (use `/build-from-figma` or the `design-token-lock` skill for that).
