import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const HOOKS_DIR = join(repoRoot, ".claude", "hooks");

/**
 * Tests for the PostToolUse hooks in .claude/hooks/.
 *
 * Contract: each hook is invoked as `bash <hook>.sh <TOOL_INPUT> <TOOL_OUTPUT>`
 * and ALWAYS exits 0, whether or not it emits a reminder. Stdout carries the
 * reminder text (empty when the hook decides not to fire).
 */

function runHook(name, toolInput, toolOutput = "", cwd = repoRoot) {
  const out = execFileSync("bash", [join(HOOKS_DIR, name), toolInput, toolOutput], {
    cwd,
    encoding: "utf8",
  });
  return out;
}

const HOOKS = [
  "pre-commit-brand-guard.sh",
  "editorial-qa-reminder.sh",
  "approval-gate-guard.sh",
];

describe("hook contract", () => {
  for (const hook of HOOKS) {
    it(`${hook} exits 0 on unrelated input`, () => {
      // execFileSync throws on non-zero exit — reaching expect() proves exit 0.
      const out = runHook(hook, "ls -la", "some output");
      expect(out).toBe("");
    });

    it(`${hook} exits 0 on empty input`, () => {
      const out = runHook(hook, "", "");
      expect(out).toBe("");
    });
  }
});

describe("pre-commit-brand-guard", () => {
  it("stays silent on git commit when no brand lockfile exists", () => {
    // Run from a temp dir with no brand-guidelines.json.
    const tmp = mkdtempSync(join(tmpdir(), "brand-guard-"));
    try {
      const out = runHook("pre-commit-brand-guard.sh", 'git commit -m "x"', "", tmp);
      expect(out).toBe("");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("stays silent on non-commit commands", () => {
    const out = runHook("pre-commit-brand-guard.sh", "git status", "");
    expect(out).toBe("");
  });
});

describe("editorial-qa-reminder", () => {
  it("fires after a clean brand-voice lint run", () => {
    const out = runHook(
      "editorial-qa-reminder.sh",
      "node scripts/brand-voice-lint.js content/",
      "✓ 3 file(s) clean against brand-guidelines.json v1.0.0."
    );
    expect(out).toContain("readability-score.js");
    expect(out).toContain("seo-check.js");
  });

  it("stays silent when the lint run reported violations", () => {
    const out = runHook(
      "editorial-qa-reminder.sh",
      "node scripts/brand-voice-lint.js content/",
      "2 error(s), 1 warning(s) across 1 file(s)."
    );
    expect(out).toBe("");
  });

  it("stays silent for other node scripts", () => {
    const out = runHook("editorial-qa-reminder.sh", "node scripts/seo-check.js content/", "✓ clean");
    expect(out).toBe("");
  });
});

describe("approval-gate-guard", () => {
  it("fires on marketing platform API calls", () => {
    const out = runHook(
      "approval-gate-guard.sh",
      "curl -X POST https://api.mailchimp.com/3.0/campaigns/abc/actions/send"
    );
    expect(out).toContain("Approval-gate reminder");
  });

  it("fires on --publish style flags", () => {
    const out = runHook("approval-gate-guard.sh", "some-cli post create --publish");
    expect(out).toContain("Approval-gate reminder");
  });

  it("never fires on this repo's own tooling", () => {
    const out = runHook(
      "approval-gate-guard.sh",
      "node scripts/validate-content-calendar.js --json"
    );
    expect(out).toBe("");
  });

  it("never fires on git commands", () => {
    const out = runHook("approval-gate-guard.sh", "git push origin main");
    expect(out).toBe("");
  });
});
