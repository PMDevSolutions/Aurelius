import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "check-dead-code.sh");
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Tests for check-dead-code.sh
 *
 * Note: This script uses PROJECT_ROOT derived from its own location and cd's into it,
 * so it always runs against the actual project. Tests verify CLI behavior and flag parsing.
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

describe("check-dead-code.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--json");
  });
});

describe("check-dead-code.sh — unknown flag", () => {
  it("exits 1 on unknown flag", () => {
    const result = run(["--bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Unknown flag");
  });
});

describe("check-dead-code.sh — runs dead code detection", () => {
  it("outputs Dead Code Detection header", { timeout: 120000 }, () => {
    const result = run([]);
    // Should show the detection header (may pass or fail depending on knip findings)
    expect(result.stdout).toContain("Dead Code Detection");
  });
});

describe("check-dead-code.sh — JSON output", () => {
  it("returns valid JSON with --json flag", { timeout: 120000 }, () => {
    const result = run(["--json"]);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toHaveProperty("status");
    expect(["pass", "fail", "skipped"]).toContain(parsed.status);
  });
});
