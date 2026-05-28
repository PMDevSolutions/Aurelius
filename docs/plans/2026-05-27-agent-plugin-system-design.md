# Agent Plugin System — Design

**Date:** 2026-05-27
**Status:** Approved (brainstorming complete)
**Branch:** `9-agent-plugin-system-for-custom-agent-creation`

## Goal

A plugin architecture for authoring, packaging, validating, and installing custom
Claude Code agents in a standardized, dependency-aware way. Covers four
deliverables:

1. An agent plugin API specification (manifest + agent format).
2. A scaffolding CLI for creating new plugins.
3. A registry with dependency resolution and install/uninstall flow.
4. A validation and testing framework.

## Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plugin model | Markdown + Node tooling layer | Agents are prompt files (`.md`) consumed by Claude Code; tooling is Node/bash scripts. A plugin packages an agent plus metadata. Fits the existing repo pattern. |
| Lifecycle hooks | Plugin **management** lifecycle | Claude Code has no per-agent runtime hooks. Hooks fire during tooling operations (install/uninstall), mirroring the existing `.claude/hooks/` script convention. |
| Dependencies | Agents (semver) + skills + tools | Agent deps are versioned and resolved; skills and tools/scripts are existence-checked. |
| Testing | Static + structural assertions | Prompts can't run deterministically without invoking Claude. Tests assert verifiable facts over files. No Claude invocation; CI-friendly. |

### Non-goals

- No runtime agent loader (agents are prompts Claude reads directly).
- No invocation-time hooks (`onBeforeInvoke`, etc.) — Claude Code can't fire them.
- No network/marketplace fetch. All operations are local-file only.
- No side-by-side versions — one plugin resolves to exactly one installed version.

## Architecture & layout

```
.claude/agent-plugins/<plugin-name>/
  plugin.json          # manifest: name, version, deps, hooks, metadata
  agent.md             # YAML frontmatter + prompt (the deliverable)
  hooks/               # optional management-lifecycle scripts (.sh)
  tests/
    plugin.test.json   # static/structural assertions
  assets/              # optional (templates, reference files)

.claude/agent-plugins/installed.json   # registry state
.claude/agent-plugin.schema.json        # JSON Schema (ajv, 2020 dialect)

scripts/
  agent-plugin-lib.js              # shared: manifest/frontmatter parse, semver, catalog, topo-sort
  create-agent-plugin.js (+ .sh)   # scaffolding CLI
  agent-registry.js      (+ .sh)   # resolve deps, install order, install/uninstall
  validate-agent-plugin.js (+ .sh) # schema + structural validation
  test-agent-plugin.js   (+ .sh)   # assertion runner
```

**Source vs. runtime split:** authoring lives in `.claude/agent-plugins/<name>/`.
Install validates → runs deps → copies `agent.md` to `.claude/agents/<name>.md`
(where Claude Code reads it) → runs hooks → records state in `installed.json`.

All scripts follow existing conventions: ESM Node + `.sh` wrappers, ajv schema
validation, `--json` flags, exit codes `0` (ok) / `1` (failures) / `2` (IO/usage),
matching `validate-pipeline-config.js`.

## Manifest schema (`plugin.json`)

```jsonc
{
  "name": "react-perf-expert",        // kebab-case ^[a-z][a-z0-9-]*$; matches dir + agent.md frontmatter
  "version": "1.2.0",                  // semver
  "description": "...",                // required
  "author": "...",                     // optional
  "license": "MIT",                    // optional
  "agent": "agent.md",                 // path to prompt file (default "agent.md")
  "dependencies": {
    "agents": { "asset-cataloger": "^1.0.0" },   // name -> semver range, resolved
    "skills": ["react-testing-workflows"],         // existence-checked under .claude/skills/
    "tools":  ["scripts/visual-diff.js"]           // existence-checked, repo-relative
  },
  "hooks": {                            // all optional; repo-relative to plugin dir
    "preInstall":   "hooks/check-deps.sh",
    "postInstall":  "hooks/register.sh",
    "preUninstall": "hooks/cleanup.sh",
    "postUninstall":"hooks/unregister.sh"
  },
  "tests": "tests/plugin.test.json"
}
```

**Schema enforcement (ajv, JSON Schema 2020):**
- `name`, `version`, `description` required. `name` pattern `^[a-z][a-z0-9-]*$`; `version` semver pattern.
- `additionalProperties: false` at root and in `hooks` (catches typo'd keys).
- `dependencies.agents` values are semver ranges; `skills`/`tools` are string arrays.
- `hooks.*` constrained to the four known keys.

**Structural checks (in `validate-agent-plugin.js`, beyond schema):**
1. `name` matches directory name **and** `name:` in `agent.md` frontmatter (three-way).
2. Every declared `hooks.*` path exists in the plugin dir.
3. The `agent` file exists.
4. `tools` deps resolve to real repo-relative files; `skills` exist under `.claude/skills/`.
5. `agent.md` frontmatter sanity: `name`, `description`, `tools` present; `model`/`permissionMode` valid enum if set.

Errors are collected and reported together (not fail-fast), each naming the offending path.

## Registry & dependency resolution (`agent-registry.js`)

Builds an in-memory catalog `{ name -> { version, deps, dir } }` from all
`plugin.json` files, plus `installed.json` for current state.

**Resolution for `install <name>`:**
1. Build graph — walk `dependencies.agents` transitively.
2. Missing check — every agent dep exists in the catalog, else error with requiring chain.
3. Version check — resolved `version` satisfies declaring semver range; conflicting ranges for one dep across the graph → error.
4. Cycle detection — Kahn topological sort (reusing the approach in `validate-pipeline-config.js`); cycle lists involved plugins.
5. Order — topological order = install sequence (deps before dependents).
6. Non-agent deps — `skills` checked under `.claude/skills/`, `tools` as repo-relative files. Missing → error (existence-only; not installed).

**Install execution** (per plugin, in order, idempotent):
`preInstall` hook → copy `agent.md` → `.claude/agents/<name>.md` → `postInstall`
hook → record `{name, version, sourceHash, installedAt}` in `installed.json`.
Already-installed-and-satisfied plugins are skipped.

**Uninstall:** refuse if another installed plugin depends on it (lists dependents)
unless `--force`; else `preUninstall` → remove `.claude/agents/<name>.md` →
`postUninstall` → drop from `installed.json`.

**Hook runner contract:** hooks are executable `.sh` scripts invoked with env
`PLUGIN_NAME`, `PLUGIN_DIR`, `PLUGIN_VERSION`. A failing `pre*` hook aborts the
operation; a failing `post*` hook warns only (the action already happened). A
declared-but-missing hook is a validation failure.

**Commands:** `list`, `resolve <name>` (dry-run plan), `install <name>`,
`uninstall <name>` — all with `--json`.

## Scaffolding CLI (`create-agent-plugin.js`)

```bash
node scripts/create-agent-plugin.js <name> [--description "..."] \
  [--model opus|sonnet|haiku] [--tools "Read,Write,Bash"] \
  [--with-hooks] [--force] [--json]
```

Validates `name` → creates `.claude/agent-plugins/<name>/` → writes `plugin.json`
(version `0.1.0`), `agent.md` (frontmatter from flags + skeleton sections in the
`agent-expert` house style: core expertise, *When to Use*, examples),
`tests/plugin.test.json` (default assertions), and `hooks/` stubs only with
`--with-hooks`. Interactive prompts fill un-passed flags; `--json` + flags is
non-interactive for CI. Refuses to overwrite without `--force`.

## Testing framework (`test-agent-plugin.js`)

Reads `tests/plugin.test.json`:

```jsonc
{ "assert": [
  "manifest.valid",                      // delegates to validate-agent-plugin.js
  "frontmatter.has(name,description,tools)",
  "frontmatter.model in (opus,sonnet,haiku)",
  "deps.resolve",                        // delegates to registry resolver
  "hooks.executable",
  "prompt.section('When to Use This Agent')",
  "description.examples >= 2"            // counts <example> blocks
]}
```

Each assertion is a named, pure predicate over the plugin's files — deterministic,
no Claude invocation. Runner accepts `<name>` or `--all`, plus `--json`. Unknown
assertion strings are a hard error (typos can't silently pass). Exit `0`/`1`/`2`.

The assertion catalog is fixed and documented; extended by adding predicates to the runner.

## Testing strategy (for the tooling itself)

Vitest (already in the repo):
- `agent-plugin-lib.js` unit tests — semver satisfaction, frontmatter parse, catalog build, topo-sort, cycle detection.
- Fixture plugins under `tests/fixtures/agent-plugins/`: valid, missing-dep, cyclic, version-mismatch, bad-frontmatter.
- Integration tests invoke each script against fixtures, asserting exit codes + `--json` payloads.
- Install/uninstall tests run against a temp dir — never mutate the real repo.

## Rollout & docs

- New `docs/guides/agent-plugins.md` — authoring guide, manifest reference, lifecycle, commands.
- Update `CLAUDE.md` Development Scripts section + prose script count, and `scripts/README.md`.
- These are tooling scripts (not agents/skills), so `check-doc-counts.sh` agent/skill counts are unaffected; only the prose script count needs updating.
- Optional CI wiring: `validate-agent-plugin.js --all` + `test-agent-plugin.js --all` in `verify-all.sh`.
