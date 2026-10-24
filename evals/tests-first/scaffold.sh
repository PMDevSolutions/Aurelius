#!/usr/bin/env bash
# A small React + Vitest app with a token lockfile and no Toggle yet.
set -euo pipefail

mkdir -p src/components src/styles

cat > package.json <<'EOF'
{
  "name": "eval-app",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vitest": "^4.0.0"
  }
}
EOF

cat > src/styles/design-tokens.lock.json <<'EOF'
{
  "version": "1.0.0",
  "generatedAt": "2026-10-20T10:00:00Z",
  "figmaFileKey": "eval",
  "colors": {
    "semantic": {
      "primary": { "hex": "#2563eb", "tailwind": "primary" },
      "muted": { "hex": "#e5e7eb", "tailwind": "muted" }
    }
  }
}
EOF
