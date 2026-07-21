# Agent Plugin System

A plugin packages a **custom Claude Code agent** plus the metadata needed to
validate, install, and dependency-resolve it. This lets you author agents in a
standardized, versioned way and install them (with their dependencies) into
`.claude/agents/` where Claude Code reads them.

> Design and rationale: `docs/plans/2026-05-27-agent-plugin-system-design.md`.

## What a plugin is

A plugin is a directory under `.claude/agent-plugins/<name>/`:

```
.claude/agent-plugins/<name>/
  plugin.json          # manifest (validated against a JSON Schema)
  agent.md             # the agent: YAML frontmatter + prompt (the deliverable)
  hooks/               # optional management-lifecycle scripts (.sh)
  tests/
    plugin.test.json   # static assertions run by the test runner
```

Authoring lives here. **Installing** copies `agent.md` to
`.claude/agents/<name>.md` (where Claude Code reads it) and records state in
`.claude/agent-plugins/installed.json`.

## The four CLIs

Each is an ESM Node script with a `.sh` wrapper, a `--json` mode, and exit codes
`0` (ok) / `1` (failure) / `2` (usage/IO). They share `scripts/agent-plugin-lib.js`.

| Script | Purpose |
|--------|---------|
| `create-agent-plugin.js` | Scaffold a new plugin directory |
| `validate-agent-plugin.js` | Validate a manifest (schema + structural checks) |
| `agent-registry.js` | List / resolve / install / uninstall plugins |
| `test-agent-plugin.js` | Run a plugin's static assertions |

### Create

```bash
node scripts/create-agent-plugin.js <name> [--description "..."] \
  [--model opus|sonnet|haiku] [--tools "Read,Write"] [--with-hooks] [--force] [--json]
```

Scaffolds `plugin.json` (version `0.1.0`), an `agent.md` skeleton in the house
style (core expertise, *When to Use*, two `<example>` blocks), and default test
assertions. With `--with-hooks`, also writes `hooks/pre-install.sh` and
`hooks/post-install.sh` stubs. Refuses to overwrite without `--force`. Prompts
for missing fields only on an interactive TTY (non-interactive runs need the
flags or `--json`).

### Validate

```bash
node scripts/validate-agent-plugin.js --dir <plugin-dir> [--json]
node scripts/validate-agent-plugin.js --all [--plugins-root <dir>] [--json]
```

Validates `plugin.json` against `.claude/agent-plugin.schema.json` (collecting
all errors), then runs structural checks the schema cannot express:

- `name` matches the directory name **and** the `agent.md` frontmatter `name`.
- The agent file exists; its frontmatter has `name`/`description`/`tools`, and
  `model`/`permissionMode` are valid if present.
- Declared hook scripts exist.
- `skills` deps exist under `.claude/skills/`; `tools` deps exist as repo files.
- Agent dependencies resolve (in `--dir` mode the catalog is seeded from sibling
  plugins, so siblings resolve without being installed).

### Registry (install / uninstall)

```bash
node scripts/agent-registry.js list [--json]
node scripts/agent-registry.js resolve <name> [--json]      # dry-run install order
node scripts/agent-registry.js install <name> [--json]
node scripts/agent-registry.js uninstall <name> [--force] [--json]
```

`install` resolves the dependency graph, installs in topological order (deps
first), runs lifecycle hooks, copies each `agent.md` into `.claude/agents/`, and
records `{version, sourceHash, installedAt}` in `installed.json`. Already-installed
plugins at the same version are skipped (idempotent). `uninstall` refuses to
remove a plugin another installed plugin depends on unless `--force`.

### Test

```bash
node scripts/test-agent-plugin.js --dir <plugin-dir> [--json]
node scripts/test-agent-plugin.js --all [--plugins-root <dir>] [--json]
node scripts/test-agent-plugin.js --dir <d> --assert "manifest.valid" [--assert ...]
```

Runs the assertions in the plugin's `tests/plugin.test.json` (or inline
`--assert` overrides). Assertions are **pure, deterministic predicates over the
plugin's files** — no Claude invocation. An unknown assertion string is a hard
error (exit 2) so typos can't silently pass.

## Manifest reference (`plugin.json`)

```jsonc
{
  "name": "webinar-producer",          // kebab-case ^[a-z][a-z0-9-]*$; matches dir + agent.md name
  "version": "1.2.0",                  // semver
  "description": "...",                // required
  "author": "...",                     // optional
  "license": "MIT",                    // optional
  "agent": "agent.md",                 // path to the prompt file (default "agent.md")
  "dependencies": {
    "agents": { "video-script-writer": "^1.0.0" }, // name -> semver range; resolved + version-checked
    "skills": ["editorial-qa"],                    // existence-checked under .claude/skills/
    "tools":  ["scripts/readability-score.js"]     // existence-checked, repo-relative
  },
  "hooks": {                            // all optional; paths relative to the plugin dir
    "preInstall":   "hooks/check-deps.sh",
    "postInstall":  "hooks/register.sh",
    "preUninstall": "hooks/cleanup.sh",
    "postUninstall":"hooks/unregister.sh"
  },
  "tests": "tests/plugin.test.json"
}
```

The schema is strict (`additionalProperties: false` at the root and in `hooks`),
so typo'd keys are rejected.

## Dependencies

- **Agent deps** are versioned (`name → semver range`). The registry resolves
  them transitively, topologically sorts the install order (deps before
  dependents), and reports **missing** deps, **version** mismatches, and
  **cycles** — all in one pass.
- **Skill and tool deps** are existence-checked only (they are not installed):
  skills must exist under `.claude/skills/`, tools as repo-relative file paths.

## Lifecycle hooks

Hooks attach to the **plugin-management lifecycle** (not agent invocation —
Claude Code has no per-agent runtime hooks). The registry runs them via `bash`
with the environment variables `PLUGIN_NAME`, `PLUGIN_DIR`, and `PLUGIN_VERSION`:

| Hook | When | On failure |
|------|------|------------|
| `preInstall` | before copying the agent | **aborts** the install |
| `postInstall` | after the agent is recorded | warns only |
| `preUninstall` | before removing the agent | **aborts** the uninstall |
| `postUninstall` | after the agent is removed | warns only |

Hooks require `bash` on PATH (Git Bash/WSL on Windows). Follow the defensive
skeleton: `set -u`, `trap 'exit 0' ERR`, explicit `exit`.

## Assertion catalog (`tests/plugin.test.json`)

```jsonc
{ "assert": [
  "manifest.valid",                       // delegates to validate-agent-plugin.js
  "frontmatter.has(name,description,tools)",
  "frontmatter.model in (opus,sonnet,haiku)",  // passes if the field is unset
  "deps.resolve",                         // dependencies resolve with no errors
  "hooks.executable",                     // declared hook files exist and are readable
  "prompt.section('When to Use This Agent')",  // a matching markdown heading exists
  "description.examples >= 2"             // counts <example> blocks in the description
]}
```

The catalog is fixed; extend it by adding a predicate to `test-agent-plugin.js`.

## Typical workflow

```bash
# 1. Scaffold
node scripts/create-agent-plugin.js my-expert --description "Does the thing" --with-hooks

# 2. Edit .claude/agent-plugins/my-expert/agent.md, then validate + test
node scripts/validate-agent-plugin.js --dir .claude/agent-plugins/my-expert
node scripts/test-agent-plugin.js --dir .claude/agent-plugins/my-expert

# 3. Install it (and any dependencies) into .claude/agents/
node scripts/agent-registry.js install my-expert
```

`validate-agent-plugin.js --all` and `test-agent-plugin.js --all` validate/test
every plugin under `.claude/agent-plugins/` and are wired into `verify-all.sh`
(they no-op when no plugins exist).
