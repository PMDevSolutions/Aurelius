# Hook System

Hooks are shell scripts that run automatically after Claude Code tool-use events. They provide automated reminders and guards without requiring manual intervention. Each hook lives in its own file under `.claude/hooks/` and is wired into `.claude/settings.json`.

## How Hooks Fire

The `PostToolUse` event fires every time the Bash tool completes inside Claude Code. The runtime iterates through every hook with `"matcher": "Bash"` and executes each one with two positional arguments:

| Argument | Contents |
|----------|----------|
| `$1` (`TOOL_INPUT`) | The command that was run, e.g. `git commit -m "content: add launch post"` |
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

Every hook is a file under `.claude/hooks/` so it can be edited, reviewed, and tested in isolation.

## Execution Order

Hooks run **sequentially** in the order they appear in the `hooks` array. The current order is:

1. `pre-commit-brand-guard.sh`
2. `editorial-qa-reminder.sh`
3. `approval-gate-guard.sh`

Each hook is independent — one hook's output does not influence the next. Hooks must complete quickly (target: under 2 seconds each); they run after every matching Bash tool use.

## Built-In Hooks

| Hook script | Triggers when | Action |
|-------------|---------------|--------|
| `pre-commit-brand-guard.sh` | `git commit` in input, lockfile + staged content/ files present | Runs `brand-voice-lint.js` on staged Markdown, prints violations as a warning |
| `editorial-qa-reminder.sh` | `brand-voice-lint.js` in input + a clean (`✓ … clean`) output | Reminds that readability and fact-check/SEO complete the editorial QA trio |
| `approval-gate-guard.sh` | Publish/send/spend-shaped commands (platform APIs, `--publish`/`--send`/`--schedule` flags) | Warns that human approval must be on record before any external action |

All three are **informational** — they always exit 0 and never block. The hard stops live in the pipeline gates (editorial QA blockers, the human approval gate) and the husky pre-commit, not in PostToolUse hooks.

## The Defensive Skeleton

Every hook follows the same defensive pattern so a hook bug can never break a session:

```bash
#!/usr/bin/env bash
# <name>.sh — one-line purpose.
# Args: $1 = TOOL_INPUT, $2 = TOOL_OUTPUT
set -u                 # undefined vars are bugs…
trap 'exit 0' ERR      # …but any error still exits 0 (hooks never break the session)

TOOL_INPUT="${1:-}"

case "$TOOL_INPUT" in
  *"the trigger pattern"*) ;;   # match → continue
  *) exit 0 ;;                  # no match → silent success
esac

# Guard preconditions (files, commands) with graceful exits:
[ -f "some-required-file" ] || exit 0

echo "The reminder text."
exit 0                 # ALWAYS exit 0
```

Rules:
- **Always exit 0** — even on internal errors (`trap 'exit 0' ERR`)
- **Silent by default** — print only when the trigger genuinely matches
- **Fast** — pattern-match first, do work only after the match
- **Self-contained** — no sourcing project libs; a hook must run from any cwd state
- **Portable** — bash 3.2-compatible (macOS default): no `${var,,}`, no `mapfile`

## Creating a Custom Hook

1. Write the script at `.claude/hooks/<name>.sh` following the skeleton
2. Register it in `.claude/settings.json` with a clear `description`
3. Add its firing/silent cases to `scripts/__tests__/hooks.test.js`:

```js
it("fires on <the trigger>", () => {
  const out = runHook("<name>.sh", "<matching input>", "<matching output>");
  expect(out).toContain("<expected text>");
});

it("stays silent otherwise", () => {
  expect(runHook("<name>.sh", "ls -la", "")).toBe("");
});
```

4. Run `pnpm test` — the contract suite also asserts every hook exits 0 on junk and empty input

## Testing Hooks in Isolation

```bash
bash .claude/hooks/approval-gate-guard.sh \
  "curl -X POST https://api.mailchimp.com/3.0/campaigns/x/actions/send" ""
# → prints the approval-gate reminder, exits 0

bash .claude/hooks/approval-gate-guard.sh "ls -la" ""
# → prints nothing, exits 0
```

## Design Philosophy

Hooks are the framework's ambient conscience, not its enforcement arm. They make the right next step easy to remember (run the QA trio, record the approval) while the pipeline's gates make the wrong step hard to take. Keep hooks few, fast, and quiet — a hook that fires too often trains people to ignore all of them.
