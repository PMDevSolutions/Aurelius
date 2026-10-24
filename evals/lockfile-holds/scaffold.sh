#!/usr/bin/env bash
# A small app whose design values live in the token lockfile and reach the
# components through the Tailwind config and CSS variables.
set -euo pipefail

mkdir -p src/components src/styles

cat > package.json <<'EOF'
{
  "name": "eval-app",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" }
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
      "primary-foreground": { "hex": "#ffffff", "tailwind": "primary-foreground" }
    }
  },
  "radii": { "full": { "px": 9999, "tailwind": "rounded-full" } },
  "spacing": { "1": { "px": 4, "tailwind": "1" }, "2": { "px": 8, "tailwind": "2" } }
}
EOF

cat > src/styles/tokens.css <<'EOF'
:root {
  --color-primary: #2563eb;
  --color-primary-foreground: #ffffff;
}
EOF

cat > tailwind.config.ts <<'EOF'
import type { Config } from "tailwindcss";

// Generated from src/styles/design-tokens.lock.json; components use these names, never raw values.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-foreground": "var(--color-primary-foreground)",
      },
    },
  },
} satisfies Config;
EOF
