#!/usr/bin/env bash
# check-security.sh — Run dependency vulnerability audits and check for security anti-patterns
# Exit codes: 0=no issues, 1=issues found (unless --no-fail)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$(common_project_root)"

# --- Flags ---
JSON_OUTPUT=false
AUDIT_LEVEL=""
NO_FAIL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)    JSON_OUTPUT=true; shift ;;
    --no-fail) NO_FAIL=true; shift ;;
    --level)
      if [[ $# -lt 2 ]]; then
        echo "Error: --level requires a value (low, moderate, high, critical)" >&2
        exit 1
      fi
      AUDIT_LEVEL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: check-security.sh [--json] [--level <level>] [--no-fail]"
      echo "  --json             Output results as JSON (machine-parseable)"
      echo "  --level <level>    Override audit level (low, moderate, high, critical)"
      echo "  --no-fail          Always exit 0, even if issues are found"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# --- Read config from pipeline.config.json ---
CONFIG_FILE=".claude/pipeline.config.json"
ENABLED=$(common_config_get 'security.enabled' true)
CONFIG_AUDIT_LEVEL=$(common_config_get 'security.auditLevel' moderate)
FAIL_ON_VULN=$(common_config_get 'security.failOnVulnerability' true)

if [[ "$ENABLED" == "false" ]]; then
  if $JSON_OUTPUT; then
    echo '{"status": "skipped", "reason": "security.enabled is false in pipeline.config.json"}'
  else
    echo "⊘ Security audit is disabled in $CONFIG_FILE"
  fi
  exit 0
fi

# CLI flags override config
if [[ -z "$AUDIT_LEVEL" ]]; then
  AUDIT_LEVEL="$CONFIG_AUDIT_LEVEL"
fi
if $NO_FAIL; then
  FAIL_ON_VULN=false
fi

ISSUES=0
AUDIT_RESULTS=""
OUTDATED_RESULTS=""

# --- Temp file cleanup (handled by common.sh) ---

if ! $JSON_OUTPUT; then
  echo "=== Security Audit ==="
  echo ""
fi

# ============================================================
# Check 1: Dependency vulnerability audit
# ============================================================
if ! $JSON_OUTPUT; then
  echo "▸ Running pnpm audit (level: $AUDIT_LEVEL)..."
fi

AUDIT_TMPFILE=$(mktemp)
common_track_tmpfile "$AUDIT_TMPFILE"
AUDIT_EXIT=0

pnpm audit --audit-level "$AUDIT_LEVEL" > "$AUDIT_TMPFILE" 2>&1 || AUDIT_EXIT=$?

if [[ $AUDIT_EXIT -ne 0 ]]; then
  AUDIT_RESULTS=$(cat "$AUDIT_TMPFILE")
  ISSUES=$((ISSUES + 1))
  if ! $JSON_OUTPUT; then
    echo "  ✗ Vulnerabilities found:"
    echo "$AUDIT_RESULTS" | sed 's/^/    /'
  fi
else
  if ! $JSON_OUTPUT; then
    echo "  ✓ No vulnerabilities found at '$AUDIT_LEVEL' level or above"
  fi
fi

if ! $JSON_OUTPUT; then
  echo ""
fi

# ============================================================
# Check 2: Security anti-pattern scan
# ============================================================
if ! $JSON_OUTPUT; then
  echo "▸ Scanning for security anti-patterns..."
fi

PATTERN_COUNT=0
PATTERN_DETAILS=""

# Determine source directories to scan
SRC_DIRS=()
for dir in src app lib pages components; do
  if [[ -d "$dir" ]]; then
    SRC_DIRS+=("$dir")
  fi
done

if [[ ${#SRC_DIRS[@]} -gt 0 ]]; then

  # 2a: Hardcoded secrets (API_KEY, SECRET, PASSWORD, TOKEN assignments)
  #     Exclude process.env / import.meta.env references (not hardcoded)
  #     Exclude .test. and .spec. files, type definitions, and comments
  SECRET_TMPFILE=$(mktemp)
  common_track_tmpfile "$SECRET_TMPFILE"

  grep -rnE "(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*[:=]\s*['\"][^'\"]{8,}['\"]" "${SRC_DIRS[@]}" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null \
    | grep -v 'process\.env' \
    | grep -v 'import\.meta\.env' \
    | grep -v '\.test\.' \
    | grep -v '\.spec\.' \
    | grep -v '\.d\.ts' \
    | grep -v 'node_modules' \
    | grep -v '// security-ok' \
    > "$SECRET_TMPFILE" || true

  SECRET_COUNT=$(wc -l < "$SECRET_TMPFILE" | tr -d ' ')
  if [[ "$SECRET_COUNT" -gt 0 ]]; then
    PATTERN_COUNT=$((PATTERN_COUNT + SECRET_COUNT))
    PATTERN_DETAILS+="    Hardcoded secrets ($SECRET_COUNT):"$'\n'
    PATTERN_DETAILS+="$(sed 's/^/      /' "$SECRET_TMPFILE")"$'\n'
  fi

  # 2b: dangerouslySetInnerHTML usage
  DANGER_TMPFILE=$(mktemp)
  common_track_tmpfile "$DANGER_TMPFILE"

  grep -rnE 'dangerouslySetInnerHTML' "${SRC_DIRS[@]}" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null \
    | grep -v 'node_modules' \
    | grep -v '// security-ok' \
    > "$DANGER_TMPFILE" || true

  DANGER_COUNT=$(wc -l < "$DANGER_TMPFILE" | tr -d ' ')
  if [[ "$DANGER_COUNT" -gt 0 ]]; then
    PATTERN_COUNT=$((PATTERN_COUNT + DANGER_COUNT))
    PATTERN_DETAILS+="    dangerouslySetInnerHTML usage ($DANGER_COUNT):"$'\n'
    PATTERN_DETAILS+="$(sed 's/^/      /' "$DANGER_TMPFILE")"$'\n'
  fi

  # 2c: eval() usage
  EVAL_TMPFILE=$(mktemp)
  common_track_tmpfile "$EVAL_TMPFILE"

  grep -rnE '\beval\s*\(' "${SRC_DIRS[@]}" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null \
    | grep -v 'node_modules' \
    | grep -v '// security-ok' \
    > "$EVAL_TMPFILE" || true

  EVAL_COUNT=$(wc -l < "$EVAL_TMPFILE" | tr -d ' ')
  if [[ "$EVAL_COUNT" -gt 0 ]]; then
    PATTERN_COUNT=$((PATTERN_COUNT + EVAL_COUNT))
    PATTERN_DETAILS+="    eval() usage ($EVAL_COUNT):"$'\n'
    PATTERN_DETAILS+="$(sed 's/^/      /' "$EVAL_TMPFILE")"$'\n'
  fi

else
  if ! $JSON_OUTPUT; then
    echo "  ⊘ No source directories found (src/, app/, lib/, pages/, components/) — skipping anti-pattern scan"
  fi
fi

# 2d: .env not in .gitignore
ENV_NOT_IGNORED=false
if [[ -f ".gitignore" ]]; then
  if ! grep -qE '^\s*\.env' .gitignore 2>/dev/null; then
    ENV_NOT_IGNORED=true
    PATTERN_COUNT=$((PATTERN_COUNT + 1))
    PATTERN_DETAILS+="    .env is not listed in .gitignore"$'\n'
  fi
else
  # No .gitignore at all is also a concern if .env files exist
  if ls .env* &>/dev/null; then
    ENV_NOT_IGNORED=true
    PATTERN_COUNT=$((PATTERN_COUNT + 1))
    PATTERN_DETAILS+="    No .gitignore found but .env files exist"$'\n'
  fi
fi

if [[ $PATTERN_COUNT -gt 0 ]]; then
  ISSUES=$((ISSUES + PATTERN_COUNT))
  if ! $JSON_OUTPUT; then
    echo "  ✗ Anti-patterns found ($PATTERN_COUNT):"
    echo "$PATTERN_DETAILS" | sed '/^$/d'
  fi
else
  if ! $JSON_OUTPUT; then
    echo "  ✓ No security anti-patterns detected"
  fi
fi

if ! $JSON_OUTPUT; then
  echo ""
fi

# ============================================================
# Check 3: Outdated packages
# ============================================================
if ! $JSON_OUTPUT; then
  echo "▸ Checking for outdated packages..."
fi

OUTDATED_TMPFILE=$(mktemp)
common_track_tmpfile "$OUTDATED_TMPFILE"
OUTDATED_EXIT=0

pnpm outdated > "$OUTDATED_TMPFILE" 2>&1 || OUTDATED_EXIT=$?

if [[ $OUTDATED_EXIT -ne 0 ]] && [[ -s "$OUTDATED_TMPFILE" ]]; then
  OUTDATED_RESULTS=$(cat "$OUTDATED_TMPFILE")
  if ! $JSON_OUTPUT; then
    echo "  ⚠ Outdated packages found:"
    echo "$OUTDATED_RESULTS" | sed 's/^/    /'
  fi
else
  if ! $JSON_OUTPUT; then
    echo "  ✓ All packages are up to date"
  fi
fi

if ! $JSON_OUTPUT; then
  echo ""
fi

# ============================================================
# Summary
# ============================================================
if $JSON_OUTPUT; then
  ISSUES="$ISSUES" AUDIT_LEVEL="$AUDIT_LEVEL" PATTERN_COUNT="$PATTERN_COUNT" \
  ENV_NOT_IGNORED="$ENV_NOT_IGNORED" AUDIT_EXIT="$AUDIT_EXIT" OUTDATED_EXIT="$OUTDATED_EXIT" \
  node -e "
    const result = {
      status: parseInt(process.env.ISSUES) > 0 ? 'fail' : 'pass',
      auditLevel: process.env.AUDIT_LEVEL,
      issueCount: parseInt(process.env.ISSUES),
      antiPatternCount: parseInt(process.env.PATTERN_COUNT),
      envInGitignore: process.env.ENV_NOT_IGNORED !== 'true',
      hasVulnerabilities: process.env.AUDIT_EXIT !== '0',
      hasOutdatedPackages: process.env.OUTDATED_EXIT !== '0'
    };
    console.log(JSON.stringify(result, null, 2));
  "
  if [[ $ISSUES -gt 0 ]] && [[ "$FAIL_ON_VULN" == "true" ]]; then
    exit 1
  fi
  exit 0
fi

echo "=== Summary ==="
if [[ $ISSUES -gt 0 ]]; then
  echo "✗ $ISSUES security issue(s) found"
  echo "  Fix vulnerabilities and anti-patterns, or add '// security-ok' to intentional exceptions"
  if [[ "$FAIL_ON_VULN" == "true" ]]; then
    exit 1
  fi
  echo "  (--no-fail mode: exiting with code 0)"
  exit 0
else
  echo "✓ All security checks passed"
  exit 0
fi
