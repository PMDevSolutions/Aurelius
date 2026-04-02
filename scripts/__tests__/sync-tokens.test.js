import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "sync-tokens.sh");

let counter = 0;

function createTmpDir() {
  counter++;
  const dir = join(__dirname, "fixtures", `sync-tokens-${counter}-${Date.now()}`);
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
        if (entry.startsWith("sync-tokens-")) {
          rmSync(join(fixturesDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe("sync-tokens.sh — no lockfile", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();
  });

  it("exits 2 when no lockfile exists", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("No design-tokens.lock.json found");
  });

  it("returns JSON error when no lockfile with --json", () => {
    const result = run(dir, ["--json"]);
    expect(result.exitCode).toBe(2);
    const json = JSON.parse(result.stdout.trim());
    expect(json.error).toContain("No design-tokens.lock.json");
    expect(json.status).toBe("error");
  });
});

describe("sync-tokens.sh — no drift", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();

    // Lockfile with colors
    writeFileSync(
      join(dir, "design-tokens.lock.json"),
      JSON.stringify({
        colors: {
          primary: "#3b82f6",
          secondary: "#10b981",
        },
        spacing: {
          sm: "0.5rem",
        },
      }),
    );

    // Tailwind config containing those values
    writeFileSync(
      join(dir, "tailwind.config.ts"),
      `export default {
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#10b981',
      },
      spacing: {
        sm: '0.5rem',
      },
    },
  },
};`,
    );
  });

  it("exits 0 when no drift detected", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No token drift detected");
  });
});

describe("sync-tokens.sh — color drift detected", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();

    writeFileSync(
      join(dir, "design-tokens.lock.json"),
      JSON.stringify({
        colors: {
          primary: "#3b82f6",
          missing: "#ef4444",
        },
      }),
    );

    // Tailwind config with only primary, missing "missing" color
    writeFileSync(
      join(dir, "tailwind.config.ts"),
      `export default {
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
      },
    },
  },
};`,
    );
  });

  it("exits 1 when color drift detected", () => {
    const result = run(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("issue(s) detected");
  });
});

describe("sync-tokens.sh — JSON output", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();

    writeFileSync(
      join(dir, "design-tokens.lock.json"),
      JSON.stringify({
        colors: {
          primary: "#3b82f6",
          danger: "#dc2626",
        },
      }),
    );

    // Tailwind config missing danger color
    writeFileSync(
      join(dir, "tailwind.config.ts"),
      `export default {
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
      },
    },
  },
};`,
    );
  });

  it("returns valid JSON with --json flag", () => {
    const result = run(dir, ["--json"]);
    expect(result.exitCode).toBe(1);
    // The JSON output may have some extra text; find the JSON object
    const jsonStr = result.stdout.trim();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.status).toMatch(/drift/);
    expect(parsed.driftCount).toBeGreaterThan(0);
  });
});

describe("sync-tokens.sh — no tailwind config", () => {
  let dir;

  beforeAll(() => {
    dir = createTmpDir();

    writeFileSync(
      join(dir, "design-tokens.lock.json"),
      JSON.stringify({ colors: { primary: "#3b82f6" } }),
    );
    // No tailwind.config.ts or .js
  });

  it("skips color check when no tailwind config found", () => {
    const result = run(dir);
    expect(result.stdout).toContain("No tailwind.config found");
  });
});

describe("sync-tokens.sh — help flag", () => {
  it("shows usage and exits 0 with --help", () => {
    const dir = createTmpDir();
    const result = run(dir, ["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--dry-run");
  });
});
