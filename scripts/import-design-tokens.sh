#!/usr/bin/env bash
# import-design-tokens.sh — Thin wrapper for import-design-tokens.js
# Reconstruct design-tokens.lock.json from an exported @scope/design-tokens package.
set -euo pipefail
exec node "$(dirname "$0")/import-design-tokens.js" "$@"
