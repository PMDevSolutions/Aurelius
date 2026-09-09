#!/usr/bin/env bash
# setup-baseline-lfs.sh — Route visual baselines through Git LFS (RFC 0002 §6.1)
#
# Usage: ./scripts/setup-baseline-lfs.sh [--dry-run] [--force]
#
# Forward-only adoption for large baseline sets (rule of thumb: >50 baselines
# or >25 MB cumulative): appends the LFS filter for the baseline directory to
# .gitattributes (idempotently) and runs `git lfs install --local`. History
# rewriting (`git lfs migrate import`) is printed as guidance only — this
# script never rewrites history.
#
# Operates on the CURRENT git repository (downstream apps run it inside their
# own repo), reading visualBaselines.storage/baselineDir from that repo's
# .claude/pipeline.config.json when present.
#
# Exit codes: 0 = done (or dry run), 1 = refused (storage is not "lfs"),
# 2 = error (not a git repo, git-lfs missing).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

DRY_RUN=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    -h|--help)
      echo "Usage: setup-baseline-lfs.sh [--dry-run] [--force]"
      echo ""
      echo "Routes the visual baseline directory through Git LFS (RFC 0002)."
      echo "Reads visualBaselines.storage from the current repo's pipeline config"
      echo "and refuses unless it is \"lfs\" (override with --force)."
      echo ""
      echo "Options:"
      echo "  --dry-run   Print the planned .gitattributes change without writing"
      echo "  --force     Apply even when visualBaselines.storage is not \"lfs\""
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! TARGET_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  say_err "not inside a git repository — run this from the project the baselines belong to"
  exit 2
fi
cd "$TARGET_ROOT"

CONFIG_FILE=".claude/pipeline.config.json"
read_config() {
  local key="$1" default="$2"
  node -e "
    try {
      const c = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf-8'));
      console.log(c.visualBaselines?.[process.argv[2]] ?? process.argv[3]);
    } catch { console.log(process.argv[3]); }
  " "$CONFIG_FILE" "$key" "$default" 2>/dev/null || echo "$default"
}

STORAGE=$(read_config storage git)
BASELINE_DIR=$(read_config baselineDir ".claude/visual-qa/baselines")
ATTR_LINE="$BASELINE_DIR/**/*.png filter=lfs diff=lfs merge=lfs -text"

say_banner "Baseline Git LFS Setup"
echo "Repository:  $TARGET_ROOT"
echo "Storage:     $STORAGE"
echo "Filter line: $ATTR_LINE"
echo ""

if [[ "$STORAGE" != "lfs" && "$FORCE" != "true" ]]; then
  say_fail "visualBaselines.storage is \"$STORAGE\" — set it to \"lfs\" in $CONFIG_FILE first, or pass --force"
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  say_step "dry run — would append to .gitattributes:"
  echo "  $ATTR_LINE"
  say_step "dry run — would run: git lfs install --local"
  exit 0
fi

if ! git lfs version >/dev/null 2>&1; then
  say_err "git-lfs is not installed (https://git-lfs.com) — install it and re-run"
  exit 2
fi

if [[ -f .gitattributes ]] && grep -qF "$ATTR_LINE" .gitattributes; then
  say_skip ".gitattributes already contains the baseline LFS filter"
else
  # Guard against appending onto a final line with no trailing newline.
  if [[ -f .gitattributes && -s .gitattributes && -n "$(tail -c1 .gitattributes)" ]]; then
    echo "" >> .gitattributes
  fi
  echo "$ATTR_LINE" >> .gitattributes
  say_pass "added baseline LFS filter to .gitattributes"
fi

git lfs install --local > /dev/null
say_pass "git lfs install --local complete"

echo ""
say_banner "Next Steps"
echo "1. Commit the attributes change:"
echo "     git add .gitattributes"
echo "     git commit -m 'chore: route visual baselines through git-lfs'"
echo "2. Baselines added or updated from now on are stored in LFS (forward-only)."
echo "3. Optional — rewrite EXISTING history into LFS (destructive, rewrites"
echo "   commits; coordinate with anyone who has clones):"
echo "     git lfs migrate import --include=\"$BASELINE_DIR/**/*.png\" --everything"
echo "   This script never runs the migration itself."
