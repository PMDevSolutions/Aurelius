# Hook System

Hooks are shell scripts that run automatically after Claude Code tool-use events. They provide automated reminders, guards, and quality checks without requiring manual intervention. Each hook lives in its own file under `.claude/hooks/` and is wired into `.claude/settings.json`.

## How Hooks Fire

The `PostToolUse` event fires every time the Bash tool completes inside Claude Code. The runtime iterates through every hook with `"matcher": "Bash"` and executes each one with two positional arguments:

| Argument | Contents |
|----------|----------|
| `$1` (`TOOL_INPUT`) | The command that was run, e.g. `pnpm build` or `git commit -m "feat: add hero"` |
| `$2` (`TOOL_OUTPUT`) | The stdout/stderr returned by that command |

Each hook pattern-matches these inputs to decide whether to print a reminder. Output on stdout is shown to the user; no output means the hook stayed silent.

## Hook Configuration Format

Hooks live in `hooks.PostToolUse[].hooks[]` in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/<hook-name>.sh \"$TOOL_INPUT\" \"$TOOL_OUTPUT\"",
            "description": "Human-readable summary"
          }
        ]
      }
    ]
  }
}
```

| Field | Purpose |
|-------|---------|
| `type` | Always `"command"` |
| `command` | Invokes the hook script, passing the two tool variables as positional args |
| `description` | Shown to users in Claude Code; describe what the hook does in plain English |

Old inline shell snippets (`bash -c '...'`) are no longer used. Every hook is a file under `.claude/hooks/` so it can be edited, reviewed, and tested in isolation.

## Execution Order

Hooks run **sequentially** in the order they appear in the `hooks` array. The first entry runs first, the second runs second, and so on. The current order is:

1. `post-build-qa.sh`
2. `pre-commit-token-guard.sh`
3. `dark-mode-reminder.sh`
4. `coverage-check.sh`
5. `lighthouse-ci.sh`
6. `bundle-size-guard.sh`
7. `mutation-test-reminder.sh`
8. `regression-reminder.sh`

Each hook is independent — one hook's output does not influence the next. Reordering the array changes only the visual order of reminders in the terminal.

Hooks must complete quickly (target: under 2 seconds each). They run after every matching Bash tool use, so a slow hook becomes a tax on the whole session.

## Built-In Hooks

| Hook script | Triggers when | Action |
|-------------|---------------|--------|
| `post-build-qa.sh` | `pnpm build` succeeds (`built in` in output) | Reminds to run quality gate (vitest, tsc, verify-tokens) |
| `pre-commit-token-guard.sh` | `git commit` detected in input | Runs `verify-tokens.sh`, surfaces violations |
| `dark-mode-reminder.sh` | `visual-diff.js` + `PASS` in output | Suggests `check-dark-mode.sh` |
| `coverage-check.sh` | `vitest` + `Coverage` in output | Reminds to verify against `tdd.coverageThreshold` |
| `lighthouse-ci.sh` | `pnpm build` succeeds | Suggests Lighthouse audit using thresholds from config |
| `bundle-size-guard.sh` | `git commit` and a build dir exists | Warns if build dir exceeds `bundleSize.maxSizeKb` |
| `mutation-test-reminder.sh` | `vitest` + passing-tests line | Suggests Stryker when `mutationTesting.reminder` is `true` |
| `regression-reminder.sh` | `pnpm build` succeeds | Suggests regression test if baselines exist |

Most hooks match on **both** `$TOOL_INPUT` (what command ran) and `$TOOL_OUTPUT` (what it returned) to keep false triggers down.

## Hook Script Anatomy

Every hook follows the same skeleton:

```bash
#!/usr/bin/env bash
# my-hook.sh — short description of what this hook does
#
# Args:
#   $1  TOOL_INPUT
#   $2  TOOL_OUTPUT
#
# Exit: always 0.

set -u
TOOL_INPUT="${1:-}"
TOOL_OUTPUT="${2:-}"
trap 'exit 0' ERR

# Decide whether to fire.
if echo "$TOOL_INPUT" | grep -q "<trigger>"; then
  echo "[my-hook] reminder text"
fi

exit 0
```

The defensive bits matter:

| Pattern | Why |
|---------|-----|
| `set -u` | Catches typos / unset variables early, preventing silent skips |
| `${1:-}` defaults | Tolerates being called with no args (e.g. from a test) |
| `trap 'exit 0' ERR` | Any unexpected runtime error exits silently rather than crashing |
| Final `exit 0` | Hooks are informational and must never block the workflow |
| `[hook-name]` prefix | Makes it easy to identify which hook produced a message in the terminal |

Reading thresholds from `pipeline.config.json` follows the same defensive pattern: try Node, fall back to a hard-coded default if `node` is unavailable or the field is missing.

```bash
THRESHOLD=80
if [ -f .claude/pipeline.config.json ] && command -v node >/dev/null 2>&1; then
  PARSED="$(node -e 'const c=require("./.claude/pipeline.config.json"); console.log(c.tdd?.coverageThreshold ?? 80);' 2>/dev/null)" || PARSED=""
  [ -n "$PARSED" ] && THRESHOLD="$PARSED"
fi
```

## Creating a Custom Hook

### 1. Write the script

Create `.claude/hooks/my-hook.sh`. Use the skeleton above and `chmod +x` it:

```bash
chmod +x .claude/hooks/my-hook.sh
```

### 2. Register it in settings.json

Append a new entry to `hooks.PostToolUse[0].hooks`:

```json
{
  "type": "command",
  "command": "bash .claude/hooks/my-hook.sh \"$TOOL_INPUT\" \"$TOOL_OUTPUT\"",
  "description": "What the hook does (shown to users)"
}
```

### 3. Test in isolation

Hooks accept tool input and output as plain args, so you can run them directly:

```bash
# Trigger case
bash .claude/hooks/my-hook.sh "pnpm test" "Tests  42 passed"
# → expected: prints reminder, exit 0

# No-trigger case
bash .claude/hooks/my-hook.sh "ls" "file.txt"
# → expected: prints nothing, exit 0

# Robustness
bash .claude/hooks/my-hook.sh
# → expected: prints nothing, exit 0 (no crash on missing args)
```

For automated coverage, add a vitest spec under `scripts/__tests__/hooks.test.js`. The existing file is a good template — it spins up a temp project, invokes each hook with controlled inputs, and asserts on stdout + exit code.

### Example — changelog reminder after git tag

`.claude/hooks/changelog-reminder.sh`:

```bash
#!/usr/bin/env bash
set -u
TOOL_INPUT="${1:-}"
trap 'exit 0' ERR

if echo "$TOOL_INPUT" | grep -q "git tag"; then
  echo "[changelog-reminder] New tag created. Update CHANGELOG.md if you haven't."
fi
exit 0
```

`.claude/settings.json` addition:

```json
{
  "type": "command",
  "command": "bash .claude/hooks/changelog-reminder.sh \"$TOOL_INPUT\" \"$TOOL_OUTPUT\"",
  "description": "Remind to update changelog after creating git tags"
}
```

## Best Practices

- **Keep hooks fast** — under 2 seconds each. They run on every matching Bash tool use.
- **Always `exit 0`** — hooks are informational, never blocking. A non-zero exit may interrupt Claude Code's flow.
- **Match on both input and output** when possible — single-side matching causes false triggers.
- **Prefix output with `[hook-name]`** — makes terminal messages skimmable.
- **Read thresholds from config** — never hard-code. Fall back to a default if the config or `node` is unavailable.
- **Use `set -u` and `trap 'exit 0' ERR`** — catches typos and absorbs unexpected errors.
- **Tolerate missing tooling** — guard each external command with `command -v` and `[ -f ... ]` checks.

## Troubleshooting

**Hook not firing**
Test the trigger pattern manually:
```bash
echo "pnpm build --production" | grep -q "pnpm build" && echo "match"
```
If the script is the issue, run it directly with sample inputs (`bash .claude/hooks/foo.sh "..." "..."`).

**Hook firing too often**
Tighten the pattern — match on both input and output instead of one:
```bash
# Too broad — fires on any vitest run
if echo "$TOOL_INPUT" | grep -q "vitest"; then ...

# Better — only fires when coverage output is present
if echo "$TOOL_INPUT" | grep -q "vitest" && echo "$TOOL_OUTPUT" | grep -q "Coverage"; then ...
```

**Hook blocking workflow**
Confirm the script ends with `exit 0` and uses `trap 'exit 0' ERR`. Avoid `set -e` — it makes the hook exit non-zero on any failed command.

**Hook output not visible**
The hook must echo to stdout, not stderr. Run the script directly in a terminal to confirm it produces output. Also double-check the settings.json command quoting — escaped quotes around `$TOOL_INPUT` are required so the shell expands the variable but treats it as one argument.

**Hook script not executable**
Run `chmod +x .claude/hooks/<name>.sh`. The `bash <path>` invocation in settings.json also works without the executable bit, but committing the bit avoids confusion when running the script directly.
