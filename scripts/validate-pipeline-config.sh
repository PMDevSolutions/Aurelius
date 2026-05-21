#!/usr/bin/env bash
# validate-pipeline-config.sh — Validate .claude/pipeline.config.json against
# its JSON Schema. Thin wrapper around validate-pipeline-config.js so the
# scripts/ directory exposes both .sh and .js entrypoints (consistent with the
# project's other tools).
#
# Usage:
#   ./scripts/validate-pipeline-config.sh
#   ./scripts/validate-pipeline-config.sh --json
#   ./scripts/validate-pipeline-config.sh --config <path> --schema <path>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/validate-pipeline-config.js" "$@"
