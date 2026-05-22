#!/usr/bin/env bash
# verify-all.sh — Run every local quality check in sequence and report a summary.
#
# Backs both /verify-all (interactive) and /ci (machine-readable, non-interactive)
# slash commands. Each check is a separate script under scripts/ and is treated
# as opaque: we capture its exit code and its trailing output for the report.
#
# Usage:
#   ./scripts/verify-all.sh                   # Human-readable summary
#   ./scripts/verify-all.sh --json            # Machine-readable JSON summary
#   ./scripts/verify-all.sh --ci              # Implies --json + non-interactive
#   ./scripts/verify-all.sh --skip <a,b,c>    # Skip named checks
#   ./scripts/verify-all.sh --include <a,b>   # Run only the named checks
#   ./scripts/verify-all.sh --list            # Print check names and exit
#
# Check names:
#   lint-and-format, types, tests, accessibility, tokens, dead-code, security,
#   bundle-size
#
# Exit codes:
#   0 — every check passed (or was skipped intentionally)
#   1 — one or more checks failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# Run relative to the caller's cwd (expected to be the repo root). This lets
# tests run against fixture directories without forcing themselves into the
# real project tree, and matches how the individual check scripts behave.

JSON_OUTPUT=false
CI_MODE=false
SKIP_LIST=""
INCLUDE_LIST=""
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_OUTPUT=true ;;
    --ci) CI_MODE=true; JSON_OUTPUT=true ;;
    --skip) SKIP_LIST="${2:-}"; shift ;;
    --include) INCLUDE_LIST="${2:-}"; shift ;;
    --list) LIST_ONLY=true ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

# Each check: name | script path | extra args (space-separated)
# `bundle-size` is conditional — it runs only when a build artifact exists.
ALL_CHECKS=(
  "lint-and-format|./scripts/lint-and-format.sh|--check"
  "types|./scripts/check-types.sh|"
  "tests|./scripts/run-tests.sh|"
  "accessibility|./scripts/check-accessibility.sh|"
  "tokens|./scripts/verify-tokens.sh|"
  "dead-code|./scripts/check-dead-code.sh|"
  "security|./scripts/check-security.sh|"
  "bundle-size|./scripts/check-bundle-size.sh|"
)

if [[ "$LIST_ONLY" == "true" ]]; then
  for entry in "${ALL_CHECKS[@]}"; do
    echo "${entry%%|*}"
  done
  exit 0
fi

# --- Filtering ---
should_run() {
  local name="$1"
  if [[ -n "$INCLUDE_LIST" ]]; then
    common_csv_contains "$INCLUDE_LIST" "$name" && return 0
    return 1
  fi
  if [[ -n "$SKIP_LIST" ]]; then
    common_csv_contains "$SKIP_LIST" "$name" && return 1
  fi
  return 0
}

# --- Runner ---
RESULTS_NAME=()
RESULTS_STATUS=()
RESULTS_EXIT=()
RESULTS_MS=()
RESULTS_REASON=()

emit_progress() {
  $JSON_OUTPUT && return 0
  echo "$@"
}

run_check() {
  local name="$1"
  local script="$2"
  local args="$3"

  if ! should_run "$name"; then
    RESULTS_NAME+=("$name")
    RESULTS_STATUS+=("skip")
    RESULTS_EXIT+=("0")
    RESULTS_MS+=("0")
    RESULTS_REASON+=("filtered by --skip/--include")
    return 0
  fi

  if [[ "$name" == "bundle-size" ]] && ! common_build_artifact_exists; then
    RESULTS_NAME+=("$name")
    RESULTS_STATUS+=("skip")
    RESULTS_EXIT+=("0")
    RESULTS_MS+=("0")
    RESULTS_REASON+=("no build artifact (dist/.next/build/out)")
    emit_progress "▸ $name … skipped (no build artifact)"
    return 0
  fi

  if [[ ! -x "$script" ]] && [[ ! -f "$script" ]]; then
    RESULTS_NAME+=("$name")
    RESULTS_STATUS+=("skip")
    RESULTS_EXIT+=("0")
    RESULTS_MS+=("0")
    RESULTS_REASON+=("script not found: $script")
    emit_progress "▸ $name … skipped (script not found)"
    return 0
  fi

  emit_progress "▸ $name …"
  local start
  start="$(common_now_ms)"
  local exit_code=0
  if [[ -n "$args" ]]; then
    bash "$script" $args >/dev/null 2>&1 || exit_code=$?
  else
    bash "$script" >/dev/null 2>&1 || exit_code=$?
  fi
  local end
  end="$(common_now_ms)"
  local duration_ms=$((end - start))

  RESULTS_NAME+=("$name")
  RESULTS_EXIT+=("$exit_code")
  RESULTS_MS+=("$duration_ms")
  if [[ "$exit_code" -eq 0 ]]; then
    RESULTS_STATUS+=("pass")
    RESULTS_REASON+=("")
    emit_progress "  ✓ pass (${duration_ms}ms)"
  else
    RESULTS_STATUS+=("fail")
    RESULTS_REASON+=("exit $exit_code")
    emit_progress "  ✗ fail (exit $exit_code, ${duration_ms}ms)"
  fi
}

# --- Run all ---
$JSON_OUTPUT || echo "=== verify-all ==="
$JSON_OUTPUT || echo ""

for entry in "${ALL_CHECKS[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  script="${rest%%|*}"
  args="${rest#*|}"
  run_check "$name" "$script" "$args"
done

# --- Summary ---
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
for status in "${RESULTS_STATUS[@]}"; do
  case "$status" in
    pass) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    fail) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    skip) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
  esac
done

if $JSON_OUTPUT; then
  printf '{\n'
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    printf '  "ok": true,\n'
  else
    printf '  "ok": false,\n'
  fi
  printf '  "summary": { "pass": %d, "fail": %d, "skip": %d, "total": %d },\n' \
    "$PASS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT" "${#RESULTS_NAME[@]}"
  printf '  "checks": [\n'
  for i in "${!RESULTS_NAME[@]}"; do
    sep=","
    [[ "$i" -eq $(( ${#RESULTS_NAME[@]} - 1 )) ]] && sep=""
    reason_escaped="${RESULTS_REASON[$i]//\\/\\\\}"
    reason_escaped="${reason_escaped//\"/\\\"}"
    printf '    { "name": "%s", "status": "%s", "exitCode": %s, "durationMs": %s, "reason": "%s" }%s\n' \
      "${RESULTS_NAME[$i]}" "${RESULTS_STATUS[$i]}" "${RESULTS_EXIT[$i]}" "${RESULTS_MS[$i]}" \
      "$reason_escaped" "$sep"
  done
  printf '  ]\n'
  printf '}\n'
else
  echo ""
  echo "=== Summary ==="
  printf '%-18s %-6s %-10s %s\n' "Check" "Status" "Duration" "Reason"
  printf '%-18s %-6s %-10s %s\n' "-----" "------" "--------" "------"
  for i in "${!RESULTS_NAME[@]}"; do
    printf '%-18s %-6s %-10s %s\n' \
      "${RESULTS_NAME[$i]}" "${RESULTS_STATUS[$i]}" "${RESULTS_MS[$i]}ms" "${RESULTS_REASON[$i]}"
  done
  echo ""
  echo "Totals: ${PASS_COUNT} passed, ${FAIL_COUNT} failed, ${SKIP_COUNT} skipped"
  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo ""
    echo "✗ Some checks failed. Run each failing check individually for full output:"
    for i in "${!RESULTS_NAME[@]}"; do
      if [[ "${RESULTS_STATUS[$i]}" == "fail" ]]; then
        # Look up the original script for the failing check
        for entry in "${ALL_CHECKS[@]}"; do
          if [[ "${entry%%|*}" == "${RESULTS_NAME[$i]}" ]]; then
            rest="${entry#*|}"
            failing_script="${rest%%|*}"
            failing_args="${rest#*|}"
            if [[ -n "$failing_args" ]]; then
              echo "  $failing_script $failing_args"
            else
              echo "  $failing_script"
            fi
            break
          fi
        done
      fi
    done
  else
    echo ""
    echo "✓ All checks passed."
  fi
fi

# --- Exit code ---
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
