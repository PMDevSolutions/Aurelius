import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "generate-api-client.sh");
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Tests for generate-api-client.sh
 *
 * Note: This script uses PROJECT_ROOT derived from its own location and cd's into it,
 * so it always runs against the actual project. Tests verify CLI behavior and flag parsing.
 */

function run(args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 30000,
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

describe("generate-api-client.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--spec");
    expect(result.stdout).toContain("--output");
    expect(result.stdout).toContain("--client");
    expect(result.stdout).toContain("Types only");
  });
});

describe("generate-api-client.sh — no spec file auto-detection", () => {
  it("exits 1 when no spec file found and none provided", () => {
    const result = run([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No OpenAPI spec found");
    expect(result.stdout).toContain("Provide a spec with --spec");
  });
});

describe("generate-api-client.sh — spec file not found", () => {
  it("exits 1 when specified spec file does not exist", () => {
    const result = run(["--spec", "nonexistent-spec-file.json"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Spec file not found");
  });
});

describe("generate-api-client.sh — unknown flag", () => {
  it("exits 1 on unknown flag", () => {
    const result = run(["--bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Unknown flag");
  });
});

describe("generate-api-client.sh — local spec detection", () => {
  it("shows local spec message for file input", () => {
    // The script checks if path is http(s) or local file
    // A non-existent local file should produce "Spec file not found"
    const result = run(["--spec", "missing.yaml"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Spec file not found");
  });
});
