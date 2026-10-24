#!/usr/bin/env bash
# pipeline-helpers.sh — Aurelius helpers shared by the hooks under .claude/hooks/.
#
# Source after lib/hook-io.sh, then call hook_read_input and hook_read_context:
#
#   source "$HOOK_DIR/lib/hook-io.sh"
#   source "$HOOK_DIR/lib/pipeline-helpers.sh"
#   hook_read_input
#   hook_read_context
#
# An Aurelius app can live at the project root or in a folder beside it
# (./scripts/setup-project.sh my-app), so the hooks resolve the directory a
# command acts on instead of assuming the project root. Every function prints a
# value or nothing and never fails, so a hook can always `exit 0`.

pipeline_base_dir() {
  # The directory the tool call runs in: the event's cwd, else the project dir.
  if [ -n "${HOOK_CWD:-}" ] && [ -d "$HOOK_CWD" ]; then
    printf '%s' "$HOOK_CWD"
  else
    hook_project_dir
  fi
}

pipeline_app_dir() {
  # $1 = command text. The directory the command acts on: a leading
  # `cd <dir> &&` or a `git -C <dir>`, resolved against pipeline_base_dir.
  local cmd="${1:-}" base dir
  base="$(pipeline_base_dir)"
  dir="$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^;&|]*[^;&|[:space:]])[[:space:]]*(&&|;).*/\1/p' | head -1)"
  [ -n "$dir" ] || dir="$(printf '%s' "$cmd" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+([^[:space:];&|]+).*/\1/p' | head -1)"
  dir="${dir#\"}"; dir="${dir%\"}"; dir="${dir#\'}"; dir="${dir%\'}"
  if [ -z "$dir" ]; then
    printf '%s' "$base"
    return 0
  fi
  case "$dir" in
    /*) ;;
    "~"|"~/"*) dir="$HOME${dir#\~}" ;;
    *) dir="$base/$dir" ;;
  esac
  (cd "$dir" 2>/dev/null && pwd) || printf '%s' "$base"
}

pipeline_config_file() {
  # $1 = app dir. The pipeline.config.json that governs it: the app's own, else
  # the project's. Prints nothing outside an Aurelius project, which is how the
  # hooks stay quiet in other repos that install Aurelius as a plugin.
  local d
  for d in "${1:-}" "$(hook_project_dir)"; do
    if [ -n "$d" ] && [ -f "$d/.claude/pipeline.config.json" ]; then
      printf '%s' "$d/.claude/pipeline.config.json"
      return 0
    fi
  done
  return 0
}

pipeline_config_get() {
  # $1 = config file  $2 = dotted path (tdd.coverageThreshold)  $3 = default.
  # `false` and `0` are values, not missing ones.
  local file="${1:-}" path="${2:-}" def="${3:-}" v=""
  if [ -n "$file" ] && [ -f "$file" ]; then
    if command -v jq >/dev/null 2>&1; then
      v="$(jq -r --arg p "$path" 'getpath($p | split(".")) | if . == null then empty else tostring end' "$file" 2>/dev/null || true)"
    elif command -v node >/dev/null 2>&1; then
      v="$(node -e '
        let c; try { c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
        for (const k of process.argv[2].split(".")) { if (c == null) break; c = c[k]; }
        if (c != null) process.stdout.write(String(c));
      ' "$file" "$path" 2>/dev/null || true)"
    fi
  fi
  if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "$def"; fi
}

pipeline_bash_output() {
  # stdout and stderr of the Bash call in a PostToolUse event. Bash reports an
  # object ({stdout, stderr, interrupted, isImage}); fall back to the whole
  # tool_response for any other shape.
  local out err
  out="$(hook_json_get tool_response.stdout)"
  err="$(hook_json_get tool_response.stderr)"
  if [ -n "$out$err" ]; then
    printf '%s\n%s' "$out" "$err"
  else
    printf '%s' "${TOOL_RESPONSE:-}"
  fi
}

pipeline_is_build_command() {
  # $1 = command. True for `pnpm build` and `pnpm run build` (also with
  # --filter/--dir), not for build-storybook or build:* scripts.
  printf '%s' "${1:-}" | grep -Eq '(^|[[:space:];&|(])pnpm([[:space:]]+(--filter|-F|--dir|-C)[[:space:]]+[^[:space:]]+)*[[:space:]]+(run[[:space:]]+)?build([[:space:];&|)]|$)'
}

pipeline_build_succeeded() {
  # $1 = build output. True when it reports success and no failure (the Bash
  # event carries no exit code, so the output is the evidence).
  if printf '%s' "${1:-}" | grep -Eqi 'error during build|failed to compile|build failed|ELIFECYCLE|command failed'; then
    return 1
  fi
  printf '%s' "${1:-}" | grep -Eq 'built in|[Cc]ompiled successfully|[Bb]uild complete|Successfully compiled|Generating static pages'
}
