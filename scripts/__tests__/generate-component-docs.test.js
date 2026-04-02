import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "generate-component-docs.sh");

let counter = 0;

function createTmpDir() {
  counter++;
  const dir = join(__dirname, "fixtures", `gen-docs-${counter}-${Date.now()}`);
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

afterAll(() => {
  const fixturesDir = join(__dirname, "fixtures");
  if (existsSync(fixturesDir)) {
    try {
      for (const entry of readdirSync(fixturesDir)) {
        if (entry.startsWith("gen-docs-")) {
          rmSync(join(fixturesDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe("generate-component-docs.sh — no components", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    // Empty components dir
  });

  it("exits 2 when no component files found", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("No component files found");
  });
});

describe("generate-component-docs.sh — generates MDX docs", () => {
  let dir;
  const outputDir = "docs/components";

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Button.tsx"),
      `/** A reusable button component */
export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ children, onClick }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}`,
    );

    // Add test file so status shows "yes"
    writeFileSync(
      join(dir, "src", "components", "Button.test.tsx"),
      `import { describe, it } from 'vitest';
import { Button } from './Button';
describe('Button', () => { it('renders', () => {}); });`,
    );
  });

  it("generates MDX file with component docs", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Button.mdx");

    const mdxPath = join(dir, outputDir, "Button.mdx");
    expect(existsSync(mdxPath)).toBe(true);

    const content = readFileSync(mdxPath, "utf-8");
    expect(content).toContain("# Button");
    expect(content).toContain("ButtonProps");
    expect(content).toContain("Has Tests | yes");
    expect(content).toContain("**Source:**");
  });

  it("generates index.mdx with component table", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const indexPath = join(dir, outputDir, "index.mdx");
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("# Component Documentation");
    expect(content).toContain("Button");
  });
});

describe("generate-component-docs.sh — custom output dir", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "components", "Card.tsx"),
      `export function Card() { return <div>Card</div>; }`,
    );
  });

  it("writes to specified output directory", () => {
    const customDir = "custom-docs";
    const result = run(dir, ["--output-dir", customDir]);
    expect(result.exitCode).toBe(0);

    expect(existsSync(join(dir, customDir, "Card.mdx"))).toBe(true);
    expect(existsSync(join(dir, customDir, "index.mdx"))).toBe(true);
  });
});

describe("generate-component-docs.sh — component without tests or stories", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "components", "Orphan.tsx"),
      `export function Orphan() { return <div>Orphan</div>; }`,
    );
  });

  it("shows no tests/no stories in status table", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);

    const mdxPath = join(dir, "docs", "components", "Orphan.mdx");
    const content = readFileSync(mdxPath, "utf-8");
    expect(content).toContain("Has Tests | no");
    expect(content).toContain("Has Stories | no");
  });
});
