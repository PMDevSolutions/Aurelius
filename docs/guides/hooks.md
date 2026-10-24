# Hook System

Hooks are shell scripts that Claude Code runs at fixed points in a session: before and after a tool call, and when a session starts. Aurelius uses them for one hard gate (deploys and releases), one commit gate (the design-token lockfile), a status block at session start, and short reminders that keep the quality gate in view. Each hook lives in its own file under `.claude/hooks/`, is registered in `.claude/settings.json`, and has tests in `scripts/__tests__/hooks.test.js`.

## How Hooks Fire

Claude Code passes each event to the hook as **JSON on stdin** and reads **JSON on stdout** (see the [hooks reference](https://code.claude.com/docs/en/hooks)). A `PreToolUse` event for a Bash call looks like this:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "vercel --prod" },
  "cwd": "/Users/you/Repos/Aurelius",
  "permission_mode": "default",
  "agent_id": "only present inside a subagent"
}
```

`PostToolUse` adds `tool_response`, which for Bash is an object with `stdout`, `stderr`, `interrupted` and `isImage`. There is no exit code, so the reminders read the output to decide whether a build or test run succeeded.

A hook answers with one of three shapes, or prints nothing:

| Reply | Shape | Effect |
|-------|-------|--------|
| Decision (`PreToolUse` only) | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"…"}}` | `ask` prompts the human, `deny` blocks the call and shows Claude the reason |
| Context for Claude | `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}` | The text reaches Claude beside the tool result |
| Plain text (`SessionStart` only) | Any text | Added to the session's context |

Plain stdout from a `PreToolUse` or `PostToolUse` hook goes to the debug log, not to Claude. Before the move to this contract, the hooks read `$TOOL_INPUT` and `$TOOL_OUTPUT` as positional arguments. Claude Code never sets those, so every hook received empty strings and none of them ever fired.

## Hook Configuration Format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git commit *)",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-commit-token-guard.sh",
            "timeout": 30,
            "statusMessage": "Checking the commit against the token lockfile"
          }
        ]
      }
    ]
  }
}
```

| Field | Purpose |
|-------|---------|
| `matcher` | Tool name (or `startup\|resume\|clear\|compact` for `SessionStart`) |
| `if` | One permission rule that filters the call before the script starts. Compound commands match when any subcommand does, so `Bash(git commit *)` fires on `git add -A && git commit -m x`. It is a cheap pre-filter, and each script still checks the command itself |
| `command` | Always `bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/<name>.sh`, quoted, so it works from worktrees and cloud sessions |
| `timeout` | Seconds before Claude Code cancels the hook |
| `onFailure` | `"block"` on the deploy guard: if it cannot start, times out or prints invalid output, the call is blocked rather than let through. Other hooks keep the default `"continue"`, so a broken reminder never stops work |
| `statusMessage` | Spinner text while the hook runs |

`.claude/hooks/hooks.json` holds the same registrations with `${CLAUDE_PLUGIN_ROOT}` paths for installs of Aurelius as a plugin. Keep the two in sync; a test fails when they differ.

## Built-In Hooks

| Hook | Event (filter) | Action |
|------|----------------|--------|
| `deploy-guard.sh` | `PreToolUse` Bash, every call, fail-closed | `ask` before production deploys, publishes, releases, store submissions, PR merges, workflow dispatches, force pushes and pushes to the default branch or a tag; a reminder on preview deploys; in a subagent, `deny` for all of these and for any push |
| `agent-no-deploy.sh` | `PreToolUse` Bash, in agent frontmatter | Runs the deploy guard in subagent mode for agents whose work touches deploys, releases or publishing |
| `pre-commit-token-guard.sh` | `PreToolUse` Bash (`git commit *`) | Runs `verify-tokens.sh` and `deny`s the commit when a file it carries has a hardcoded color, pixel value or inline style |
| `bundle-size-guard.sh` | `PreToolUse` Bash (`git commit *`) | Reminds Claude when the build's JavaScript and CSS exceed `bundleSize.maxSizeKb`; the commit proceeds |
| `post-build-qa.sh` | `PostToolUse` Bash (`pnpm *build*`) | After a successful build, reminds Claude to run the quality gate |
| `lighthouse-ci.sh` | `PostToolUse` Bash (`pnpm *build*`) | After a successful build, names the Lighthouse thresholds from the config |
| `regression-reminder.sh` | `PostToolUse` Bash (`pnpm *build*`) | After a successful build, suggests `regression-test.sh` when baselines exist |
| `coverage-check.sh` | `PostToolUse` Bash (`*vitest*`) | Compares statement coverage with `tdd.coverageThreshold` and speaks only when it is below, or when the table is unreadable |
| `mutation-test-reminder.sh` | `PostToolUse` Bash (`*vitest*`) | After a fully passing run, suggests Stryker when `mutationTesting.reminder` is `true` |
| `dark-mode-reminder.sh` | `PostToolUse` Bash (`*visual-diff*`) | After a passing visual diff, suggests `check-dark-mode.sh` |
| `session-context.sh` | `SessionStart` | Adds a status block: a pipeline run in flight and where it resumes (`.claude/plans/pipeline-state.json`), the build spec, token lockfiles, visual baselines, and uncommitted work on `main` |

Every hook except the deploy guard is silent outside an Aurelius project, meaning a directory with no `.claude/pipeline.config.json`. That keeps them quiet in other repos that install Aurelius as a plugin. Apps can live at the project root or in a folder beside the framework (`./scripts/setup-project.sh my-app`). The hooks resolve the folder a command acts on from a leading `cd <dir> &&` or a `git -C <dir>`, then fall back to the event's `cwd`.

### The deploy guard

The guard is the runtime half of a rule: nothing reaches users, a registry or `main` without a human deciding it. `lib/deploy-classify.mjs` splits the command the way the shell does, so a commit message that mentions `vercel --prod` is text, not a deploy. It then sorts what actually runs into three tiers:

| Tier | Examples | Main session | Subagent |
|------|----------|--------------|----------|
| gate | `vercel --prod`, `netlify deploy --prod`, `wrangler deploy`, `firebase deploy`, `eas submit`, `npm publish`, `changeset publish`, `pnpm release`, `gh release create`, `gh pr merge`, `gh workflow run`, `git push --force`, `git push origin main`, tag pushes, `docker push`, `aws s3 sync … s3://` | `ask` | `deny` |
| preview | `vercel`, `netlify deploy`, `wrangler pages deploy --branch feat-x`, `eas update --branch preview` | reminder | `deny` |
| outward | `git push` of a feature branch, `gh pr create`, `gh issue comment` | silent | `deny` |

Any command with `--dry-run` passes. In `bypassPermissions` and `dontAsk`, where a hook cannot prompt, an `ask` becomes a `deny` that says to run the command from a session in default or auto mode. In `claude -p`, nobody can answer the prompt, so the call is refused. Plugin agents ignore hooks in their frontmatter, so the settings-level guard reads `agent_id` from the event and denies in every subagent on its own.

## Hook Script Anatomy

```bash
#!/usr/bin/env bash
# my-hook.sh — PostToolUse hook (matcher: Bash, if: "Bash(pnpm test*)").
# What it reacts to and what it returns.
#
# Input: the hook event as JSON on stdin. Output: JSON on stdout, or nothing.
# Always exits 0.
set -u
trap 'exit 0' ERR

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/hook-io.sh
source "$HOOK_DIR/lib/hook-io.sh"
# shellcheck source=lib/pipeline-helpers.sh
source "$HOOK_DIR/lib/pipeline-helpers.sh"

hook_read_input      # HOOK_JSON, TOOL_NAME, TOOL_COMMAND, TOOL_FILE_PATH, TOOL_RESPONSE
hook_read_context    # HOOK_PERMISSION_MODE, HOOK_AGENT_ID, HOOK_AGENT_TYPE, HOOK_CWD

[ "$TOOL_NAME" = "Bash" ] || exit 0
case "$TOOL_COMMAND" in *"pnpm test"*) ;; *) exit 0 ;; esac
CONFIG="$(pipeline_config_file "$(pipeline_app_dir "$TOOL_COMMAND")")"
[ -n "$CONFIG" ] || exit 0

hook_additional_context PostToolUse "[my-hook] reminder text for Claude"
exit 0
```

| Piece | Why |
|-------|-----|
| `set -u`, `trap 'exit 0' ERR`, final `exit 0` | A hook bug must never break a session |
| `lib/hook-io.sh` | The stdin/stdout contract, shared with Maecenas: `hook_read_input`, `hook_read_context`, `hook_json_get`, and the emitters `hook_pretooluse_decision`, `hook_gate_decision`, `hook_additional_context`, `hook_system_message` |
| `lib/pipeline-helpers.sh` | Aurelius helpers: `pipeline_app_dir`, `pipeline_config_file`, `pipeline_config_get` (`false` and `0` count as values), `pipeline_bash_output`, `pipeline_is_build_command`, `pipeline_build_succeeded` |
| `[hook-name]` prefix | Makes it clear which hook produced a reminder |

The scripts run on the macOS system bash (3.2) as well as Linux bash 5, so avoid `${var,,}`, `mapfile` and associative arrays.

## Creating a Custom Hook

1. Write `.claude/hooks/my-hook.sh` from the skeleton above and `chmod +x` it.
2. Register it in `.claude/settings.json` with a narrow `if` filter, and add the same entry, with a `${CLAUDE_PLUGIN_ROOT}` path, to `.claude/hooks/hooks.json`.
3. Test it by piping an event in:

```bash
# Trigger case
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"pnpm test"},"tool_response":{"stdout":"ok","stderr":""}}' \
  | CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/my-hook.sh
# → {"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[my-hook] …"}}

# Robustness
printf '' | bash .claude/hooks/my-hook.sh; echo "exit $?"      # → exit 0, no output
printf '{bad' | bash .claude/hooks/my-hook.sh; echo "exit $?"  # → exit 0, no output
```

4. Add cases to `scripts/__tests__/hooks.test.js`. Add the script to `HOOKS` there; the contract tests then check exit codes, empty input and malformed input for it.
5. Run `node scripts/claude-code-conformance.js`, which fails on hooks that still use the positional-argument contract, unknown events and missing scripts.

## Best Practices

- **Gate with `PreToolUse`, remind with `PostToolUse`.** A `PostToolUse` hook fires after the command ran, so it can only inform. Anything that protects something (a deploy, the lockfile) belongs before the call, as `ask` or `deny`.
- **Filter with `if`.** Every unfiltered Bash hook starts a process on every Bash call.
- **Return context, not plain text.** Reminders go to Claude through `additionalContext`; plain stdout never reaches it.
- **Read thresholds from `pipeline.config.json`** with `pipeline_config_get` and a default.
- **Stay silent outside Aurelius projects**, so the plugin build does not talk in other repos.

## Troubleshooting

**Hook not firing.** Run `/hooks` in Claude Code to see what is registered, then pipe a sample event into the script (above). `claude --debug` logs each hook run with its output. A hook registered in `settings.json` after the session started may need `/hooks` or a new session to load.

**Reminder not reaching Claude.** The hook printed plain text. Use `hook_additional_context`.

**Deploy guard asking on something harmless.** Check what the classifier sees: `printf '%s' '<command>' | node .claude/hooks/lib/deploy-classify.mjs --cwd .` prints the tier and reason. Fix the rule in `lib/deploy-classify.mjs` and add the case to the classifier tests.

**Hook script not executable.** Run `chmod +x .claude/hooks/<name>.sh`. The `bash <path>` invocation works without the bit, but the contract test checks it.
