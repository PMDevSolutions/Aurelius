#!/usr/bin/env bash
# A component whose test fails because the label is wrong. The lockfile holds
# the right copy, so the fix belongs in the component.
set -euo pipefail

mkdir -p src/components/Button src/styles

cat > package.json <<'EOF'
{
  "name": "eval-app",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
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
  "textContent": { "cta-primary": "Get started" }
}
EOF

cat > src/components/Button/Button.tsx <<'EOF'
export interface ButtonProps {
  onClick?: () => void;
}

export function Button({ onClick }: ButtonProps) {
  return (
    <button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={onClick}>
      Start
    </button>
  );
}
EOF

cat > src/components/Button/Button.test.tsx <<'EOF'
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("shows the primary call to action from the lockfile", () => {
    render(<Button />);
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
  });
});
EOF
