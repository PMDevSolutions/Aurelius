#!/usr/bin/env bash
# cross-browser-baseline.sh — Cross-browser screenshot baselines (RFC 0002)
#
# Usage:
#   ./scripts/cross-browser-baseline.sh capture [url] [--local] [--engines a,b] [--json]
#   ./scripts/cross-browser-baseline.sh compare [url] [--current-dir <dir>] [--blocking] [--json]
#   ./scripts/cross-browser-baseline.sh verify  [--json]
#
# Thin wrapper over scripts/cross-browser-baseline.js, which owns config
# (pipeline.config.json → visualBaselines), the provenance manifest, backend
# adapters, and the pinned-container capture.
#
# Exit codes: 0 = pass/skip, 1 = blocking failures or provenance violations,
# 2 = usage/environment error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
cd "$(common_project_root)"

require_cmd node "https://nodejs.org (Node.js 20+)"

exec node "$SCRIPT_DIR/cross-browser-baseline.js" "$@"
