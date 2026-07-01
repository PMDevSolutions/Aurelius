import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(__dirname, "..", "export-design-system.js");
const IMPORT = join(__dirname, "..", "import-design-tokens.js");

let counter = 0;

/** Unique temp dir under scripts/__tests__/fixtures/ds-roundtrip-* */
function createTmpDir() {
  counter++;
  const dir = join(__dirname, "fixtures", `ds-roundtrip-${counter}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Run a node script; return { stdout, stderr, exitCode } (never throws). */
function runNode(script, args = [], cwd = process.cwd()) {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      encoding: "utf-8",
      timeout: 30000,
      cwd,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || "", stderr: err.stderr || "", exitCode: err.status ?? 1 };
  }
}

/**
 * A rich, representative design-tokens.lock.json exercising every top-level
 * section: metadata, nested colors, typography, spacing, radii, and text.
 */
function makeLockfile() {
  return {
    version: "1.0.0",
    figmaFileKey: "ABC123",
    figmaLastModified: "2026-03-15T10:30:00Z",
    colors: {
      primitives: {
        "blue-50": { hex: "#eff6ff", rgb: "239, 246, 255", tailwind: "blue-50" },
        "blue-500": { hex: "#3b82f6", rgb: "59, 130, 246", tailwind: "blue-500" },
      },
      semantic: {
        primary: { hex: "#3b82f6", ref: "blue-500" },
      },
    },
    typography: {
      families: {
        sans: { value: "Inter", fallback: "system-ui, -apple-system, sans-serif" },
      },
      sizes: { base: { px: 16, rem: 1 } },
    },
    spacing: { scale: { 0.5: { px: 2 }, 1: { px: 4 } } },
    borderRadius: { sm: { px: 4 }, md: { px: 6 } },
    textContent: {
      "hero-heading": "Build faster with AI",
      "hero-subheading": "Ship production apps in days, not months",
    },
  };
}

/** Write a lockfile object to <dir>/<name> and return its path. */
function writeLock(dir, obj, name = "design-tokens.lock.json") {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  return p;
}

/** Export a design system from a lockfile; return the export root dir. */
function exportFrom(lockPath, cwd) {
  const outDir = join(cwd, "export");
  const res = runNode(
    EXPORT,
    ["--lockfile", lockPath, "--framework", "react", "--output", outDir, "--force"],
    cwd,
  );
  expect(res.exitCode, res.stderr).toBe(0);
  return outDir;
}

afterAll(() => {
  const fixturesDir = join(__dirname, "fixtures");
  if (!existsSync(fixturesDir)) return;
  for (const entry of readdirSync(fixturesDir)) {
    if (entry.startsWith("ds-roundtrip-")) {
      try {
        rmSync(join(fixturesDir, entry), { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
});

describe("export writes a lossless tokens.json snapshot", () => {
  it("tokens.json deep-equals the source lockfile", () => {
    const dir = createTmpDir();
    const lock = makeLockfile();
    const lockPath = writeLock(dir, lock);
    const exportRoot = exportFrom(lockPath, dir);

    const tokensJson = join(exportRoot, "packages", "design-tokens", "src", "tokens.json");
    expect(existsSync(tokensJson)).toBe(true);
    expect(JSON.parse(readFileSync(tokensJson, "utf-8"))).toEqual(lock);
  });
});

describe("round-trip: tokens → export → reimport → identical lockfile", () => {
  it("reconstructs a byte-for-byte identical token lockfile from the export root", () => {
    const dir = createTmpDir();
    const lock = makeLockfile();
    const lockPath = writeLock(dir, lock);
    const exportRoot = exportFrom(lockPath, dir);

    const outPath = join(dir, "reimported.lock.json");
    const res = runNode(IMPORT, ["--from", exportRoot, "--out", outPath, "--force"], dir);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(existsSync(outPath)).toBe(true);

    const reimported = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(reimported).toEqual(lock);
  });

  it("imports directly from a tokens.json file path", () => {
    const dir = createTmpDir();
    const lock = makeLockfile();
    const lockPath = writeLock(dir, lock);
    const exportRoot = exportFrom(lockPath, dir);

    const tokensJson = join(exportRoot, "packages", "design-tokens", "src", "tokens.json");
    const res = runNode(IMPORT, ["--from", tokensJson, "--out", "-"], dir);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual(lock);
  });
});

describe("--verify checks round-trip fidelity", () => {
  it("exits 0 when the reconstructed lockfile matches the reference", () => {
    const dir = createTmpDir();
    const lock = makeLockfile();
    const lockPath = writeLock(dir, lock);
    const exportRoot = exportFrom(lockPath, dir);

    const res = runNode(IMPORT, ["--from", exportRoot, "--verify", lockPath], dir);
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it("exits non-zero when the reference lockfile differs", () => {
    const dir = createTmpDir();
    const lock = makeLockfile();
    const lockPath = writeLock(dir, lock);
    const exportRoot = exportFrom(lockPath, dir);

    const mutated = makeLockfile();
    mutated.colors.semantic.primary.hex = "#000000";
    const mutatedPath = writeLock(dir, mutated, "mutated.lock.json");

    const res = runNode(IMPORT, ["--from", exportRoot, "--verify", mutatedPath], dir);
    expect(res.exitCode).not.toBe(0);
  });
});

describe("input validation", () => {
  it("rejects input that is not a token lockfile", () => {
    const dir = createTmpDir();
    const bogus = join(dir, "bogus.json");
    writeFileSync(bogus, JSON.stringify({ hello: "world" }));
    const res = runNode(IMPORT, ["--from", bogus, "--out", "-"], dir);
    expect(res.exitCode).toBe(3);
  });

  it("exits 2 when no tokens.json can be found under --from", () => {
    const dir = createTmpDir();
    const res = runNode(IMPORT, ["--from", dir, "--out", "-"], dir);
    expect(res.exitCode).toBe(2);
  });
});

describe("--json summary", () => {
  it("emits a machine-readable summary with identical flag on verify", () => {
    const dir = createTmpDir();
    const lock = makeLockfile();
    const lockPath = writeLock(dir, lock);
    const exportRoot = exportFrom(lockPath, dir);

    const res = runNode(IMPORT, ["--from", exportRoot, "--verify", lockPath, "--json"], dir);
    expect(res.exitCode, res.stderr).toBe(0);
    const summary = JSON.parse(res.stdout);
    expect(summary.identical).toBe(true);
    expect(summary.tokensJson).toContain("tokens.json");
  });
});
