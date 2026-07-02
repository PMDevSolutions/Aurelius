// Tests for scripts/setup-baseline-lfs.sh — Git LFS opt-in for large baseline
// sets (RFC 0002 §6.1). All mutating runs happen inside scratch git repos.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "setup-baseline-lfs.sh");

const ATTR_LINE = ".claude/visual-qa/baselines/**/*.png filter=lfs diff=lfs merge=lfs -text";

let tmp;
let repoCount = 0;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "baseline-lfs-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const gitLfsAvailable = (() => {
  try {
    execFileSync("git", ["lfs", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Scratch git repo, optionally with a visualBaselines config. */
function makeRepo({ storage } = {}) {
  const root = join(tmp, `repo-${repoCount++}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  if (storage) {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "pipeline.config.json"),
      JSON.stringify({ visualBaselines: { storage } }, null, 2),
    );
  }
  return root;
}

function run(args, cwd) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status };
  }
}

describe("setup-baseline-lfs.sh", () => {
  it("shows usage and exits 0 on --help", () => {
    const { stdout, exitCode } = run(["--help"], tmp);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--dry-run");
  });

  it("exits 2 outside a git repository", () => {
    const bare = join(tmp, "not-a-repo");
    mkdirSync(bare, { recursive: true });
    const { exitCode, stderr } = run([], bare);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/git repo/i);
  });

  it("refuses when visualBaselines.storage is not lfs", () => {
    const repo = makeRepo({ storage: "git" });
    const { exitCode, stdout } = run([], repo);
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/storage/);
    expect(stdout).toMatch(/--force/);
    expect(existsSync(join(repo, ".gitattributes"))).toBe(false);
  });

  it("--dry-run prints the planned filter line without writing", () => {
    const repo = makeRepo({ storage: "lfs" });
    const { exitCode, stdout } = run(["--dry-run"], repo);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(ATTR_LINE);
    expect(existsSync(join(repo, ".gitattributes"))).toBe(false);
  });

  it.skipIf(!gitLfsAvailable)("applies the filter idempotently and installs LFS locally", () => {
    const repo = makeRepo({ storage: "lfs" });

    const first = run([], repo);
    expect(first.exitCode).toBe(0);
    const attrs = readFileSync(join(repo, ".gitattributes"), "utf-8");
    expect(attrs).toContain(ATTR_LINE);

    // git lfs install --local writes the filter into the repo config
    const filterClean = execFileSync("git", ["config", "--local", "--get", "filter.lfs.clean"], {
      cwd: repo,
      encoding: "utf-8",
    }).trim();
    expect(filterClean).toContain("git-lfs");

    // Migration guidance is printed but never executed
    expect(first.stdout).toContain("git lfs migrate import");

    // Second run must not duplicate the attributes line
    const second = run([], repo);
    expect(second.exitCode).toBe(0);
    const lines = readFileSync(join(repo, ".gitattributes"), "utf-8")
      .split("\n")
      .filter((l) => l.includes("filter=lfs"));
    expect(lines).toHaveLength(1);
  });

  it.skipIf(!gitLfsAvailable)("--force applies even when storage is git", () => {
    const repo = makeRepo({ storage: "git" });
    const { exitCode } = run(["--force"], repo);
    expect(exitCode).toBe(0);
    expect(readFileSync(join(repo, ".gitattributes"), "utf-8")).toContain("filter=lfs");
  });
});
