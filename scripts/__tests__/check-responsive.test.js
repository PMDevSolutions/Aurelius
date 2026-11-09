import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "check-responsive.sh");
const REPO_ROOT = join(__dirname, "..", "..");

function run(args = [], { cwd, bin } = {}) {
  const env = bin ? { ...process.env, PATH: `${bin}:${process.env.PATH}` } : process.env;
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 15000,
      cwd,
      env,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      exitCode: err.status,
    };
  }
}

describe("check-responsive.sh — help flag", () => {
  it("shows usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("url");
    expect(result.stdout).toContain("output-dir");
    expect(result.stdout).toContain("breakpoints");
  });
});

/**
 * A pnpm stand-in: records the directory each call runs in and reports
 * Playwright as not installed, so the script takes its install path.
 */
function fakePnpm(dir, log) {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env bash
printf '%s :: %s\\n' "$PWD" "$*" >> "${log}"
case "$*" in
  "exec playwright --version") exit 1 ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return bin;
}

/**
 * An app scaffolded beside the framework (`./scripts/setup-project.sh my-app`)
 * is its own pnpm root. Run from that directory, the script must install
 * Playwright there, not in the Aurelius checkout (issue #145).
 */
describe("check-responsive.sh — Playwright goes where the app is", () => {
  function scenario(withPackageJson) {
    const dir = mkdtempSync(join(tmpdir(), "aurelius-responsive-"));
    const app = join(dir, "my-app");
    mkdirSync(app);
    if (withPackageJson) writeFileSync(join(app, "package.json"), '{ "name": "my-app" }\n');
    const log = join(dir, "pnpm.log");
    writeFileSync(log, "");
    const bin = fakePnpm(dir, log);
    const result = run(["http://localhost:5173", join(dir, "out")], { cwd: app, bin });
    const calls = readFileSync(log, "utf-8").trim().split("\n").filter(Boolean);
    rmSync(dir, { recursive: true, force: true });
    return { app, calls, result };
  }

  it("installs @playwright/test and its browser in the directory it was run from when that is an app", () => {
    const { app, calls } = scenario(true);
    expect(calls).toContain(`${app} :: add -D @playwright/test`);
    expect(calls).toContain(`${app} :: exec playwright install chromium`);
    expect(calls.some((c) => c.startsWith(`${REPO_ROOT} ::`))).toBe(false);
  });

  it("falls back to the Aurelius root when the current directory has no package.json", () => {
    const { calls } = scenario(false);
    expect(calls).toContain(`${REPO_ROOT} :: add -D @playwright/test`);
  });
});
