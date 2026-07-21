import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-all.sh");

/**
 * Tests for scripts/verify-all.sh
 *
 * Strategy: build a temp project containing stub check scripts at the paths
 * the orchestrator expects, plus the marker files that make conditional checks
 * run (brand-guidelines.json, content/, content-calendar.json). Each stub
 * exits with a known code so we can assert the orchestrator threads results
 * through without depending on the real (slower) checks.
 */

const CHECKS = [
  ["brand-voice", "brand-voice-lint.js", "js"],
  ["readability", "readability-score.js", "js"],
  ["seo", "seo-check.js", "js"],
  ["calendar", "validate-content-calendar.js", "js"],
  ["pipeline-config", "validate-pipeline-config.js", "js"],
  ["doc-counts", "check-doc-counts.sh", "sh"],
  ["agent-plugins", "verify-agent-plugins.sh", "sh"],
];

const cleanups = [];
afterAll(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

/** Build a temp project with stub scripts. exitCodes: {checkName: code}. */
function makeProject(exitCodes = {}) {
  const dir = mkdtempSync(join(tmpdir(), "verify-all-"));
  cleanups.push(dir);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "content"), { recursive: true });
  writeFileSync(join(dir, "brand-guidelines.json"), "{}\n");
  writeFileSync(join(dir, "content-calendar.json"), "{}\n");
  // agent-plugins marker so the check runs instead of skipping:
  mkdirSync(join(dir, ".claude", "agent-plugins", "demo"), { recursive: true });
  writeFileSync(join(dir, ".claude", "agent-plugins", "demo", "plugin.json"), "{}\n");

  for (const [name, file, kind] of CHECKS) {
    const code = exitCodes[name] ?? 0;
    if (kind === "js") {
      writeFileSync(join(dir, "scripts", file), `process.exit(${code});\n`);
    } else {
      writeFileSync(join(dir, "scripts", file), `#!/usr/bin/env bash\nexit ${code}\n`);
    }
  }
  return dir;
}

function run(cwd, args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], { cwd, encoding: "utf8" });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout?.toString() ?? "" };
  }
}

describe("verify-all.sh", () => {
  it("--list prints the check registry", () => {
    const { code, stdout } = run(repoRoot, ["--list"]);
    expect(code).toBe(0);
    for (const [name] of CHECKS) expect(stdout).toContain(name);
  });

  it("passes when every check passes", () => {
    const dir = makeProject();
    const { code, stdout } = run(dir);
    expect(code).toBe(0);
    expect(stdout).toContain("All checks passed");
    expect(stdout).toMatch(/Totals: 7 passed, 0 failed, 0 skipped/);
  });

  it("fails with exit 1 when any check fails and names the reproduce command", () => {
    const dir = makeProject({ seo: 1 });
    const { code, stdout } = run(dir);
    expect(code).toBe(1);
    expect(stdout).toContain("Some checks failed");
    expect(stdout).toContain("./scripts/seo-check.js");
  });

  it("skips conditional checks when their subjects are absent", () => {
    const dir = makeProject();
    rmSync(join(dir, "brand-guidelines.json"));
    rmSync(join(dir, "content-calendar.json"));
    const { code, stdout } = run(dir);
    expect(code).toBe(0);
    expect(stdout).toContain("no brand-guidelines.json");
    expect(stdout).toContain("no content-calendar.json");
  });

  it("--skip excludes a named check", () => {
    const dir = makeProject({ "doc-counts": 1 });
    const { code, stdout } = run(dir, ["--skip", "doc-counts"]);
    expect(code).toBe(0);
    expect(stdout).toContain("filtered by --skip/--include");
  });

  it("--include runs only the named checks", () => {
    const dir = makeProject({ seo: 1 });
    const { code } = run(dir, ["--include", "brand-voice,readability"]);
    expect(code).toBe(0);
  });

  it("--json emits parseable machine output", () => {
    const dir = makeProject({ calendar: 1 });
    const { code, stdout } = run(dir, ["--json"]);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.summary.fail).toBe(1);
    const cal = parsed.checks.find((c) => c.name === "calendar");
    expect(cal.status).toBe("fail");
  });

  it("--ci implies JSON output", () => {
    const dir = makeProject();
    const { code, stdout } = run(dir, ["--ci"]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).ok).toBe(true);
  });
});
