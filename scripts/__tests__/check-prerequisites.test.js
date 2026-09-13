import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, symlinkSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "check-prerequisites.sh");

/**
 * scripts/check-prerequisites.sh prints the same sectioned [STATUS] report the
 * Flavian/Vespasian desktop GUIs parse (packages/gui/src/core/prerequisites), so
 * these tests pin the output contract rather than the machine's tool inventory.
 */
function run(env = {}) {
  const r = spawnSync("/bin/bash", [SCRIPT], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

describe("check-prerequisites.sh", () => {
  it("prints the sectioned [STATUS] report the GUI parser expects", () => {
    const { code, out } = run();
    expect([0, 1]).toContain(code);
    for (const header of [
      "REQUIRED SOFTWARE",
      "REQUIRED ACCOUNTS",
      "OPTIONAL SOFTWARE",
      "SYSTEM REQUIREMENTS",
    ]) {
      expect(out).toMatch(new RegExp(`^${header}\\n-+$`, "m"));
    }
    expect(out).toMatch(/^\[PASS\] Git \d+\.\d+/m);
    expect(out).toMatch(/^\[(PASS|FAIL)\] Node\.js /m);
    expect(out).toMatch(/^\[(PASS|FAIL)\] pnpm /m);
    expect(out).toMatch(/^\[(PASS|FAIL)\] Claude Code/m);
    expect(out).toMatch(/^\[INFO\] Figma Dev Mode/m);
    expect(out).toMatch(/^\[(PASS|SKIP|WARN)\] Playwright/m);
    expect(out).toMatch(/^=== Summary ===$/m);
    expect(out).toMatch(/^Required: \d+\/\d+ passed$/m);
    expect(out).toMatch(/^Optional: \d+\/\d+ installed$/m);
    expect(out).toMatch(/^System:\s+\d+\/\d+ passed$/m);
    expect(out).toMatch(/^Ready to use Aurelius: (YES|NO)$/m);
  });

  it("exit code agrees with the readiness line", () => {
    const { code, out } = run();
    const ready = /Ready to use Aurelius: YES/.test(out);
    expect(code).toBe(ready ? 0 : 1);
  });

  it("reports a missing required tool as [FAIL] with an install hint and exits 1", () => {
    // Hide git/node/pnpm/claude by giving the script a PATH that holds only the
    // coreutils it needs for its own output (sed, grep, sort, …).
    const bin = mkdtempSync(join(tmpdir(), "prereq-bin-"));
    for (const tool of ["sed", "grep", "sort", "head", "awk", "df", "cut", "tr", "ls"]) {
      const found = (process.env.PATH || "")
        .split(":")
        .map((d) => join(d, tool))
        .find((p) => existsSync(p));
      if (found) symlinkSync(found, join(bin, tool));
    }
    let result;
    try {
      result = run({ PATH: bin });
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
    const { code, out } = result;
    expect(code).toBe(1);
    expect(out).toMatch(/^\[FAIL\] Git not installed$/m);
    expect(out).toMatch(/^ {7}Install: https:\/\/git-scm\.com/m);
    expect(out).toMatch(/^\[FAIL\] Node\.js not installed$/m);
    expect(out).toMatch(/Ready to use Aurelius: NO/);
  });

  it("does not emit ANSI escapes when NO_COLOR is set", () => {
    const { out } = run();
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b\[/);
  });
});
