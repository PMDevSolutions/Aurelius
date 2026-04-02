import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "audit-cross-browser-css.sh");

let counter = 0;

function createTmpDir() {
  counter++;
  const dir = join(__dirname, "fixtures", `audit-css-${counter}-${Date.now()}`);
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
        if (entry.startsWith("audit-css-")) {
          rmSync(join(fixturesDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe("audit-cross-browser-css.sh — clean project", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "styles.css"),
      `.button {
  background: var(--primary);
  border-radius: 4px;
}`,
    );
  });

  it("reports no issues on clean CSS", () => {
    const result = run(dir, [join(dir, "src")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Issues found: 0");
    expect(result.stdout).toContain("All clear");
  });
});

describe("audit-cross-browser-css.sh — webkit prefix detection", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "app.css"),
      `.gradient {
  -webkit-linear-gradient(top, red, blue);
  background: linear-gradient(top, red, blue);
}`,
    );
  });

  it("detects -webkit- prefixed properties", () => {
    const result = run(dir, [join(dir, "src")]);
    expect(result.stdout).toContain("-webkit-");
    expect(result.stdout).toContain("Vendor prefix");
  });
});

describe("audit-cross-browser-css.sh — backdrop-filter without prefix", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "overlay.css"),
      `.overlay {
  backdrop-filter: blur(10px);
}`,
    );
  });

  it("detects backdrop-filter without -webkit- prefix", () => {
    const result = run(dir, [join(dir, "src")]);
    expect(result.stdout).toContain("backdrop-filter");
    expect(result.stdout).toContain("Safari");
  });
});

describe("audit-cross-browser-css.sh — :focus without :focus-visible", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "forms.css"),
      `input:focus {
  outline: 2px solid blue;
}`,
    );
  });

  it("flags :focus usage without :focus-visible", () => {
    const result = run(dir, [join(dir, "src")]);
    expect(result.stdout).toContain(":focus");
    expect(result.stdout).toContain(":focus-visible");
  });
});

describe("audit-cross-browser-css.sh — summary with issue count", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "mixed.css"),
      `.a { -webkit-transition: all 0.3s; }
.b:focus { outline: none; }
.c { backdrop-filter: blur(5px); }`,
    );
  });

  it("counts total issues in summary", () => {
    const result = run(dir, [join(dir, "src")]);
    expect(result.stdout).toContain("Issues found:");
    // Should have at least 2 issues (webkit prefix + focus or backdrop)
    const match = result.stdout.match(/Issues found: (\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1], 10)).toBeGreaterThanOrEqual(2);
  });
});
