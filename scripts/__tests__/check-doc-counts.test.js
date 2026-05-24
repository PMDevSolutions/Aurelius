import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, existsSync, statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "check-doc-counts.sh");
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Tests for check-doc-counts.sh
 *
 * The script derives PROJECT_ROOT from its own location and cd's into it, so
 * it always runs against the actual repo. Expected counts are recomputed here
 * from the filesystem rather than hardcoded, so the test stays correct when
 * agents or skills are added or removed.
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
    return { stdout: err.stdout || "", stderr: err.stderr || "", exitCode: err.status };
  }
}

function countAgents() {
  const dir = join(PROJECT_ROOT, ".claude", "agents");
  return readdirSync(dir).filter(
    (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
  ).length;
}

function countSkills() {
  const dir = join(PROJECT_ROOT, ".claude", "skills");
  return readdirSync(dir).filter((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() && existsSync(join(full, "SKILL.md"));
  }).length;
}

describe("check-doc-counts.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--json");
  });
});

describe("check-doc-counts.sh — unknown flag", () => {
  it("exits 2 on unknown argument", () => {
    const result = run(["--bogus"]);
    expect(result.exitCode).toBe(2);
  });
});

describe("check-doc-counts.sh — human-readable run", () => {
  it("prints the header and the on-disk counts", () => {
    const result = run([]);
    expect(result.stdout).toContain("Documentation Count Check");
    expect(result.stdout).toContain(`${countAgents()} agents, ${countSkills()} skills`);
  });

  it("reports docs in sync (exit 0) — guards against count drift", () => {
    const result = run([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("match the entries on disk");
  });
});

describe("check-doc-counts.sh — JSON output", () => {
  it("returns valid JSON reflecting the disk counts", () => {
    const result = run(["--json"]);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.agents).toBe(countAgents());
    expect(parsed.skills).toBe(countSkills());
    expect(parsed).toHaveProperty("drift");
    expect(Array.isArray(parsed.violations)).toBe(true);
    // violations array length is consistent with the drift count
    expect(parsed.violations.length).toBe(parsed.drift);
  });
});
