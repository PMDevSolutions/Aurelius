---
paths:
  - ".claude/agents/**"
  - ".claude/skills/**"
  - ".claude/hooks/**"
  - ".claude/workflows/**"
  - ".claude/rules/**"
  - ".claude/settings.json"
  - ".claude-plugin/**"
  - "evals/**"
---

# Claude Code conventions for this repo (verified against Claude Code 2.1.310, 2026-10-24)

Run `node scripts/claude-code-conformance.js` after editing anything under `.claude/`. It fails on retired tool names, unknown frontmatter fields, legacy command files, and hooks that still expect `$TOOL_INPUT`. `./scripts/verify-all.sh` and CI run it too.

## Agents (`.claude/agents/<name>.md`)
- Required: `name` (matches the filename) and `description` (when to delegate). Optional fields in use: `tools`, `model`, `permissionMode`, `memory`, `skills`, `hooks`, `color`.
- Tool names that exist: `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Skill`, `Agent`, `NotebookEdit`, `LSP`, `Monitor`, `TaskStop`, plus MCP server patterns.
- Retired, never use: `MultiEdit` and `Edits` (use `Edit`), `Task` (use `Agent`), `KillShell` (use `TaskStop`), `SlashCommand` (use `Skill`), `TaskOutput`, `BashOutput`. `TodoWrite` is not offered on current models; pipelines track state in `.claude/plans/pipeline-state.json`.
- `AskUserQuestion` is never available inside a subagent. Agents end with an "Open questions" list for the main session.
- A `tools:` list excludes the MCP tools it does not name. Name whole servers: `mcp__figma__*`, `mcp__figma-desktop__*`, `mcp__chrome-devtools__*`, `mcp__playwright__*`. Tools from a server bundled in a plugin are named `mcp__plugin_<plugin>_<server>__*` and do not match those patterns.
- `memory: local` (`.claude/agent-memory-local/<name>/`, gitignored) for agents whose knowledge compounds across builds. Not `project`: the repo is public, and project memory would publish what agents learn about apps built in a checkout.
- `skills:` loads each skill's full text on every invocation. Pair an agent only with its core playbook, and never preload a large skill into an agent that the `component-lanes` workflow runs once per component.
- `color` accepts only red, blue, green, yellow, purple, orange, pink, cyan.
- Agents whose domain touches deploys, releases or publishing, and that have `Bash`, carry `agent-no-deploy.sh` as a PreToolUse hook in frontmatter. Plugin agents ignore `hooks`, `mcpServers` and `permissionMode`, so the settings-level `deploy-guard.sh` denies deploys in every subagent on its own (it reads `agent_id`).

## Skills (`.claude/skills/<name>/SKILL.md`)
- `.claude/commands/` is retired; every slash command is a skill directory, so it can carry supporting files.
- Fields in use: `name`, `description` (with `Keywords:`), `argument-hint`, `allowed-tools` (pre-approval for the skill's turn, not a restriction), `disable-model-invocation` (the four pipelines, `verify-all`, `ci`, `export-design-system`), `user-invocable: false` (`parallel-orchestration`). `triggers:` and `globs:` are not fields; path scoping is `paths:`.
- A skill with `disable-model-invocation: true` cannot be invoked through the Skill tool or preloaded. A skill that hands off to one reads its `SKILL.md` and follows it (`build-from-conversation` → `build-from-figma`).
- Keep `SKILL.md` under 500 lines; move reference material to files beside it and link them.

## Hooks (`.claude/hooks/*.sh`, registered in `.claude/settings.json`)
- Input is the event JSON on stdin; output is JSON on stdout. Source `lib/hook-io.sh` (shared with Maecenas; keep it identical) and `lib/pipeline-helpers.sh`.
- Keep the defensive skeleton (`set -u`, `trap 'exit 0' ERR`, always exit 0) and stay bash 3.2-safe: the macOS system bash runs these.
- Gates are PreToolUse `deny` or `ask`. Reminders are `additionalContext`; plain stdout reaches Claude only from SessionStart.
- Register with `bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/<name>.sh` and a narrow `if`, and mirror the entry in `.claude/hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`; `scripts/__tests__/hooks.test.js` fails when the two differ.
- `deploy-guard.sh` registers with `onFailure: "block"`. Every other hook stays silent outside an Aurelius project (no `.claude/pipeline.config.json`).
- A new deploy surface goes into `lib/deploy-classify.mjs`, with a case in the classifier tests.

## Workflows (`.claude/workflows/`)
- `component-lanes.js` runs Phases 4-5 of the build pipelines. Keep `export const meta` the first statement and a pure literal, with `phases` titles that match the `phase:` options. No `Date.now()`, `Math.random()`, argless `new Date()`, imports, filesystem or shell: agents do the work, the script coordinates.
- Bounds and rule checks live in code, and pass decisions are computed from the reported numbers, never taken from an agent's own verdict.
- `scripts/__tests__/component-lanes.test.js` runs the script with stub globals; extend it with every control-flow change.

## Plugin packaging (`.claude-plugin/`)
- `plugin.json` points at the live agent files, `.claude/skills`, `.claude/hooks/hooks.json` and `.claude/workflows`, so the repo is both a project and an installable plugin with one source of truth. `agents` must name every agent file (the conformance check enforces it); `metadata.excludedAgents` keeps one in the repo but out of the plugin.
- Validate with `claude plugin validate .`; expect one warning, for `CLAUDE.md` at the plugin root, which is this repo's project file and stays out of plugin context.
- The pipeline skills call `./scripts/…`, so they work only in an Aurelius checkout. The agents, the knowledge skills and the deploy guard work in any repo.

## Evals (`evals/`)
- One case per hard rule: `prompt.md`, graders under `graders/`, and a `case.yaml` scaffold when the case needs files. Grade file contents with `target: { source: file, path: … }`; `target: files` is the list of created paths, not their contents.

## Counts
- Adding or removing an agent or skill changes the documented counts. `scripts/check-doc-counts.sh` fails CI on drift; search `*.md` for the old number.
