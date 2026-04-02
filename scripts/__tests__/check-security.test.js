import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "check-security.sh");
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Tests for check-security.sh
 *
 * Note: This script uses PROJECT_ROOT derived from its own location and cd's into it,
 * so it always runs against the actual project. Tests verify CLI behavior and flag parsing.
 * Tests that run pnpm audit need extended timeouts.
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

describe("check-security.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--level");
    expect(result.stdout).toContain("--no-fail");
    expect(result.stdout).toContain("--json");
  });
});

describe("check-security.sh — runs audit", { timeout: 120000 }, () => {
  it("outputs Security Audit header and summary", () => {
    const result = run(["--no-fail"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("=== Security Audit ===");
    expect(result.stdout).toContain("Running pnpm audit");
    expect(result.stdout).toContain("Scanning for security anti-patterns");
    expect(result.stdout).toContain("Checking for outdated packages");
    expect(result.stdout).toContain("=== Summary ===");
  });

  it("exits 0 with --no-fail regardless of issues", () => {
    const result = run(["--no-fail"]);
    expect(result.exitCode).toBe(0);
  });
});

describe("check-security.sh — JSON output", { timeout: 120000 }, () => {
  it("returns valid JSON with --json --no-fail", () => {
    const result = run(["--json", "--no-fail"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toHaveProperty("status");
    expect(parsed).toHaveProperty("auditLevel");
    expect(parsed).toHaveProperty("issueCount");
    expect(parsed).toHaveProperty("antiPatternCount");
    expect(parsed).toHaveProperty("envInGitignore");
    expect(parsed).toHaveProperty("hasVulnerabilities");
    expect(parsed).toHaveProperty("hasOutdatedPackages");
  });

  it("auditLevel defaults to moderate", () => {
    const result = run(["--json", "--no-fail"]);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.auditLevel).toBe("moderate");
  });
});

describe("check-security.sh — --level flag", { timeout: 120000 }, () => {
  it("accepts critical level", () => {
    const result = run(["--level", "critical", "--no-fail"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("critical");
  });
});
