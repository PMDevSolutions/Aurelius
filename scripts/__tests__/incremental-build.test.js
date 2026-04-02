import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "incremental-build.sh");

function run(args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 15000,
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

describe("incremental-build.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Incremental Build Runner");
    expect(result.stdout).toContain("--force");
    expect(result.stdout).toContain("--no-cache");
    expect(result.stdout).toContain("--parallel");
    expect(result.stdout).toContain("--verbose");
  });

  it("lists all available phases", () => {
    const result = run(["--help"]);
    expect(result.stdout).toContain("lint");
    expect(result.stdout).toContain("types");
    expect(result.stdout).toContain("tests");
    expect(result.stdout).toContain("build");
    expect(result.stdout).toContain("bundle");
    expect(result.stdout).toContain("a11y");
    expect(result.stdout).toContain("tokens");
    expect(result.stdout).toContain("quality");
  });
});

describe("incremental-build.sh — unknown phase", () => {
  it("exits 1 for unknown phase name", () => {
    const result = run(["nonexistent-phase"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Unknown phase");
  });
});

describe("incremental-build.sh — displays configuration", () => {
  it("shows cache and profiling status when running a phase", () => {
    // Running 'lint' phase will fail without an actual project, but should display config first
    const result = run(["lint", "--no-cache", "--no-profile"]);
    expect(result.stdout).toContain("Cache: disabled");
    expect(result.stdout).toContain("Profiling: disabled");
  });
});
