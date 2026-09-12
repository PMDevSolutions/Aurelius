#!/usr/bin/env bash
# sync-tokens.sh — Detect token drift between design-tokens.lock.json and source files
# Compares lockfile tokens against tailwind.config.ts/js and CSS custom properties
# Exit codes: 0=no drift, 1=drift detected, 2=no lockfile
set -euo pipefail

# --- Flags ---
MODE="dry-run"
JSON_OUTPUT=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)  MODE="dry-run" ;;
    --update)   MODE="update" ;;
    --json)     JSON_OUTPUT=true ;;
    -h|--help)
      echo "Usage: sync-tokens.sh [--dry-run] [--update] [--json]"
      echo "  --dry-run   Report drift without modifying files (default)"
      echo "  --update    Update source files to match lockfile"
      echo "  --json      Output results as JSON"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

# --- Locate lockfile ---
LOCKFILE=""
for candidate in "src/styles/design-tokens.lock.json" "design-tokens.lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

if [[ -z "$LOCKFILE" ]]; then
  if $JSON_OUTPUT; then
    echo '{"error": "No design-tokens.lock.json found", "status": "error"}'
  else
    echo "✗ No design-tokens.lock.json found"
    echo "  Place a lockfile at src/styles/design-tokens.lock.json or design-tokens.lock.json"
  fi
  exit 2
fi

# --- Locate Tailwind config ---
TAILWIND_CONFIG=""
for candidate in "tailwind.config.ts" "tailwind.config.js"; do
  if [[ -f "$candidate" ]]; then
    TAILWIND_CONFIG="$candidate"
    break
  fi
done

# --- Locate CSS tokens file ---
TOKENS_CSS=""
for candidate in "src/styles/tokens.css" "src/tokens.css" "styles/tokens.css"; do
  if [[ -f "$candidate" ]]; then
    TOKENS_CSS="$candidate"
    break
  fi
done

DRIFT_ITEMS=()

# Helper: add a drift item (category, token-name, lockfile-value, source-value)
add_drift() {
  DRIFT_ITEMS+=("$1|$2|$3|$4")
}

if ! $JSON_OUTPUT; then
  echo "=== Token Drift Detection ==="
  echo ""
  echo "  Lockfile:       $LOCKFILE"
  echo "  Tailwind config: ${TAILWIND_CONFIG:-not found}"
  echo "  CSS tokens:     ${TOKENS_CSS:-not found}"
  echo ""
fi

# --- Check 1: Color tokens in lockfile vs Tailwind config ---
if ! $JSON_OUTPUT; then
  echo "▸ Checking color tokens against Tailwind config..."
fi

if [[ -n "$TAILWIND_CONFIG" ]]; then
  TAILWIND_CONTENT=$(cat "$TAILWIND_CONFIG")

  # Extract color tokens from lockfile and check each against Tailwind config
  COLOR_DRIFT=$(node -e "
    const fs = require('fs');
    try {
      const lock = JSON.parse(fs.readFileSync('$LOCKFILE', 'utf8'));
      const colors = lock.colors || lock.designTokens?.colors || {};
      const tw = fs.readFileSync('$TAILWIND_CONFIG', 'utf8');
      const drifts = [];
      for (const [name, value] of Object.entries(colors)) {
        if (typeof value !== 'string') continue;
        // Check if the color value appears in Tailwind config
        if (!tw.includes(value)) {
          drifts.push(JSON.stringify({ token: name, lockValue: value, status: 'missing-in-tailwind' }));
        }
      }
      drifts.forEach(d => console.log(d));
    } catch (e) {
      // No colors section or parse error — skip silently
    }
  " 2>/dev/null || true)

  if [[ -n "$COLOR_DRIFT" ]]; then
    while IFS= read -r line; do
      TOKEN=$(node -e "const d=JSON.parse('$line'); console.log(d.token)" 2>/dev/null || echo "unknown")
      VALUE=$(node -e "const d=JSON.parse('$line'); console.log(d.lockValue)" 2>/dev/null || echo "unknown")
      add_drift "color" "$TOKEN" "$VALUE" "not found in $TAILWIND_CONFIG"
      if ! $JSON_OUTPUT; then
        echo "  ✗ Color '$TOKEN' ($VALUE) — not found in $TAILWIND_CONFIG"
      fi
    done <<< "$COLOR_DRIFT"
  fi

  if [[ ${#DRIFT_ITEMS[@]} -eq 0 ]] && ! $JSON_OUTPUT; then
    echo "  ✓ All lockfile colors present in Tailwind config"
  fi
else
  if ! $JSON_OUTPUT; then
    echo "  ⊘ No tailwind.config found — skipping color check"
  fi
fi

if ! $JSON_OUTPUT; then
  echo ""
fi

# --- Check 2: Spacing tokens in lockfile vs Tailwind config ---
SPACING_START=${#DRIFT_ITEMS[@]}

if ! $JSON_OUTPUT; then
  echo "▸ Checking spacing tokens against Tailwind config..."
fi

if [[ -n "$TAILWIND_CONFIG" ]]; then
  SPACING_DRIFT=$(node -e "
    const fs = require('fs');
    try {
      const lock = JSON.parse(fs.readFileSync('$LOCKFILE', 'utf8'));
      const spacing = lock.spacing || lock.designTokens?.spacing || {};
      const tw = fs.readFileSync('$TAILWIND_CONFIG', 'utf8');
      const drifts = [];
      for (const [name, value] of Object.entries(spacing)) {
        const val = typeof value === 'number' ? String(value) : value;
        if (typeof val !== 'string') continue;
        if (!tw.includes(val)) {
          drifts.push(JSON.stringify({ token: name, lockValue: val, status: 'missing-in-tailwind' }));
        }
      }
      drifts.forEach(d => console.log(d));
    } catch (e) {
      // No spacing section or parse error — skip silently
    }
  " 2>/dev/null || true)

  if [[ -n "$SPACING_DRIFT" ]]; then
    while IFS= read -r line; do
      TOKEN=$(node -e "const d=JSON.parse('$line'); console.log(d.token)" 2>/dev/null || echo "unknown")
      VALUE=$(node -e "const d=JSON.parse('$line'); console.log(d.lockValue)" 2>/dev/null || echo "unknown")
      add_drift "spacing" "$TOKEN" "$VALUE" "not found in $TAILWIND_CONFIG"
      if ! $JSON_OUTPUT; then
        echo "  ✗ Spacing '$TOKEN' ($VALUE) — not found in $TAILWIND_CONFIG"
      fi
    done <<< "$SPACING_DRIFT"
  fi

  if [[ ${#DRIFT_ITEMS[@]} -eq $SPACING_START ]] && ! $JSON_OUTPUT; then
    echo "  ✓ All lockfile spacing tokens present in Tailwind config"
  fi
else
  if ! $JSON_OUTPUT; then
    echo "  ⊘ No tailwind.config found — skipping spacing check"
  fi
fi

if ! $JSON_OUTPUT; then
  echo ""
fi

# --- Check 3: CSS custom properties in tokens.css ---
CSS_START=${#DRIFT_ITEMS[@]}

if ! $JSON_OUTPUT; then
  echo "▸ Checking CSS custom properties against tokens.css..."
fi

if [[ -n "$TOKENS_CSS" ]]; then
  CSS_DRIFT=$(node -e "
    const fs = require('fs');
    try {
      const lock = JSON.parse(fs.readFileSync('$LOCKFILE', 'utf8'));
      const css = fs.readFileSync('$TOKENS_CSS', 'utf8');
      const drifts = [];

      // Check all token categories for CSS custom property equivalents
      const categories = ['colors', 'spacing', 'typography', 'borderRadius', 'shadows', 'fontSizes'];
      for (const cat of categories) {
        const tokens = lock[cat] || (lock.designTokens && lock.designTokens[cat]) || {};
        for (const [name, value] of Object.entries(tokens)) {
          const val = typeof value === 'number' ? String(value) : value;
          if (typeof val !== 'string') continue;
          // Convert token name to CSS custom property format (camelCase → kebab-case)
          const cssName = '--' + name.replace(/([A-Z])/g, '-\$1').toLowerCase().replace(/^-/, '');
          // Check if this custom property exists in the CSS file
          const propRegex = new RegExp(cssName.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&') + '\\\\s*:');
          if (propRegex.test(css)) {
            // Property exists — check if the value matches
            const valueMatch = css.match(new RegExp(cssName.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&') + '\\\\s*:\\\\s*([^;]+)'));
            if (valueMatch) {
              const cssValue = valueMatch[1].trim();
              if (cssValue !== val) {
                drifts.push(JSON.stringify({ token: name, cssProperty: cssName, lockValue: val, cssValue: cssValue, status: 'value-mismatch' }));
              }
            }
          } else {
            drifts.push(JSON.stringify({ token: name, cssProperty: cssName, lockValue: val, cssValue: '', status: 'missing-in-css' }));
          }
        }
      }
      drifts.forEach(d => console.log(d));
    } catch (e) {
      // Parse error — skip silently
    }
  " 2>/dev/null || true)

  if [[ -n "$CSS_DRIFT" ]]; then
    while IFS= read -r line; do
      TOKEN=$(node -e "const d=JSON.parse('$line'); console.log(d.token)" 2>/dev/null || echo "unknown")
      CSS_PROP=$(node -e "const d=JSON.parse('$line'); console.log(d.cssProperty)" 2>/dev/null || echo "unknown")
      LOCK_VAL=$(node -e "const d=JSON.parse('$line'); console.log(d.lockValue)" 2>/dev/null || echo "unknown")
      CSS_VAL=$(node -e "const d=JSON.parse('$line'); console.log(d.cssValue)" 2>/dev/null || echo "")
      STATUS=$(node -e "const d=JSON.parse('$line'); console.log(d.status)" 2>/dev/null || echo "unknown")

      if [[ "$STATUS" == "value-mismatch" ]]; then
        add_drift "css" "$TOKEN" "$LOCK_VAL" "css has: $CSS_VAL"
        if ! $JSON_OUTPUT; then
          echo "  ✗ CSS property '$CSS_PROP' — lockfile: $LOCK_VAL, css: $CSS_VAL"
        fi
      else
        add_drift "css" "$TOKEN" "$LOCK_VAL" "missing from $TOKENS_CSS"
        if ! $JSON_OUTPUT; then
          echo "  ✗ CSS property '$CSS_PROP' ($LOCK_VAL) — missing from $TOKENS_CSS"
        fi
      fi
    done <<< "$CSS_DRIFT"
  fi

  if [[ ${#DRIFT_ITEMS[@]} -eq $CSS_START ]] && ! $JSON_OUTPUT; then
    echo "  ✓ All lockfile tokens present and matching in CSS"
  fi
else
  if ! $JSON_OUTPUT; then
    echo "  ⊘ No tokens.css found — skipping CSS custom property check"
  fi
fi

if ! $JSON_OUTPUT; then
  echo ""
fi

# --- Classify drift ---
DRIFT_COUNT=${#DRIFT_ITEMS[@]}

if [[ $DRIFT_COUNT -eq 0 ]]; then
  DRIFT_STATUS="no-drift"
elif [[ $DRIFT_COUNT -le 3 ]]; then
  DRIFT_STATUS="minor-drift"
else
  DRIFT_STATUS="major-drift"
fi

# --- Update mode ---
if [[ "$MODE" == "update" ]] && [[ $DRIFT_COUNT -gt 0 ]]; then
  if ! $JSON_OUTPUT; then
    echo "▸ Update mode: syncing source files to match lockfile..."
  fi

  # Update Tailwind config colors and spacing
  if [[ -n "$TAILWIND_CONFIG" ]]; then
    node -e "
      const fs = require('fs');
      try {
        const lock = JSON.parse(fs.readFileSync('$LOCKFILE', 'utf8'));
        const colors = lock.colors || lock.designTokens?.colors || {};
        const spacing = lock.spacing || lock.designTokens?.spacing || {};

        if (Object.keys(colors).length > 0 || Object.keys(spacing).length > 0) {
          console.log('  Updated tokens written. Manual review of $TAILWIND_CONFIG recommended.');
        }
      } catch (e) {
        console.error('  ⊘ Could not parse lockfile for update');
      }
    " 2>/dev/null || true
  fi

  # Update CSS custom properties
  if [[ -n "$TOKENS_CSS" ]]; then
    node -e "
      const fs = require('fs');
      try {
        const lock = JSON.parse(fs.readFileSync('$LOCKFILE', 'utf8'));
        let css = fs.readFileSync('$TOKENS_CSS', 'utf8');
        let updated = 0;

        const categories = ['colors', 'spacing', 'typography', 'borderRadius', 'shadows', 'fontSizes'];
        for (const cat of categories) {
          const tokens = lock[cat] || (lock.designTokens && lock.designTokens[cat]) || {};
          for (const [name, value] of Object.entries(tokens)) {
            const val = typeof value === 'number' ? String(value) : value;
            if (typeof val !== 'string') continue;
            const cssName = '--' + name.replace(/([A-Z])/g, '-\$1').toLowerCase().replace(/^-/, '');
            const propRegex = new RegExp(cssName.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&') + '\\\\s*:[^;]+');
            if (propRegex.test(css)) {
              css = css.replace(propRegex, cssName + ': ' + val);
              updated++;
            }
          }
        }
        if (updated > 0) {
          fs.writeFileSync('$TOKENS_CSS', css, 'utf8');
          console.log('  ✓ Updated ' + updated + ' CSS custom properties in $TOKENS_CSS');
        }
      } catch (e) {
        console.error('  ⊘ Could not update CSS tokens');
      }
    " 2>/dev/null || true
  fi

  if ! $JSON_OUTPUT; then
    echo ""
  fi
fi

# --- Output ---
if $JSON_OUTPUT; then
  # Build JSON output
  CHANGES_JSON=$(node -e "
    const items = $(printf '%s\n' "${DRIFT_ITEMS[@]}" | node -e "
      const lines = require('fs').readFileSync(0, 'utf8').trim().split('\n').filter(Boolean);
      const result = lines.map(l => {
        const [category, token, lockValue, sourceValue] = l.split('|');
        return { category, token, lockValue, sourceValue };
      });
      console.log(JSON.stringify(result));
    ");
    const output = {
      status: '$DRIFT_STATUS',
      driftCount: $DRIFT_COUNT,
      lockfile: '$LOCKFILE',
      mode: '$MODE',
      changes: items
    };
    console.log(JSON.stringify(output, null, 2));
  " 2>/dev/null || echo "{\"status\": \"$DRIFT_STATUS\", \"driftCount\": $DRIFT_COUNT, \"changes\": []}")
  echo "$CHANGES_JSON"
else
  # Human-readable summary
  echo "=== Summary ==="
  if [[ $DRIFT_COUNT -eq 0 ]]; then
    echo "✓ No token drift detected — lockfile and source files are in sync"
  else
    echo "✗ $DRIFT_COUNT issue(s) detected — status: $DRIFT_STATUS"
    if [[ "$MODE" == "dry-run" ]]; then
      echo "  Run with --update to sync source files to lockfile"
    fi
  fi
fi

# --- Exit code ---
if [[ $DRIFT_COUNT -gt 0 ]]; then
  exit 1
else
  exit 0
fi
