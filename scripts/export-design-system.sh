#!/usr/bin/env bash
# export-design-system.sh — thin wrapper around scripts/export-design-system.js
# Exports generated components + tokens as a publishable pnpm workspace.
# All flags are forwarded; see `node scripts/export-design-system.js --help`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/export-design-system.js" "$@"
