# Claude Code Plugins Reference

**Last Updated:** 2026-10-24

Aurelius needs no plugin to work: its agents, skills, hooks and workflow live in this repo's `.claude/` directory. This page covers two things: Aurelius itself as a plugin that other repos install, and the optional plugins and MCP servers that work well beside it.

---

## Aurelius as a plugin

`.claude-plugin/plugin.json` packages the repo as the `aurelius` plugin, pointing at the live `.claude/agents` files, `.claude/skills`, `.claude/hooks/hooks.json` and `.claude/workflows`, so the project and the plugin share one source. `.claude-plugin/marketplace.json` lists it in an `aurelius` marketplace.

```bash
/plugin install aurelius --marketplace PMDevSolutions/Aurelius   # one step, Claude Code 2.1.275+

claude plugin marketplace add PMDevSolutions/Aurelius            # or in two steps
claude plugin install aurelius@aurelius --scope project

claude plugin validate .   # from this repo, after changing the manifest
```

`claude plugin validate .` passes with one warning (`CLAUDE.md` at the plugin root is this repo's project file and is not loaded into plugin context). Its plugin-directory checks also note the missing icon and privacy policy URL, which matter only for a listing in Anthropic's plugin directory.

What a consuming repo gets:

| Part | In another repo |
|------|-----------------|
| Agents | All of them, namespaced: `aurelius:frontend-developer`, `aurelius:visual-qa-agent`, … |
| Knowledge skills | Work anywhere: `/aurelius:react-accessibility`, `/aurelius:state-management`, `/aurelius:form-handling`, … |
| Pipeline skills | `/aurelius:build-from-figma` and the other pipelines, `verify-all`, `ci` and the intake skills call `./scripts/…`, so they work only in an Aurelius checkout |
| Hooks | The deploy guard runs everywhere. The other hooks stay silent outside an Aurelius project (a repo without `.claude/pipeline.config.json`) |
| Workflow | `/aurelius:component-lanes`, which needs the pipeline's inputs |

A plugin always loads the `.mcp.json` at its root, so an install also brings this repo's `figma-desktop`, `figma` and `playwright` servers, with tools named `mcp__plugin_aurelius_<server>__*` (see [MCP servers the agents expect](#mcp-servers-the-agents-expect)).

Plugin agents ignore the `hooks`, `mcpServers` and `permissionMode` fields of their frontmatter. The deploy guard in `hooks.json` covers them: it denies deploys, publishes, releases, merges and pushes in every subagent. An agent's `memory: local` writes to `.claude/agent-memory-local/<agent>/` in the consuming repo; ignore that path there too.

To keep an agent in this repo but out of the plugin, remove it from `agents` and add it to `metadata.excludedAgents`; `node scripts/claude-code-conformance.js` checks that every agent is in one list or the other. `.versionrc.json` bumps the manifest's `version` with each release.

---

## Optional plugins

From the official marketplace (`claude-plugins-official`, registered by default):

| Plugin | Why it fits |
|--------|-------------|
| `typescript-lsp` | Code intelligence (definitions, references, type errors) for the TypeScript in `scripts/`, `packages/` and generated apps |
| `commit-commands` | `/commit`, `/commit-push-pr` and `/clean_gone`, the git shortcuts older Aurelius docs mention |
| `code-review`, `pr-review-toolkit` | Multi-agent review of a branch or pull request |
| `frontend-design` | Design direction for UI work without a design file |

```bash
claude plugin install typescript-lsp@claude-plugins-official
claude plugin install commit-commands@claude-plugins-official
```

---

## MCP servers the agents expect

The agents name whole servers in their `tools` lists: `mcp__figma__*`, `mcp__figma-desktop__*`, `mcp__playwright__*` and `mcp__chrome-devtools__*`. Those patterns match servers configured in `.mcp.json` or with `claude mcp add`. They do **not** match servers bundled in a plugin, whose tools are named `mcp__plugin_<plugin>_<server>__*`, so installing the `figma`, `playwright` or `chrome-devtools-mcp` plugins does not give these agents the tools.

| Server | Where it comes from |
|--------|---------------------|
| `figma-desktop` | `.mcp.json` (local, needs the Figma desktop app with Dev Mode) |
| `figma` | `.mcp.json` (remote fallback; call `create_session` before file tools) |
| `playwright` | `.mcp.json`. The committed entry runs `cmd /c npx …`, which works only on Windows; on macOS and Linux, add a user-scope server: `claude mcp add --scope user playwright -- npx @playwright/mcp@latest --headless` |
| `chrome-devtools` | Not in `.mcp.json`; add it yourself: `claude mcp add --scope user chrome-devtools -- npx chrome-devtools-mcp@latest` |
| Canva | The claude.ai Canva connector, used by the `canva-intake` skill in the main session |

---

## github (gh CLI)

GitHub integration for repos, PRs, issues, and actions. Not a plugin: the `gh` CLI, installed and authenticated (`gh auth login`).

```bash
gh pr create --title "Title" --body "Description"   # Create PR
gh pr list                            # List open PRs
gh issue create --title "Bug" --body "Details"      # Create issue
gh run list                           # List CI workflow runs
```

`gh pr merge`, `gh release create` and `gh workflow run` stop at the deploy guard for a human's decision.

---

## Security

- Never commit GitHub PATs or API keys
- Store secrets in environment variables or a credential manager
- Rotate tokens every 90 days
- Use fine-grained tokens with minimal scopes
- Check `.claude/settings.local.json` for configured permissions

---

## Quick reference

```bash
/plugin                                   # browse, install and manage plugins
claude plugin list                        # installed plugins
claude plugin install <name>@<marketplace> [--scope project]
claude plugin validate .                  # check this repo's manifest
claude plugin eval . --scaffold --allow-tools Write Edit Bash   # run evals/ (costs model calls)
```
