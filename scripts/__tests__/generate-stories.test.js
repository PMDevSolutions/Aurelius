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
const SCRIPT = join(__dirname, "..", "generate-stories.sh");

let counter = 0;

function createTmpDir() {
  counter++;
  const dir = join(__dirname, "fixtures", `gen-stories-${counter}-${Date.now()}`);
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
        if (entry.startsWith("gen-stories-")) {
          rmSync(join(fixturesDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe("generate-stories.sh — no components directory", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
  });

  it("exits 0 with skip message when no src/components", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No src/components directory found");
  });
});

describe("generate-stories.sh — generates story for component", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });

    writeFileSync(
      join(dir, "src", "components", "Button.tsx"),
      `export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export function Button({ children, variant = 'primary' }: ButtonProps) {
  return <button className={variant}>{children}</button>;
}`,
    );
  });

  it("generates a .stories.tsx file with correct structure", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Generated:");
    expect(result.stdout).toContain("Button");

    const storyFile = join(dir, "src", "components", "Button.stories.tsx");
    expect(existsSync(storyFile)).toBe(true);

    const content = readFileSync(storyFile, "utf-8");
    expect(content).toContain("import type { Meta, StoryObj }");
    expect(content).toContain("import { Button }");
    expect(content).toContain("component: Button");
    expect(content).toContain("export const Default: Story");
    expect(content).toContain("tags: ['autodocs']");
  });
});

describe("generate-stories.sh — dry run mode", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "components", "Card.tsx"),
      `export const Card = () => <div>Card</div>;`,
    );
  });

  it("reports what would be generated without writing files", () => {
    const result = run(dir, ["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Would generate:");
    expect(result.stdout).toContain("dry run");

    const storyFile = join(dir, "src", "components", "Card.stories.tsx");
    expect(existsSync(storyFile)).toBe(false);
  });
});

describe("generate-stories.sh — skips existing stories", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "components", "Nav.tsx"),
      `export function Nav() { return <nav>Nav</nav>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "Nav.stories.tsx"),
      `// existing story`,
    );
  });

  it("skips components that already have stories", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped (story exists)");
  });
});

describe("generate-stories.sh — force regeneration", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "components", "Nav.tsx"),
      `export function Nav() { return <nav>Nav</nav>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "Nav.stories.tsx"),
      `// old story content`,
    );
  });

  it("regenerates stories with --force flag", () => {
    const result = run(dir, ["--force"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Generated:");

    const content = readFileSync(
      join(dir, "src", "components", "Nav.stories.tsx"),
      "utf-8",
    );
    expect(content).toContain("import type { Meta, StoryObj }");
  });
});

describe("generate-stories.sh — skips non-component files", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    // File with no exported component (lowercase function)
    writeFileSync(
      join(dir, "src", "components", "utils.tsx"),
      `export function formatDate(d: Date) { return d.toISOString(); }`,
    );
  });

  it("skips files with no exported React component", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped (no exported component)");
  });
});

describe("generate-stories.sh — summary counts", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "components", "A.tsx"),
      `export function Alpha() { return <div>A</div>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "B.tsx"),
      `export function Beta() { return <div>B</div>; }`,
    );
    // Already has story
    writeFileSync(
      join(dir, "src", "components", "C.tsx"),
      `export function Charlie() { return <div>C</div>; }`,
    );
    writeFileSync(
      join(dir, "src", "components", "C.stories.tsx"),
      `// existing`,
    );
  });

  it("shows correct generated and skipped counts", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Generated: 2");
    expect(result.stdout).toContain("Skipped:   1");
  });
});
