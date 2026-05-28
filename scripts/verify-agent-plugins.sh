#!/usr/bin/env bash
# verify-agent-plugins.sh — Validate and test every agent plugin under
# .claude/agent-plugins/. Used as the `agent-plugins` check in verify-all.sh.
# Exits non-zero if validation or any plugin's assertions fail.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$DIR/validate-agent-plugin.js" --all || exit 1
node "$DIR/test-agent-plugin.js" --all || exit 1
exit 0
