# common.sh — Shared bash helpers for scripts/*.sh
#
# Source this from any script:
#
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/lib/common.sh"
#
# Helpers preserve the exact output format already used across the codebase
# (=== Banners ===, ▸ steps, ✓ pass, ✗ fail, ⊘ skip, ⚠ warn). Existing tests
# assert these strings — do not change them.

# Avoid redefining if sourced more than once (e.g. by lib scripts that source
# each other).
if [[ -n "${__COMMON_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
__COMMON_SH_LOADED=1

# --- Project root ---------------------------------------------------------

# Resolve the repository root by walking up from this lib file. Scripts can
# either `cd "$(common_project_root)"` (matches `cd "$PROJECT_ROOT"` callers)
# or just read the value.
common_project_root() {
  local lib_dir
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "$lib_dir/../.." && pwd)
}

# --- Output helpers -------------------------------------------------------
#
# These mirror the prefixes already in use. Keep them ASCII-safe-prefixed:
# tests grep for literal "=== Title ===", "▸ ", "✓ ", "✗ ", "⊘ ", "⚠ ".

say_banner() {
  echo "=== $* ==="
}

say_step() {
  echo "▸ $*"
}

say_pass() {
  echo "  ✓ $*"
}

say_fail() {
  echo "  ✗ $*"
}

say_skip() {
  echo "  ⊘ $*"
}

say_warn() {
  echo "  ⚠ $*"
}

say_err() {
  echo "Error: $*" >&2
}

# --- Tool availability ----------------------------------------------------

# require_cmd <name> [install hint]
# Exits with status 1 if the command is not available.
require_cmd() {
  local cmd="$1"
  local hint="${2:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    say_err "$cmd not found on PATH."
    if [[ -n "$hint" ]]; then
      echo "  Install it with: $hint" >&2
    fi
    exit 1
  fi
}

# have_cmd <name> — returns 0/1 without exiting, useful for conditional logic.
have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# --- Tempfile tracking ----------------------------------------------------
#
# Pattern (note: cannot wrap mktemp in a function because $( ) subshells run
# the EXIT trap and would delete the file before the caller gets it back):
#
#   F=$(mktemp); common_track_tmpfile "$F"
#   D=$(mktemp -d); common_track_tmpfile "$D"
#
# An EXIT trap is registered exactly once on the first call.

__COMMON_TMPFILES=()
__COMMON_TRAP_SET=0

common_cleanup_tmpfiles() {
  local f
  for f in "${__COMMON_TMPFILES[@]+"${__COMMON_TMPFILES[@]}"}"; do
    [[ -e "$f" ]] && rm -rf "$f"
  done
}

common_track_tmpfile() {
  __COMMON_TMPFILES+=("$1")
  if [[ "$__COMMON_TRAP_SET" -eq 0 ]]; then
    trap common_cleanup_tmpfiles EXIT
    __COMMON_TRAP_SET=1
  fi
}

# --- Cross-platform timestamp --------------------------------------------

# Milliseconds since epoch. GNU date supports %N; macOS does not.
common_now_ms() {
  if date +%s%3N >/dev/null 2>&1; then
    date +%s%3N
  elif have_cmd python3; then
    python3 -c 'import time; print(int(time.time()*1000))'
  else
    echo "$(( $(date +%s) * 1000 ))"
  fi
}

# --- CSV helpers ----------------------------------------------------------

# common_csv_contains "a,b,c" "b" → 0/1
common_csv_contains() {
  local csv="$1"
  local needle="$2"
  [[ -z "$csv" ]] && return 1
  local parts part
  IFS=',' read -ra parts <<< "$csv"
  for part in "${parts[@]}"; do
    [[ "$(echo "$part" | tr -d ' ')" == "$needle" ]] && return 0
  done
  return 1
}

# --- Build artifact detection --------------------------------------------

# Returns 0 if any of dist/.next/build/out exists in the cwd.
common_build_artifact_exists() {
  local d
  for d in dist .next build out; do
    [[ -d "$d" ]] && return 0
  done
  return 1
}

# Returns 0 if at least one agent plugin (a dir with plugin.json) exists under
# .claude/agent-plugins/ in the cwd.
common_agent_plugins_exist() {
  local d
  for d in .claude/agent-plugins/*/plugin.json; do
    [[ -f "$d" ]] && return 0
  done
  return 1
}

# --- pipeline.config.json access -----------------------------------------
#
# Thin wrapper around scripts/lib/pipeline-config.js so shell scripts no longer
# need inline `node -e` blobs.
#
# common_config_get <dotted.path> [default]
#
# Examples:
#   ENABLED=$(common_config_get 'security.enabled' true)
#   LEVEL=$(common_config_get 'security.auditLevel' moderate)

common_config_get() {
  local key="$1"
  local default="${2-}"
  local lib_dir
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local helper="$lib_dir/pipeline-config.js"
  if [[ ! -f "$helper" ]]; then
    echo "$default"
    return 0
  fi
  if ! have_cmd node; then
    echo "$default"
    return 0
  fi
  node "$helper" get "$key" "$default" 2>/dev/null || echo "$default"
}
