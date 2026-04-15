#!/usr/bin/env bash
# generate-stories.sh — Thin wrapper for generate-stories.js
# Phase 4.5 of the Figma-to-React pipeline (non-blocking)
set -euo pipefail
exec node "$(dirname "$0")/generate-stories.js" "$@"
