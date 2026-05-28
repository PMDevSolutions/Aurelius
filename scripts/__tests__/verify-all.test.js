import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, chmodSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-all.sh");

/**
 * Tests for scripts/verify-all.sh
 *
 * Strategy: build a temp project that contains stub scripts at the paths the
 * orchestrator expects, then invoke verify-all.sh from that project root.
 * Each stub exits with a known code so we can assert the orchestrator threads
 * everything through correctly without depending on the real (slow) checks.
 */

let counter = 0;

const ALL_CHECKS = [
  ["lint-and-format", "lint-and-format.sh"],
  ["types", "check-types.sh"],
  ["tests", "run-tests.sh"],
  ["accessibility", "check-accessibility.sh"],
  ["tokens", "verify-tokens.sh"],
  ["dead-code", "check-dead-code.sh"],
  ["security", "check-security.sh"],
  ["bundle-size", "check-bundle-size.sh"],
  ["agent-plugins", "verify-agent-plugins.sh"],
  ["renderers", "verify-renderers.sh"],
];

function tmpProject({ failing = [], hasBuild = false } = {}) {
  counter++;
  const dir = join(__dirname, "fixtures", `verify-all-${counter}-${Date.now()}`);
  mkdirSync(join(dir, "scripts"), { recursive: true });

  for (const [name, file] of ALL_CHECKS) {
    const exit = failing.includes(name) ? 1 : 0;
    const path = join(dir, "scripts", file);
    writeFileSync(path, `#!/usr/bin/env bash\necho "$0 ran"\nexit ${exit}\n`);
    chmodSync(path, 0o755);
  }

  if (hasBuild) {
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "index.js"), "x");
  }

  return dir;
}

function run(cwd, args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 30000,
      cwd,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.status,
    };
  }
}

afterAll(() => {
  const fixtures = join(__dirname, "fixtures");
  if (existsSync(fixtures)) {
    try {
      for (const e of readdirSync(fixtures)) {
        if (e.startsWith("verify-all-")) {
          rmSync(join(fixtures, e), { recursive: true, force: true });
        }
      }
    } catch {
      // best-effort cleanup
    }
  }
});

describe("--list", () => {
  it("prints all check names and exits 0", () => {
    const r = run(tmpProject(), ["--list"]);
    expect(r.exitCode).toBe(0);
    for (const [name] of ALL_CHECKS) {
      expect(r.stdout).toContain(name);
    }
  });
});

describe("all checks pass", () => {
  it("exits 0 and reports each check in human mode", () => {
    const r = run(tmpProject({ hasBuild: true }));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/All checks passed/);
    for (const [name] of ALL_CHECKS) {
      expect(r.stdout).toContain(name);
    }
  });

  it("exits 0 in --ci JSON mode with ok=true", () => {
    const r = run(tmpProject({ hasBuild: true }), ["--ci"]);
    expect(r.exitCode).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.ok).toBe(true);
    expect(json.summary.fail).toBe(0);
    expect(json.summary.total).toBe(10);
    expect(json.checks).toHaveLength(10);
    for (const check of json.checks) {
      expect(["pass", "skip"]).toContain(check.status);
    }
  });
});

describe("failing checks", () => {
  it("exits 1 when any check fails", () => {
    const r = run(tmpProject({ failing: ["types"], hasBuild: true }));
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("Some checks failed");
    expect(r.stdout).toContain("check-types.sh");
  });

  it("--ci returns ok=false and lists each failure", () => {
    const r = run(tmpProject({ failing: ["lint-and-format", "tests"], hasBuild: true }), ["--ci"]);
    expect(r.exitCode).toBe(1);
    const json = JSON.parse(r.stdout);
    expect(json.ok).toBe(false);
    expect(json.summary.fail).toBe(2);
    const failedNames = json.checks
      .filter((c) => c.status === "fail")
      .map((c) => c.name)
      .sort();
    expect(failedNames).toEqual(["lint-and-format", "tests"]);
  });
});

describe("--skip and --include", () => {
  it("--skip marks excluded checks as skip with the filter reason", () => {
    const r = run(tmpProject({ hasBuild: true }), ["--ci", "--skip", "tests,security"]);
    const json = JSON.parse(r.stdout);
    const skipped = json.checks.filter((c) => c.status === "skip").map((c) => c.name);
    expect(skipped).toEqual(expect.arrayContaining(["tests", "security"]));
    const tests = json.checks.find((c) => c.name === "tests");
    expect(tests.reason).toContain("filtered");
  });

  it("--include runs only the named checks", () => {
    const r = run(tmpProject({ hasBuild: true }), ["--ci", "--include", "tokens,types"]);
    const json = JSON.parse(r.stdout);
    const passed = json.checks.filter((c) => c.status === "pass").map((c) => c.name);
    expect(passed.sort()).toEqual(["tokens", "types"]);
    // The other eight should all be skipped.
    expect(json.summary.pass).toBe(2);
    expect(json.summary.skip).toBe(8);
  });

  it("failure inside --include still triggers exit 1", () => {
    const r = run(tmpProject({ failing: ["tokens"], hasBuild: true }), [
      "--ci",
      "--include",
      "tokens",
    ]);
    expect(r.exitCode).toBe(1);
    const json = JSON.parse(r.stdout);
    expect(json.ok).toBe(false);
  });
});

describe("bundle-size conditional", () => {
  it("skips bundle-size when no build artifact exists", () => {
    const r = run(tmpProject({ hasBuild: false }), ["--ci"]);
    const json = JSON.parse(r.stdout);
    const bundle = json.checks.find((c) => c.name === "bundle-size");
    expect(bundle.status).toBe("skip");
    expect(bundle.reason).toContain("no build artifact");
  });

  it("runs bundle-size when a build artifact exists", () => {
    const r = run(tmpProject({ hasBuild: true }), ["--ci"]);
    const json = JSON.parse(r.stdout);
    const bundle = json.checks.find((c) => c.name === "bundle-size");
    expect(bundle.status).toBe("pass");
  });
});

describe("agent-plugins conditional", () => {
  it("skips agent-plugins when no plugins exist", () => {
    const r = run(tmpProject({ hasBuild: true }), ["--ci"]);
    const json = JSON.parse(r.stdout);
    const ap = json.checks.find((c) => c.name === "agent-plugins");
    expect(ap.status).toBe("skip");
    expect(ap.reason).toContain("no plugins");
  });

  it("runs agent-plugins when a plugin exists", () => {
    const dir = tmpProject({ hasBuild: true });
    mkdirSync(join(dir, ".claude", "agent-plugins", "p"), { recursive: true });
    writeFileSync(join(dir, ".claude", "agent-plugins", "p", "plugin.json"), "{}");
    const wrapper = join(dir, "scripts", "verify-agent-plugins.sh");
    writeFileSync(wrapper, "#!/usr/bin/env bash\necho ran\nexit 0\n");
    chmodSync(wrapper, 0o755);
    const r = run(dir, ["--ci"]);
    const json = JSON.parse(r.stdout);
    const ap = json.checks.find((c) => c.name === "agent-plugins");
    expect(ap.status).toBe("pass");
  });
});

describe("missing check script", () => {
  it("marks the check as skip with a 'script not found' reason", () => {
    const dir = tmpProject({ hasBuild: true });
    rmSync(join(dir, "scripts", "check-types.sh"), { force: true });
    const r = run(dir, ["--ci"]);
    const json = JSON.parse(r.stdout);
    const types = json.checks.find((c) => c.name === "types");
    expect(types.status).toBe("skip");
    expect(types.reason).toContain("script not found");
    // Skips alone should not flip ok to false.
    expect(json.ok).toBe(true);
  });
});

describe("unknown flag", () => {
  it("exits 2 with a helpful error", () => {
    const r = run(tmpProject(), ["--nope"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr ?? "").toContain("Unknown argument");
  });
});

describe("JSON schema", () => {
  it("emits valid JSON with the expected shape", () => {
    const r = run(tmpProject({ hasBuild: true }), ["--json"]);
    const json = JSON.parse(r.stdout);
    expect(json).toHaveProperty("ok");
    expect(json).toHaveProperty("summary.pass");
    expect(json).toHaveProperty("summary.fail");
    expect(json).toHaveProperty("summary.skip");
    expect(json).toHaveProperty("summary.total");
    expect(Array.isArray(json.checks)).toBe(true);
    for (const check of json.checks) {
      expect(check).toHaveProperty("name");
      expect(check).toHaveProperty("status");
      expect(check).toHaveProperty("exitCode");
      expect(check).toHaveProperty("durationMs");
      expect(check).toHaveProperty("reason");
    }
  });
});
