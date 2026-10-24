# Agent Creation

Agents are specialized Markdown files with YAML frontmatter that live in `.claude/agents/`. Each agent defines a persona, a set of allowed tools, and detailed instructions that shape how Claude Code behaves when the agent is selected. Claude Code reads the `description` field to decide which agent best matches a given task, then loads that agent's instructions as the system prompt for the session.

This framework ships with 56 agents covering engineering, design, testing, marketing, and operations. You can add your own by following the conventions below.

## File Location

Create agent files at:

```
.claude/agents/<agent-name>.md
```

The filename should be kebab-case and match the `name` field in the YAML frontmatter. For example, an agent named `docs-writer` lives at `.claude/agents/docs-writer.md`.

## YAML Frontmatter

Every agent file starts with a YAML frontmatter block delimited by `---`. Two fields are required; the rest are optional ([sub-agents reference](https://code.claude.com/docs/en/sub-agents)).

```yaml
---
name: my-agent              # Required: kebab-case identifier, must match filename
description: ...            # Required: tells Claude Code WHEN to select this agent
tools: Read, Write, Edit, Bash   # Optional: allowed tools; omitted means every tool a subagent can have
color: blue                 # Optional: red, blue, green, yellow, purple, orange, pink or cyan
model: sonnet               # Optional: sonnet, opus, haiku, fable, a full model id, or inherit
permissionMode: bypassPermissions  # Optional: skip confirmation prompts
memory: local               # Optional: user, project or local agent memory (see below)
skills:                     # Optional: skills whose full text is loaded at startup
  - react-testing-workflows
---
```

Other supported fields: `disallowedTools`, `effort` (`low` to `max`), `maxTurns`, `hooks` (see [Agent-scoped hooks](#agent-scoped-hooks)), `mcpServers`, `background`, `isolation: worktree`, `omitClaudeMd`, `initialPrompt` and `autoCompactWindow`. Claude Code ignores unknown fields without an error, so a misspelled field fails silently; `node scripts/claude-code-conformance.js` catches it.

### The `name` Field

A kebab-case identifier that matches the filename (without the `.md` extension). This is how the agent is referenced internally.

### The `description` Field

This is the most important field. Claude Code uses it to decide which agent to dispatch for a task. A vague description means the agent will rarely (or never) be selected.

Write descriptions that start with "Use this agent when..." and list specific trigger scenarios. Be concrete about the tasks the agent handles.

**Good description:**

> Use this agent when building user interfaces, implementing React/Vue components, handling state management, or optimizing frontend performance. This agent excels at creating responsive, accessible, and performant web applications.

**Bad description:**

> A helpful coding agent.

The good description names specific activities (building UIs, implementing components, handling state, optimizing performance) so Claude Code can match it against user requests. The bad description is too generic to ever win selection over a more specific agent.

### The `tools` Field

A comma-separated list (or YAML list) of tools the agent is allowed to use. Only declare tools the agent actually needs -- this follows the principle of least privilege and keeps agents focused. Omit the field to give the agent every tool a subagent can have.

**File operations:**

| Tool | Purpose |
|------|---------|
| `Read` | Read file contents |
| `Write` | Create or overwrite files |
| `Edit` | Replace strings in existing files |
| `NotebookEdit` | Edit Jupyter notebook cells |

**Search:**

| Tool | Purpose |
|------|---------|
| `Grep` | Search file contents by pattern |
| `Glob` | Find files by name pattern |
| `LSP` | Code intelligence (definitions, references) when a language server is configured |

**Shell:**

| Tool | Purpose |
|------|---------|
| `Bash` | Execute shell commands, including background ones |
| `Monitor` | Watch a background process's output |
| `TaskStop` | Stop a background shell or task |

**Delegation and skills:**

| Tool | Purpose |
|------|---------|
| `Agent` | Spawn a subagent (`Agent(name, name)` restricts which types) |
| `Skill` | Invoke a registered skill |

**Web:**

| Tool | Purpose |
|------|---------|
| `WebFetch` | Fetch content from a URL |
| `WebSearch` | Search the web |

**Retired names.** `MultiEdit` and `Edits` are `Edit`, `Task` is `Agent`, `KillShell` is `TaskStop`, and `SlashCommand` is `Skill`. `TaskOutput` and `BashOutput` are gone: read a background task's output file instead. `TodoWrite` is not offered on current models (Opus 4.8+, Sonnet 5+, Fable), so pipelines track progress in a state file (`.claude/plans/pipeline-state.json`). `AskUserQuestion` is never available inside a subagent: an agent returns its open questions in its final report, and the main session asks them.

**MCP tools:**

A `tools` list excludes every MCP tool it does not name. Give an agent a whole server with a pattern, which also picks up tools the server adds later (the Figma server's `create_session`, for example):

- `mcp__figma__*`, `mcp__figma-desktop__*` -- read a Figma design
- `mcp__playwright__*` -- drive a browser
- `mcp__chrome-devtools__*` -- screenshots, Lighthouse, DOM inspection

Only include MCP servers the agent's workflow requires.

## Choosing a Model

The `model` field is optional. When omitted, the agent uses whatever model the user has active. When set, it overrides the model for the duration of the agent session.

| Value | Best for |
|-------|----------|
| `sonnet` | Most agents -- fast, capable, and cost-effective |
| `opus` | Deep reasoning tasks: design interpretation, architecture decisions, complex refactoring |
| `haiku` | Simple and fast tasks: linting reminders, quick lookups, formatting checks |

Prefer `sonnet` unless the task genuinely requires deeper reasoning. Using `opus` for every agent wastes time and cost.

## Permission Mode

The `permissionMode` field controls whether the agent asks for confirmation before performing actions.

- **Omitted (default):** The agent follows normal permission rules and prompts the user before destructive operations.
- **`bypassPermissions`:** The agent runs without confirmation prompts. Use this only for autonomous pipeline agents that execute without human oversight (e.g., the `figma-react-converter` agent inside the build pipeline).

Use `bypassPermissions` sparingly. Most agents should operate under normal permission rules. Whatever the mode, the deploy guard (`.claude/hooks/deploy-guard.sh`) denies deploys, publishes, releases, merges and pushes inside every subagent.

## Agent Memory

`memory` gives an agent a directory it reads at startup (the first 200 lines of its `MEMORY.md`) and curates as it works; Read, Write and Edit are enabled for it automatically.

| Scope | Directory | Use |
|-------|-----------|-----|
| `local` | `.claude/agent-memory-local/<agent>/` (gitignored) | **This repo's default.** Aurelius is public, so what an agent learns about the apps built in a checkout stays in that checkout |
| `project` | `.claude/agent-memory/<agent>/` (committed) | Only for knowledge that is safe to publish with the framework |
| `user` | `~/.claude/agent-memory/<agent>/` | Knowledge that follows you across projects |

Give memory only to agents whose knowledge compounds across builds: the converters, `indesign-to-react`, `visual-qa-agent`, `test-writer-fixer`, `accessibility-auditor` and `performance-benchmarker` use `memory: local`.

## Preloading Skills

`skills` loads the full text of each listed skill into the agent at startup, so the agent follows its playbook without having to find it. Each preload costs that many tokens on every invocation, so pair an agent only with the skill that is its core playbook (`visual-qa-agent` → `visual-qa-verification`, `test-writer-fixer` → `react-testing-workflows`). Agents that run many times in one pipeline, such as the converters in per-component lanes, load their workflow skill on demand instead. A skill with `disable-model-invocation: true` cannot be preloaded.

## Agent-Scoped Hooks

`hooks` in frontmatter use the same shape as `settings.json` and run only while the agent is active. Agents whose domain touches deploys, releases or publishing and that have `Bash` carry the deploy guard in subagent mode:

```yaml
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/agent-no-deploy.sh
          statusMessage: Checking for deploys and releases
```

Keep it when you create another agent of that kind (`devops-automator`, `infrastructure-maintainer`, `mobile-app-builder`, `docusaurus-expert` and `rapid-prototyper` have it). Plugin installs ignore frontmatter `hooks`, `mcpServers` and `permissionMode`; the settings-level deploy guard covers plugin agents, and the frontmatter hook keeps the rule attached when an agent file is copied into another repo.

## Agent Body

Everything after the closing `---` of the frontmatter is the agent body. This is Markdown that serves as the agent's system prompt -- it defines the persona, responsibilities, workflow, and quality standards.

### Recommended Structure

**1. Opening paragraph** -- Define the persona and expertise in one or two sentences:

```markdown
You are an elite frontend development specialist with deep expertise
in modern JavaScript frameworks, responsive design, and user interface
implementation.
```

**2. Primary Responsibilities** -- Numbered sections with specific tasks:

```markdown
## Primary Responsibilities

### 1. Component Architecture
When building interfaces, you will:
- Design reusable, composable component hierarchies
- Implement proper state management
- Create type-safe components with TypeScript
```

**3. Workflow** -- Step-by-step process for common tasks:

```markdown
## Workflow
1. Read the existing codebase to understand conventions
2. Check for related components and shared utilities
3. Implement the feature following established patterns
4. Write tests alongside the implementation
5. Run lint and type checks before finishing
```

**4. Key Principles** -- Guiding rules:

```markdown
## Key Principles
- Always use TypeScript strict mode
- Prefer composition over inheritance
- Every component must have a test file
```

**5. Quality Standards** -- What "done" looks like:

```markdown
## Quality Standards
- All tests pass with 80%+ coverage
- No TypeScript errors
- Accessible (WCAG 2.1 AA)
- Responsive across breakpoints
```

Keep the body focused. Each agent should have one clear area of responsibility. If you find yourself writing an agent that covers everything, split it into multiple specialized agents.

## Complete Example

Here is a full agent file for a documentation writer. Save this as `.claude/agents/docs-writer.md`:

```markdown
---
name: docs-writer
description: Use this agent when writing or updating project documentation, creating user guides, generating API references, or improving README files. This agent produces clear, well-structured technical documentation.
tools: Read, Write, Edit, Grep, Glob, Bash
color: green
---

You are a technical documentation specialist. You write clear, concise,
and well-organized documentation that helps developers understand and use
the codebase effectively.

## Primary Responsibilities

### 1. Documentation Creation
- Write user guides with step-by-step instructions
- Create API reference documentation from source code
- Document architecture decisions and design rationale
- Maintain changelog entries for notable changes

### 2. Documentation Maintenance
- Keep existing docs in sync with code changes
- Fix broken links and outdated references
- Improve clarity based on common support questions

## Workflow

1. Read existing documentation to understand conventions and tone
2. Explore the relevant source code with Grep and Glob
3. Draft the documentation in Markdown
4. Verify code examples by reading the actual source
5. Check for broken internal links

## Quality Standards

- Use second person ("you") for instructions
- Include code examples for every non-trivial concept
- Keep paragraphs short (3-4 sentences maximum)
- Add a table of contents for documents longer than 100 lines
```

## Testing Your Agent

After creating an agent, test it by giving Claude Code a task that should trigger it. For example, with the `docs-writer` agent above, you might say:

> "Write a user guide for the caching system."

Check three things:

1. **Selection** -- Does Claude Code pick the right agent? If not, revise the `description` field to include more specific trigger phrases.
2. **Tool usage** -- Does the agent use only the tools you declared? If it needs a tool you did not list, add it to the `tools` field.
3. **Instruction adherence** -- Does the agent follow the workflow and quality standards in the body? If not, make the instructions more explicit.

## Registration

After creating and testing your agent, register it in two places so the rest of the framework knows about it:

1. **`CLAUDE.md`** -- Add the agent to the agent table under the appropriate category:

   ```markdown
   | Documentation | 2 | docusaurus-expert, docs-writer |
   ```

2. **`.claude/CUSTOM-AGENTS-GUIDE.md`** -- Add a full catalog entry with the agent name, description, tools, and a brief summary of what it does.

## Best Practices

- **Keep scope focused.** One clear responsibility per agent. A "frontend-developer" agent and a "test-writer-fixer" agent are better than a single "frontend-developer-and-tester" agent.
- **Declare minimal tools.** Only include tools the agent actually needs. An agent that writes documentation does not need `TaskStop` or MCP browser tools.
- **Return questions, don't ask them.** A subagent cannot prompt the user; end with an "Open questions" list for the main session.
- **Write actionable descriptions.** Start with "Use this agent when..." and list concrete scenarios. The description is what determines whether the agent gets selected.
- **Include examples in the body.** Show the agent what good output looks like. If you want a specific format, demonstrate it.
- **Use `permissionMode: bypassPermissions` sparingly.** Reserve it for autonomous pipeline agents that run end-to-end without human oversight.
- **Prefer `sonnet` as the default model.** Only override to `opus` for tasks that need deep reasoning (design interpretation, architecture planning, complex multi-file refactoring).
- **Test with real tasks.** The best way to refine an agent is to use it on actual work and iterate on the description and body based on what you observe.
