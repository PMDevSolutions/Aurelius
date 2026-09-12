#!/usr/bin/env bash
# generate-api-client.sh — Generate typed API client from OpenAPI spec
# Exit codes: 0=success, 1=error (no spec found, generation failed)
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Defaults ---
SPEC_PATH=""
OUTPUT_DIR="src/api/generated"
CLIENT_MODE=false

# --- Flags ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --spec)
      shift
      SPEC_PATH="${1:-}"
      if [[ -z "$SPEC_PATH" ]]; then
        echo "  ✗ --spec requires a path or URL argument"
        exit 1
      fi
      ;;
    --output)
      shift
      OUTPUT_DIR="${1:-}"
      if [[ -z "$OUTPUT_DIR" ]]; then
        echo "  ✗ --output requires a directory argument"
        exit 1
      fi
      ;;
    --client)
      CLIENT_MODE=true
      ;;
    -h|--help)
      echo "Usage: generate-api-client.sh [--spec <path-or-url>] [--output <dir>] [--client]"
      echo ""
      echo "  --spec <path-or-url>  Path to OpenAPI JSON/YAML or URL (auto-detected if omitted)"
      echo "  --output <dir>        Output directory (default: src/api/generated)"
      echo "  --client              Generate full API client with orval (default: types only)"
      echo "  -h, --help            Show this help message"
      echo ""
      echo "Modes:"
      echo "  Types only (default):  Generates TypeScript types via openapi-typescript"
      echo "  Full client (--client): Generates typed client with orval"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1"
      exit 1
      ;;
  esac
  shift
done

echo "=== API Client Generation ==="
echo ""

# --- Auto-detect spec file if not provided ---
if [[ -z "$SPEC_PATH" ]]; then
  echo "▸ Auto-detecting OpenAPI spec file..."
  CANDIDATES=("openapi.json" "openapi.yaml" "openapi.yml" "api-spec.json" "api-spec.yaml")
  for candidate in "${CANDIDATES[@]}"; do
    if [[ -f "$candidate" ]]; then
      SPEC_PATH="$candidate"
      echo "  ✓ Found spec: $SPEC_PATH"
      break
    fi
  done

  if [[ -z "$SPEC_PATH" ]]; then
    echo "  ✗ No OpenAPI spec found. Searched for: ${CANDIDATES[*]}"
    echo "  Provide a spec with --spec <path-or-url>"
    exit 1
  fi
  echo ""
fi

# --- Validate spec (if local file) ---
if [[ "$SPEC_PATH" != http://* && "$SPEC_PATH" != https://* ]]; then
  if [[ ! -f "$SPEC_PATH" ]]; then
    echo "  ✗ Spec file not found: $SPEC_PATH"
    exit 1
  fi
  echo "▸ Using local spec: $SPEC_PATH"
else
  echo "▸ Using remote spec: $SPEC_PATH"
fi
echo ""

# --- Ensure output directory exists ---
mkdir -p "$OUTPUT_DIR"

# --- Types-only mode (openapi-typescript) ---
if ! $CLIENT_MODE; then
  echo "▸ Generating TypeScript types with openapi-typescript..."

  # Auto-install if not present
  if ! npx openapi-typescript --version &>/dev/null; then
    echo "  ▸ Installing openapi-typescript..."
    pnpm add -D openapi-typescript 2>/dev/null || {
      echo "  ✗ Failed to install openapi-typescript. Run 'pnpm add -D openapi-typescript' manually."
      exit 1
    }
    echo "  ✓ openapi-typescript installed"
  fi

  npx openapi-typescript "$SPEC_PATH" -o "$OUTPUT_DIR/api-types.ts" || {
    echo ""
    echo "  ✗ Type generation failed"
    exit 1
  }

  echo ""
  echo "=== Summary ==="
  echo "✓ API types generated → $OUTPUT_DIR/api-types.ts"
  exit 0
fi

# --- Full client mode (orval) ---
echo "▸ Generating full API client with orval..."

# Auto-install if not present
if ! npx orval --version &>/dev/null; then
  echo "  ▸ Installing orval..."
  pnpm add -D orval 2>/dev/null || {
    echo "  ✗ Failed to install orval. Run 'pnpm add -D orval' manually."
    exit 1
  }
  echo "  ✓ orval installed"
fi

# Create orval.config.ts if missing
if [[ ! -f "orval.config.ts" ]]; then
  echo "  ▸ Creating default orval.config.ts..."
  cat > orval.config.ts <<ORVAL_EOF
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      target: '${SPEC_PATH}',
    },
    output: {
      target: '${OUTPUT_DIR}/api-client.ts',
      schemas: '${OUTPUT_DIR}/models',
      client: 'react-query',
      mode: 'tags-split',
      prettier: true,
    },
  },
});
ORVAL_EOF
  echo "  ✓ orval.config.ts created"
fi

npx orval || {
  echo ""
  echo "  ✗ Client generation failed"
  exit 1
}

echo ""
echo "=== Summary ==="
echo "✓ API client generated → $OUTPUT_DIR/"
exit 0
