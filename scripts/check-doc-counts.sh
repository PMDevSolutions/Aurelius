#!/usr/bin/env bash
# check-doc-counts.sh — Flag documentation drift in agent/skill counts.
#
# Counts the real entries on disk:
#   agents  → *.md files in .claude/agents/ (excluding README)
#   skills  → subdirectories of .claude/skills/ that contain a SKILL.md
#
# Then scans the live Markdown docs for any "N agents" / "N skills" claim and
# fails if a claim disagrees with the on-disk count. Historical records
# (CHANGELOG.md, docs/plans/) are intentionally excluded — they describe a
# past release and must not be rewritten.
#
# Usage:
#   ./scripts/check-doc-counts.sh           # human-readable report, exit 1 on drift
#   ./scripts/check-doc-counts.sh --json    # machine-readable output
#
# Exit codes: 0 = in sync, 1 = drift detected, 2 = usage/IO error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/common.sh"

ROOT="$(common_project_root)"
cd "$ROOT"

JSON=0
for arg in "$@"; do
  case "$arg" in
    --json) JSON=1 ;;
    -h|--help)
      # Print the leading comment block (skip shebang, stop at first code line).
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) say_err "Unknown argument: $arg"; exit 2 ;;
  esac
done

# --- Count entries on disk ------------------------------------------------

AGENT_DIR=".claude/agents"
SKILL_DIR=".claude/skills"

agent_count=0
if [[ -d "$AGENT_DIR" ]]; then
  while IFS= read -r f; do
    [[ "$(basename "$f")" =~ ^[Rr][Ee][Aa][Dd][Mm][Ee]\.md$ ]] && continue
    agent_count=$((agent_count + 1))
  done < <(find "$AGENT_DIR" -maxdepth 1 -type f -name '*.md')
fi

skill_count=0
if [[ -d "$SKILL_DIR" ]]; then
  while IFS= read -r d; do
    [[ -f "$d/SKILL.md" ]] && skill_count=$((skill_count + 1))
  done < <(find "$SKILL_DIR" -mindepth 1 -maxdepth 1 -type d)
fi

# --- Scan docs for count claims -------------------------------------------
#
# A "claim" is a number adjacent to the PLURAL word "agents" or "skills".
# Count statements are always plural, so requiring the plural form avoids
# matching incidental phrases like "Phase 1 skill" or "Phase 4 agent". Three
# forms are recognized:
#   A: "<N> [adj]{0,3} agents"        e.g. "53 custom agents", "20 skills"
#   B: "Agents (<N> Total)"           e.g. "Skills (20 Total)"
#   C: "Total Agents:** <N>"          e.g. "**Total Skills:** 20"
#
# Each match is reduced to (noun, number) and compared against the disk count.

DRIFT=0
declare -a DRIFT_LINES=()

# Count the docs in scope (every *.md except historical records) for the report.
DOC_COUNT=$(find . -type f -name '*.md' \
  -not -path './.git/*' \
  -not -path '*/node_modules/*' \
  -not -path './docs/plans/*' \
  -not -name 'CHANGELOG.md' \
  | wc -l | tr -d ' ')

# Combined matcher for the three claim forms. Run once recursively (a single
# grep process) for speed — important because this also runs on pre-commit.
COMBINED='[0-9]+( +[a-z][a-z./+-]*){0,3} +(agents|skills)'
COMBINED+='|(agents|skills) *\(?[0-9]+ +total'
COMBINED+='|total +(agents|skills)[^0-9]{0,8}[0-9]+'

# grep -rIno output is "path:lineno:matched-text". Process each match with
# pure bash (no per-match subprocess): the matched substring contains exactly
# one number in every form, so stripping non-digits yields the claimed count.
while IFS= read -r match; do
  [[ -z "$match" ]] && continue
  file="${match%%:*}"; rest="${match#*:}"
  lineno="${rest%%:*}"; text="${rest#*:}"
  lc="${text,,}"
  num="${text//[!0-9]/}"
  [[ -z "$num" ]] && continue
  if [[ "$lc" == *agent* ]]; then
    noun="agents"; expected="$agent_count"
  elif [[ "$lc" == *skill* ]]; then
    noun="skills"; expected="$skill_count"
  else
    continue
  fi
  if [[ "$num" != "$expected" ]]; then
    squished="${text//$'\t'/ }"
    while [[ "$squished" == *"  "* ]]; do squished="${squished//  / }"; done
    DRIFT_LINES+=("${file#./}:${lineno}: claims ${num} ${noun}, expected ${expected} -> \"${squished}\"")
  fi
done < <(grep -riInoE "$COMBINED" \
  --include='*.md' \
  --exclude='CHANGELOG.md' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  --exclude-dir='plans' \
  . 2>/dev/null || true)

# A single claim can match more than one form; de-duplicate before counting.
if ((${#DRIFT_LINES[@]})); then
  mapfile -t DRIFT_LINES < <(printf '%s\n' "${DRIFT_LINES[@]}" | sort -u)
fi
DRIFT=${#DRIFT_LINES[@]}

# --- Report ---------------------------------------------------------------

if [[ "$JSON" -eq 1 ]]; then
  printf '{\n'
  printf '  "agents": %d,\n' "$agent_count"
  printf '  "skills": %d,\n' "$skill_count"
  printf '  "drift": %d,\n' "$DRIFT"
  printf '  "violations": ['
  if ((${#DRIFT_LINES[@]})); then
    printf '\n'
    for i in "${!DRIFT_LINES[@]}"; do
      esc="${DRIFT_LINES[$i]//\\/\\\\}"; esc="${esc//\"/\\\"}"
      printf '    "%s"' "$esc"
      [[ "$i" -lt $((${#DRIFT_LINES[@]} - 1)) ]] && printf ','
      printf '\n'
    done
    printf '  '
  fi
  printf ']\n}\n'
else
  say_banner "Documentation Count Check"
  echo ""
  say_step "On disk: ${agent_count} agents, ${skill_count} skills"
  say_step "Scanned ${DOC_COUNT} Markdown files (CHANGELOG.md and docs/plans/ excluded)"
  echo ""
  if [[ "$DRIFT" -eq 0 ]]; then
    say_pass "All agent/skill counts in docs match the entries on disk"
  else
    say_fail "${DRIFT} documentation count(s) drifted from disk:"
    for line in "${DRIFT_LINES[@]}"; do
      echo "    ${RED}${line}${NC}"
    done
    echo ""
    echo "  Fix the counts above, or re-run after adding/removing agents or skills."
    echo "  (See the \"Keeping counts in sync\" note in CLAUDE.md.)"
  fi
fi

[[ "$DRIFT" -eq 0 ]] || exit 1
