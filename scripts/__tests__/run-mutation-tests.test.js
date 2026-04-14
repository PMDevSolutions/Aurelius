import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "run-mutation-tests.sh");
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Tests for run-mutation-tests.sh
 *
 * Note: This script uses PROJECT_ROOT derived from its own location and cd's into it,
 * so it always runs against the actual project. The framework repo has no mutatable
 * source files in src/, so the script skips with "no source files". Tests verify
 * CLI behavior, flag parsing, and JSON output structure.
 */

function run(args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 60000,
      cwd: PROJECT_ROOT,
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

describe("run-mutation-tests.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--threshold");
    expect(result.stdout).toContain("--json");
  });
});

describe("run-mutation-tests.sh — unknown flag", () => {
  it("exits 1 on unknown flag", () => {
    const result = run(["--bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Unknown flag");
  });
});

describe("run-mutation-tests.sh — JSON skipped output", () => {
  it("returns valid JSON with status and required fields", () => {
    const result = run(["--json"]);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toHaveProperty("status");
    expect(["pass", "fail", "skipped", "error"]).toContain(parsed.status);
    expect(parsed).toHaveProperty("score");
    expect(parsed).toHaveProperty("threshold");
    expect(parsed).toHaveProperty("sourceFiles");
  });
});

describe("run-mutation-tests.sh — header output", () => {
  it("outputs Mutation Testing header", () => {
    const result = run([]);
    expect(result.stdout).toContain("Mutation Testing");
  });
});

describe("run-mutation-tests.sh — threshold flag", () => {
  it("respects custom threshold value in JSON output", () => {
    const result = run(["--threshold", "90", "--json"]);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.threshold).toBe(90);
  });

  it("exits 1 when --threshold is passed without a value", () => {
    const result = run(["--threshold"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("--threshold requires a value");
  });
});
