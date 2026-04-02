# Hook System

Hooks are shell commands that run automatically after Claude Code tool-use events. They provide automated reminders, guards, and quality checks without requiring manual intervention. All hooks are configured in `.claude/settings.json`.

## How Hooks Fire

The `PostToolUse` event fires every time the Bash tool completes inside Claude Code. When this happens, the runtime iterates through all hooks with `"matcher": "Bash"` and executes each one. Two environment variables are available to every hook command:

| Variable | Contents |
|----------|----------|
| `$TOOL_INPUT` | The command that was run (e.g. `pnpm build`, `git commit -m "feat: add hero"`) |
| `$TOOL_OUTPUT` | The stdout/stderr returned by the command |

Each hook uses `grep` or other pattern-matching against these variables to decide whether to print a message. If the hook produces output, the message is shown to the user. If it produces no output, the hook passes silently.

## Hook Configuration Format

Hooks live in the `hooks` object inside `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"pattern\"; then echo \"[hook-name] message\"; fi'",
            "description": "Human-readable description"
          }
        ]
      }
    ]
  }
}
```

Each hook entry has three fields:

| Field | Purpose |
|-------|---------|
| `type` | Always `"command"` |
| `command` | The shell command to execute. Receives `$TOOL_INPUT` and `$TOOL_OUTPUT` |
| `description` | Shown to users in Claude Code. Describe what the hook does |

## Execution Order

All hooks in the array run sequentially after the Bash tool completes. Execution follows array position in `settings.json` -- the first entry runs first, the second runs second, and so on. Each hook is independent; one hook's output does not affect another.

A hook that prints text shows a visible message. A hook that prints nothing passes silently. Both outcomes are normal.

## Built-In Hooks

The framework ships with 8 hooks covering build quality, commit safety, and testing reminders:

| Hook | Trigger | Action |
|------|---------|--------|
| Post-build QA | `pnpm build` succeeds (`built in` in output) | Reminds to run quality gate: vitest, tsc, verify-tokens |
| Pre-commit token guard | `git commit` detected in input | Runs `verify-tokens.sh`, warns if violations found |
| Dark mode reminder | `visual-diff.js` in input + `PASS` in output | Suggests running `check-dark-mode.sh` |
| Coverage enforcement | `vitest` in input + `Coverage` in output | Reminds to check 80% threshold from pipeline.config.json |
| Lighthouse CI | `pnpm build` succeeds | Suggests Lighthouse audit with thresholds from config (perf=80, a11y=90) |
| Bundle size guard | `git commit` + build dir exists | Checks dir size against `maxSizeKb` from config, warns if exceeded |
| Mutation testing reminder | `vitest` + `Tests N passed` in output | Suggests Stryker if `mutationTesting.reminder` is true in config |
| Regression reminder | `pnpm build` succeeds | Calls `regression-reminder.sh` to suggest regression tests if baselines exist |

Notice the pattern: most hooks match on both `$TOOL_INPUT` (what command ran) and `$TOOL_OUTPUT` (what it returned). Matching on both reduces false triggers.

## Creating a Custom Hook

### Step by step

1. Open `.claude/settings.json`
2. Find the `hooks.PostToolUse[0].hooks` array
3. Add a new object with `type`, `command`, and `description`
4. Write a bash command that pattern-matches `$TOOL_INPUT` and/or `$TOOL_OUTPUT`
5. Test by running the triggering command in Claude Code

### Example: Changelog reminder after git tag

```json
{
  "type": "command",
  "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"git tag\"; then echo \"[changelog] New tag created. Remember to update CHANGELOG.md\"; fi'",
  "description": "Remind to update changelog after creating git tags"
}
```

### Example: Warn when installing a new dependency

```json
{
  "type": "command",
  "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"pnpm add\"; then echo \"[dep-check] New dependency added. Run ./scripts/check-security.sh to audit.\"; fi'",
  "description": "Suggest security audit after adding dependencies"
}
```

## Hook Scripts Directory

When a hook grows too complex for a single inline bash command, extract the logic to a script file in `.claude/hooks/` and call it from settings.json.

The regression reminder hook demonstrates this pattern. Instead of cramming file-counting logic into a JSON string, it delegates to a script:

```json
{
  "type": "command",
  "command": "bash .claude/hooks/regression-reminder.sh \"$TOOL_INPUT\" \"$TOOL_OUTPUT\"",
  "description": "Reminds to run visual regression tests after successful builds"
}
```

The script at `.claude/hooks/regression-reminder.sh` receives the two arguments, does its grep checks and baseline counting, and echoes a message only when appropriate.

When writing hook scripts:
- Accept `$1` (tool input) and `$2` (tool output) as positional arguments
- Echo a message when the hook should fire; print nothing otherwise
- Exit with code 0 in all cases

## Best Practices

- **Keep hooks fast.** They run after every matching Bash tool use. Aim for under 2 seconds.
- **Exit 0 for reminders.** Hooks are informational. Use exit code 0 so they never block the workflow.
- **Match carefully.** Pattern-match on both `$TOOL_INPUT` and `$TOOL_OUTPUT` when possible to avoid false triggers.
- **Prefix output with `[hook-name]`.** This makes it easy to identify which hook produced a message.
- **Extract complex logic.** If your command exceeds one or two conditions, move it to a script in `.claude/hooks/`.
- **Read thresholds from config.** When a hook checks a limit (bundle size, coverage), read it from `pipeline.config.json` rather than hardcoding.

## Troubleshooting

**Hook not firing**
Check that your `grep` pattern matches the actual command string. Test it manually:
```bash
echo "pnpm build --production" | grep -q "pnpm build" && echo "match"
```
If the pattern uses special characters, make sure they are properly escaped inside the JSON string.

**Hook firing too often**
Tighten the pattern. Match on both input and output instead of just one:
```bash
# Too broad -- fires on any vitest run
if echo "$TOOL_INPUT" | grep -q "vitest"; then ...

# Better -- only fires when coverage output is present
if echo "$TOOL_INPUT" | grep -q "vitest" && echo "$TOOL_OUTPUT" | grep -q "Coverage"; then ...
```

**Hook blocking workflow**
Make sure the hook script always exits with code 0. A non-zero exit code may interrupt Claude Code's execution flow.

**Hook output not visible**
The hook must echo to stdout. Check for quoting issues in the JSON command string -- mismatched quotes are the most common cause of silent failures. Test the command directly in a terminal first.
