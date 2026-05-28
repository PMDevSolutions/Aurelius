#!/usr/bin/env bash
# verify-renderers.sh — Validate every renderer manifest under renderers/.
# Used as the `renderers` check in verify-all.sh.
# Exits non-zero if any manifest fails validation.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$DIR/validate-renderer.js" --all "$@" || exit 1
exit 0
