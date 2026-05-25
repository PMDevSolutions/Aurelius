import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "verify-test-coverage.sh");

// Use os.tmpdir() so fixtures are NOT under a __tests__/ path.
// The script's find command excludes */__tests__/* which would hide all fixtures
// if they lived inside scripts/__tests__/fixtures/.
const TMP_ROOT = join(tmpdir(), "verify-coverage-tests");
let counter = 0;

function createTmpDir() {
  counter++;
  const dir = join(TMP_ROOT, `run-${counter}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(dir) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, join(dir, "src")], {
      encoding: "utf-8",
      timeout: 15000,
      cwd: dir,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      exitCode: err.status,
    };
  }
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe("verify-test-coverage.sh — all components have tests", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Button.tsx"),
      `import React from 'react';
export const Button = () => <button>Click</button>;`,
    );

    writeFileSync(
      join(dir, "src", "components", "Button.test.tsx"),
      `import { describe, it } from 'vitest';
import { Button } from './Button';
describe('Button', () => { it('renders', () => {}); });`,
    );
  });

  it("passes when every component has a test file", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("All checks passed");
    expect(result.stdout).toContain("have test files");
  });
});

describe("verify-test-coverage.sh — missing test file", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Card.tsx"),
      `export const Card = () => <div>Card</div>;`,
    );
    // No Card.test.tsx
  });

  it("fails when a component is missing its test file", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Missing test");
    expect(result.stdout).toContain("Card.tsx");
  });
});

describe("verify-test-coverage.sh — test imports component", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Header.tsx"),
      `export const Header = () => <header>Header</header>;`,
    );

    // Test that imports its component
    writeFileSync(
      join(dir, "src", "components", "Header.test.tsx"),
      `import { describe, it } from 'vitest';
import { Header } from './Header';
describe('Header', () => { it('renders', () => {}); });`,
    );
  });

  it("passes import check for properly structured tests", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("test files import their components");
  });
});

describe("verify-test-coverage.sh — orphan test (no import)", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Footer.tsx"),
      `export const Footer = () => <footer>Footer</footer>;`,
    );

    // Test that does NOT import its component
    writeFileSync(
      join(dir, "src", "components", "Footer.test.tsx"),
      `import { describe, it } from 'vitest';
describe('Footer', () => { it('renders', () => {}); });`,
    );
  });

  it("warns about tests that may not import their component", () => {
    const result = run(dir);
    expect(result.stdout).toContain("may not import its component");
  });
});

describe("verify-test-coverage.sh — empty test file", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Nav.tsx"),
      `export const Nav = () => <nav>Nav</nav>;`,
    );

    // Empty test file — no describe/it/test blocks
    writeFileSync(
      join(dir, "src", "components", "Nav.test.tsx"),
      `// TODO: add tests\nimport { Nav } from './Nav';`,
    );
  });

  it("detects test files with no test cases", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No test cases found");
  });
});

describe("verify-test-coverage.sh — no component files", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    // Empty src dir, no .tsx files
    writeFileSync(
      join(dir, "src", "utils.ts"),
      `export const add = (a: number, b: number) => a + b;`,
    );
  });

  it("handles no component files gracefully", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No component files found");
  });
});

describe("verify-test-coverage.sh — lockfile text assertion check", () => {
  let dir;
  let hasPython3;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    // Check if python3 is actually available (Windows Store alias doesn't count)
    try {
      execFileSync("python3", ["-c", "print('ok')"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      hasPython3 = true;
    } catch {
      hasPython3 = false;
    }

    // Create lockfile with textContent
    writeFileSync(
      join(dir, "design-tokens.lock.json"),
      JSON.stringify({
        textContent: {
          heading: "Welcome to our app",
          cta: "Get Started",
        },
      }),
    );

    writeFileSync(
      join(dir, "src", "components", "Hero.tsx"),
      `export const Hero = () => <div><h1>Welcome to our app</h1><button>Get Started</button></div>;`,
    );

    // Test that asserts one lockfile text but not the other
    writeFileSync(
      join(dir, "src", "components", "Hero.test.tsx"),
      `import { describe, it, expect } from 'vitest';
import { Hero } from './Hero';
describe('Hero', () => {
  it('shows heading', () => { expect('Welcome to our app').toBeDefined(); });
});`,
    );
  });

  it("detects lockfile text not asserted in tests (requires python3)", () => {
    const result = run(dir);
    if (hasPython3) {
      // "Get Started" is missing from tests
      expect(result.stdout).toContain("Lockfile text not asserted");
      expect(result.stdout).toContain("Get Started");
    } else {
      // Without python3, script skips text content check
      expect(result.stdout).toContain("No text content entries in lockfile");
    }
  });
});

describe("verify-test-coverage.sh — RTL query quality check", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Form.tsx"),
      `export const Form = () => <form><input /></form>;`,
    );

    // Test using a mix of getByRole and getByTestId
    writeFileSync(
      join(dir, "src", "components", "Form.test.tsx"),
      `import { describe, it } from 'vitest';
import { Form } from './Form';
describe('Form', () => {
  it('has role queries', () => { getByRole('textbox'); });
  it('has testid queries', () => { getByTestId('input'); });
});`,
    );
  });

  it("reports on RTL query balance", () => {
    const result = run(dir);
    // Should mention query usage
    expect(result.stdout).toMatch(/query|RTL/i);
  });
});
