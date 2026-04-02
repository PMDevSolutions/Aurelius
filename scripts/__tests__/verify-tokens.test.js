import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "verify-tokens.sh");

/**
 * Tests for verify-tokens.sh
 *
 * Strategy: create a temp directory with controlled src/ files and optional lockfile,
 * then run the script from that directory.
 */

let counter = 0;

function createTmpDir() {
  counter++;
  const dir = join(__dirname, `fixtures`, `verify-tokens-${counter}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(cwd, args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 15000,
      cwd,
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

function setupCleanProject(dir) {
  mkdirSync(join(dir, "src"), { recursive: true });
  // A clean component with no violations
  writeFileSync(
    join(dir, "src", "Button.tsx"),
    `import React from 'react';
export const Button = ({ children }: { children: React.ReactNode }) => (
  <button className="bg-primary text-white">{children}</button>
);
`,
  );
}

afterAll(() => {
  // Clean up all fixture dirs created during tests
  const fixturesDir = join(__dirname, "fixtures");
  if (existsSync(fixturesDir)) {
    try {
      const entries = readdirSync(fixturesDir);
      for (const entry of entries) {
        if (entry.startsWith("verify-tokens-")) {
          rmSync(join(fixturesDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe("verify-tokens.sh — clean project", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    setupCleanProject(dir);
  });

  it("passes with no violations", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("All checks passed");
    expect(result.stdout).toContain("No hardcoded hex colors");
  });
});

describe("verify-tokens.sh — hardcoded hex colors", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "Card.tsx"),
      `export const Card = () => <div style={{ color: '#ff0000' }} className="p-4">#abc123 text</div>;`,
    );
  });

  it("detects hardcoded hex colors in tsx files", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Hardcoded hex colors found");
    expect(result.stdout).toContain("violation(s) found");
  });
});

describe("verify-tokens.sh — token-ok exception", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "Logo.tsx"),
      `export const Logo = () => <div className="text-[#ff0000]">Logo</div>; // token-ok`,
    );
  });

  it("allows // token-ok exceptions", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No hardcoded hex colors");
  });
});

describe("verify-tokens.sh — arbitrary Tailwind values", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "Spacer.tsx"),
      `export const Spacer = () => <div className="w-[42px] h-[100px]" />;`,
    );
  });

  it("detects arbitrary pixel values in Tailwind classes", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Arbitrary pixel values found");
  });
});

describe("verify-tokens.sh — inline styles", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "Badge.tsx"),
      `export const Badge = () => <span style={{ padding: '4px' }}>New</span>;`,
    );
  });

  it("detects inline style={{}} attributes", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Inline styles found");
  });
});

describe("verify-tokens.sh — CSS hex colors", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    // Clean tsx
    writeFileSync(join(dir, "src", "App.tsx"), `export const App = () => <div>Hello</div>;`);
    // CSS with hardcoded color (not in tokens.css or globals.css)
    writeFileSync(join(dir, "src", "custom.css"), `.highlight { color: #ff5733; }`);
  });

  it("detects hardcoded hex colors in CSS files", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Hardcoded hex colors in CSS");
  });
});

describe("verify-tokens.sh — no lockfile", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    setupCleanProject(dir);
  });

  it("skips text content drift check when no lockfile exists", () => {
    const result = run(dir);
    expect(result.stdout).toContain("No design-tokens.lock.json found");
  });
});
