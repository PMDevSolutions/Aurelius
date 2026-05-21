import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const HOOKS_DIR = join(repoRoot, ".claude", "hooks");

/**
 * Tests for the PostToolUse hooks in .claude/hooks/.
 *
 * Each hook is invoked as `bash <hook>.sh <TOOL_INPUT> <TOOL_OUTPUT>`
 * and exits 0 even when emitting a reminder. Stdout carries the reminder text
 * (empty if the hook decided not to fire).
 */

let counter = 0;

function tmpProject() {
  counter++;
  const dir = join(__dirname, "fixtures", `hooks-${counter}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  // Drop a minimal pipeline config so the config-reading hooks have data.
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.config.json"),
    JSON.stringify({
      tdd: { coverageThreshold: 85 },
      qualityGate: {
        lighthouseThresholds: { performance: 90, accessibility: 95 },
      },
      bundleSize: { maxSizeKb: 50 },
      mutationTesting: { reminder: true },
    }),
  );
  return dir;
}

function runHook(name, cwd, toolInput = "", toolOutput = "") {
  try {
    const stdout = execFileSync("bash", [join(HOOKS_DIR, name), toolInput, toolOutput], {
      encoding: "utf-8",
      timeout: 15000,
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
        if (e.startsWith("hooks-")) {
          rmSync(join(fixtures, e), { recursive: true, force: true });
        }
      }
    } catch {
      // best-effort cleanup
    }
  }
});

describe("post-build-qa.sh", () => {
  it("emits reminder after a successful pnpm build", () => {
    const r = runHook("post-build-qa.sh", tmpProject(), "pnpm build", "built in 1.2s");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[post-build-qa]");
    expect(r.stdout).toContain("pnpm vitest run");
  });

  it("stays silent for unrelated commands", () => {
    const r = runHook("post-build-qa.sh", tmpProject(), "pnpm dev", "ready");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("exits 0 with no args", () => {
    const r = runHook("post-build-qa.sh", tmpProject());
    expect(r.exitCode).toBe(0);
  });
});

describe("dark-mode-reminder.sh", () => {
  it("emits reminder after visual-diff PASS", () => {
    const r = runHook("dark-mode-reminder.sh", tmpProject(), "node scripts/visual-diff.js", "PASS");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[dark-mode-reminder]");
  });

  it("stays silent on FAIL output", () => {
    const r = runHook(
      "dark-mode-reminder.sh",
      tmpProject(),
      "node scripts/visual-diff.js",
      "FAIL: 5% mismatch",
    );
    expect(r.stdout).toBe("");
  });
});

describe("coverage-check.sh", () => {
  it("uses tdd.coverageThreshold from config", () => {
    const r = runHook(
      "coverage-check.sh",
      tmpProject(),
      "pnpm vitest run --coverage",
      "Coverage report: ...",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[coverage-check]");
    expect(r.stdout).toContain("85% threshold");
  });

  it("falls back to 80% when config missing", () => {
    const dir = join(__dirname, "fixtures", `hooks-bare-${counter++}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const r = runHook(
      "coverage-check.sh",
      dir,
      "pnpm vitest run --coverage",
      "Coverage report: ...",
    );
    expect(r.stdout).toContain("80% threshold");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("lighthouse-ci.sh", () => {
  it("emits config thresholds after build", () => {
    const r = runHook("lighthouse-ci.sh", tmpProject(), "pnpm build", "built in 2.4s");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("performance=90");
    expect(r.stdout).toContain("accessibility=95");
  });

  it("stays silent if build did not finish", () => {
    const r = runHook("lighthouse-ci.sh", tmpProject(), "pnpm build", "compiling...");
    expect(r.stdout).toBe("");
  });
});

describe("bundle-size-guard.sh", () => {
  it("warns when dist exceeds the configured limit", () => {
    const dir = tmpProject();
    mkdirSync(join(dir, "dist"), { recursive: true });
    // Write a file larger than the 50 KB limit set in tmpProject().
    writeFileSync(join(dir, "dist", "big.js"), "x".repeat(60 * 1024));
    const r = runHook("bundle-size-guard.sh", dir, "git commit -m feat", "");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[bundle-guard]");
    expect(r.stdout).toMatch(/above the 50KB limit/);
  });

  it("stays silent when no build dir exists", () => {
    const r = runHook("bundle-size-guard.sh", tmpProject(), "git commit -m feat", "");
    expect(r.stdout).toBe("");
  });

  it("stays silent for non-commit commands", () => {
    const r = runHook("bundle-size-guard.sh", tmpProject(), "pnpm test", "");
    expect(r.stdout).toBe("");
  });
});

describe("mutation-test-reminder.sh", () => {
  it("emits reminder when config reminder=true and tests pass", () => {
    const r = runHook(
      "mutation-test-reminder.sh",
      tmpProject(),
      "pnpm vitest run",
      "Tests  42 passed (42)",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[mutation-test]");
  });

  it("stays silent when no passing-tests line", () => {
    const r = runHook(
      "mutation-test-reminder.sh",
      tmpProject(),
      "pnpm vitest run",
      "Tests  3 failed",
    );
    expect(r.stdout).toBe("");
  });

  it("stays silent when reminder=false", () => {
    const dir = tmpProject();
    writeFileSync(
      join(dir, ".claude", "pipeline.config.json"),
      JSON.stringify({ mutationTesting: { reminder: false } }),
    );
    const r = runHook("mutation-test-reminder.sh", dir, "pnpm vitest run", "Tests  10 passed (10)");
    expect(r.stdout).toBe("");
  });
});

describe("pre-commit-token-guard.sh", () => {
  it("stays silent for non-commit commands", () => {
    const r = runHook("pre-commit-token-guard.sh", tmpProject(), "ls", "");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("stays silent when no lockfile exists", () => {
    const r = runHook("pre-commit-token-guard.sh", tmpProject(), "git commit -m feat", "");
    expect(r.stdout).toBe("");
  });
});

describe("regression-reminder.sh", () => {
  it("stays silent when no baselines exist", () => {
    const r = runHook("regression-reminder.sh", tmpProject(), "pnpm build", "built in 1.0s");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("emits reminder when baselines exist", () => {
    const dir = tmpProject();
    mkdirSync(join(dir, ".claude", "visual-qa", "baselines"), { recursive: true });
    writeFileSync(join(dir, ".claude", "visual-qa", "baselines", "home.png"), "fake");
    const r = runHook("regression-reminder.sh", dir, "pnpm build", "built in 1.0s");
    expect(r.stdout).toContain("[regression-reminder]");
    expect(r.stdout).toContain("1 baselines");
  });

  it("stays silent for non-build commands", () => {
    const r = runHook("regression-reminder.sh", tmpProject(), "ls", "");
    expect(r.stdout).toBe("");
  });
});

describe("hook robustness", () => {
  const hooks = [
    "post-build-qa.sh",
    "pre-commit-token-guard.sh",
    "dark-mode-reminder.sh",
    "coverage-check.sh",
    "lighthouse-ci.sh",
    "bundle-size-guard.sh",
    "mutation-test-reminder.sh",
    "regression-reminder.sh",
  ];

  for (const hook of hooks) {
    it(`${hook} exits 0 with no args`, () => {
      const r = runHook(hook, tmpProject());
      expect(r.exitCode).toBe(0);
    });

    it(`${hook} exits 0 with empty strings`, () => {
      const r = runHook(hook, tmpProject(), "", "");
      expect(r.exitCode).toBe(0);
    });
  }
});
