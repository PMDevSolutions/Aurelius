#!/usr/bin/env bash
# check-dead-code.sh — Detect unused exports, files, and dependencies using knip
# Exit codes: 0=no dead code, 1=dead code found
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$(common_project_root)"

# --- Flags ---
JSON_OUTPUT=false

for arg in "$@"; do
  case "$arg" in
    --json)     JSON_OUTPUT=true ;;
    -h|--help)
      echo "Usage: check-dead-code.sh [--json]"
      echo "  --json   Output results as JSON (machine-parseable)"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

# --- Check if dead code detection is enabled in pipeline config ---
CONFIG_FILE=".claude/pipeline.config.json"
ENABLED=$(common_config_get 'deadCode.enabled' true)

if [[ "$ENABLED" == "false" ]]; then
  if $JSON_OUTPUT; then
    echo '{"status": "skipped", "reason": "deadCode.enabled is false in pipeline.config.json"}'
  else
    echo "⊘ Dead code detection is disabled in $CONFIG_FILE"
  fi
  exit 0
fi

if ! $JSON_OUTPUT; then
  echo "=== Dead Code Detection ==="
  echo ""
fi

# --- Ensure knip is installed ---
if ! npx knip --version &>/dev/null; then
  if ! $JSON_OUTPUT; then
    echo "▸ Installing knip..."
  fi
  pnpm add -D knip 2>/dev/null || {
    if $JSON_OUTPUT; then
      echo '{"status": "error", "reason": "Failed to install knip"}'
    else
      echo "  ✗ Failed to install knip. Run 'pnpm add -D knip' manually."
    fi
    exit 1
  }
  if ! $JSON_OUTPUT; then
    echo "  ✓ knip installed"
    echo ""
  fi
fi

# --- Run knip ---
if ! $JSON_OUTPUT; then
  echo "▸ Scanning for dead code with knip..."
  echo ""
fi

KNIP_OUTPUT_FILE=$(mktemp)
common_track_tmpfile "$KNIP_OUTPUT_FILE"
KNIP_EXIT=0

if $JSON_OUTPUT; then
  npx knip --reporter json > "$KNIP_OUTPUT_FILE" 2>/dev/null || KNIP_EXIT=$?
else
  npx knip --reporter compact > "$KNIP_OUTPUT_FILE" 2>/dev/null || KNIP_EXIT=$?
fi

KNIP_OUTPUT=$(cat "$KNIP_OUTPUT_FILE")

# --- Process output ---
if $JSON_OUTPUT; then
  if [[ $KNIP_EXIT -eq 0 ]] || [[ -z "$KNIP_OUTPUT" ]] || [[ "$KNIP_OUTPUT" == "{}" ]]; then
    echo '{"status": "pass", "deadCodeFound": false, "issues": []}'
    exit 0
  else
    # Wrap knip's JSON output with our status envelope (piped via stdin for large output)
    echo "$KNIP_OUTPUT" | node -e "
      let data = '';
      process.stdin.on('data', c => data += c);
      process.stdin.on('end', () => {
        try {
          const knipOutput = JSON.parse(data);
          console.log(JSON.stringify({ status: 'fail', deadCodeFound: true, issues: knipOutput }, null, 2));
        } catch (e) {
          console.log(JSON.stringify({ status: 'fail', deadCodeFound: true, raw: data.trim() }, null, 2));
        }
      });
    "
    exit 1
  fi
fi

# --- Human-readable output ---
if [[ $KNIP_EXIT -eq 0 ]] || [[ -z "$KNIP_OUTPUT" ]]; then
  echo "=== Summary ==="
  echo "✓ No dead code detected — all exports, files, and dependencies are in use"
  exit 0
fi

# knip found issues — display them
echo "$KNIP_OUTPUT" | sed 's/^/  /'
echo ""

echo "=== Summary ==="
echo "✗ Dead code detected — unused exports, files, or dependencies found"
echo "  Review the output above and remove unused code or add to knip ignore patterns"
exit 1
