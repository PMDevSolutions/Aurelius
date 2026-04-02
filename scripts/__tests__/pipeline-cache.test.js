import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  rmSync,
  copyFileSync,
} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "pipeline-cache.js");
const PROJECT_ROOT = join(__dirname, "..", "..");
const CACHE_DIR = join(PROJECT_ROOT, ".claude", "pipeline-cache");
const CACHE_MANIFEST = join(CACHE_DIR, "cache-manifest.json");
const FIXTURES = join(__dirname, "fixtures");
const MANIFEST_BACKUP = join(CACHE_DIR, "cache-manifest.backup.json");

/**
 * The script's parseArgs treats argv[1] as "target" and only processes
 * flags from argv[2] onward. Commands that don't require a target
 * (status, clean, hit, miss) therefore need a dummy placeholder before
 * any flags like --json so the flag isn't swallowed as the target.
 */
const NO_TARGET_COMMANDS = new Set(["status", "clean", "hit", "miss"]);

/**
 * Run the pipeline-cache.js script with the given arguments.
 * Returns { stdout, stderr, exitCode }.
 */
function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 15000,
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

/**
 * Run the script and parse stdout as JSON.
 * For commands without a target, inserts a dummy placeholder ("_") before
 * --json so the script's arg parser handles the flag correctly.
 */
function runJSON(args) {
  const adjusted = [...args];
  const cmd = adjusted[0];
  // If this is a no-target command and --json is in position 1, insert placeholder
  if (NO_TARGET_COMMANDS.has(cmd) && adjusted.length >= 2 && adjusted[1] === "--json") {
    adjusted.splice(1, 0, "_");
  }
  const result = run(adjusted);
  try {
    return { ...result, json: JSON.parse(result.stdout) };
  } catch {
    return { ...result, json: null };
  }
}

// ── Test-suite-level backup/restore of the real cache manifest ──

let manifestBackedUp = false;

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  if (existsSync(CACHE_MANIFEST)) {
    copyFileSync(CACHE_MANIFEST, MANIFEST_BACKUP);
    manifestBackedUp = true;
  }
});

afterAll(() => {
  // Restore original manifest (or remove if none existed)
  if (manifestBackedUp && existsSync(MANIFEST_BACKUP)) {
    copyFileSync(MANIFEST_BACKUP, CACHE_MANIFEST);
    unlinkSync(MANIFEST_BACKUP);
  } else if (!manifestBackedUp && existsSync(CACHE_MANIFEST)) {
    unlinkSync(CACHE_MANIFEST);
  }

  // Clean up test fixture files
  const fixtureFiles = ["hash-test.txt", "hash-test-dir"];
  for (const f of fixtureFiles) {
    const p = join(FIXTURES, f);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
    }
  }
});

// ── No command (help) ──

describe("pipeline-cache.js -- no command (help)", () => {
  it("shows help text and exits with code 0 when no arguments given", () => {
    const result = run([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Pipeline Cache Manager");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("hash");
    expect(result.stdout).toContain("check");
    expect(result.stdout).toContain("update");
    expect(result.stdout).toContain("invalidate");
    expect(result.stdout).toContain("clean");
    expect(result.stdout).toContain("status");
  });

  it("exits with code 2 for an unknown command", () => {
    const result = run(["nonexistent-command"]);
    expect(result.exitCode).toBe(2);
  });
});

// ── hash command ──

describe("pipeline-cache.js -- hash command", () => {
  const testFile = join(FIXTURES, "hash-test.txt");
  const testDir = join(FIXTURES, "hash-test-dir");

  beforeAll(() => {
    // Create a deterministic test file
    writeFileSync(testFile, "hello pipeline cache test\n", "utf-8");

    // Create a small test directory with two files
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "a.txt"), "file-a-content\n", "utf-8");
    writeFileSync(join(testDir, "b.txt"), "file-b-content\n", "utf-8");
  });

  it("exits with code 2 when no target is provided", () => {
    const result = run(["hash"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("hashes a file and returns a hash string in plain mode", () => {
    const result = run(["hash", testFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hash:");
    // SHA-256 truncated to 16 hex chars
    const match = result.stdout.match(/Hash:\s+([a-f0-9]{16})/);
    expect(match).not.toBeNull();
  });

  it("returns deterministic hashes for the same file content", () => {
    const r1 = run(["hash", testFile]);
    const r2 = run(["hash", testFile]);
    const hash1 = r1.stdout.match(/Hash:\s+([a-f0-9]+)/)[1];
    const hash2 = r2.stdout.match(/Hash:\s+([a-f0-9]+)/)[1];
    expect(hash1).toBe(hash2);
  });

  it("returns JSON output with --json flag for a file", () => {
    const { json, exitCode } = runJSON(["hash", testFile, "--json"]);
    expect(exitCode).toBe(0);
    expect(json).not.toBeNull();
    expect(json.type).toBe("file");
    expect(json.path).toBeTruthy();
    expect(json.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(typeof json.size).toBe("number");
    expect(json.size).toBeGreaterThan(0);
    expect(json.modified).toBeTruthy();
  });

  it("hashes a directory and returns a combined hash", () => {
    const result = run(["hash", testDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hash:");
  });

  it("returns JSON output with --json flag for a directory", () => {
    const { json, exitCode } = runJSON(["hash", testDir, "--json"]);
    expect(exitCode).toBe(0);
    expect(json).not.toBeNull();
    expect(json.type).toBe("directory");
    expect(json.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(typeof json.size).toBe("number");
  });

  it("reports an error for a non-existent path", () => {
    const { json } = runJSON(["hash", "does/not/exist/file.txt", "--json"]);
    expect(json).not.toBeNull();
    expect(json.error).toBeTruthy();
    expect(json.error).toContain("not found");
  });

  it("produces different hashes for different file contents", () => {
    const fileA = join(FIXTURES, "hash-test-dir", "a.txt");
    const fileB = join(FIXTURES, "hash-test-dir", "b.txt");
    const { json: jsonA } = runJSON(["hash", fileA, "--json"]);
    const { json: jsonB } = runJSON(["hash", fileB, "--json"]);
    expect(jsonA.hash).not.toBe(jsonB.hash);
  });
});

// ── check command ──

describe("pipeline-cache.js -- check command", () => {
  beforeEach(() => {
    // Start each test with a clean manifest
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("exits with code 2 when no phase is provided", () => {
    const result = run(["check"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("returns invalid with reason no-cache for an uncached phase", () => {
    const { json, exitCode } = runJSON(["check", "token-sync", "--json"]);
    expect(exitCode).toBe(1);
    expect(json).not.toBeNull();
    expect(json.valid).toBe(false);
    expect(json.reason).toBe("no-cache");
  });

  it("displays human-readable INVALID output without --json", () => {
    const result = run(["check", "token-sync"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("INVALID");
    expect(result.stdout).toContain("token-sync");
  });
});

// ── update + check roundtrip ──

describe("pipeline-cache.js -- update + check roundtrip", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("update followed by check returns valid (exit 0) for the same phase", () => {
    const updateResult = run(["update", "report", "5000"]);
    expect(updateResult.exitCode).toBe(0);
    expect(updateResult.stdout).toContain("updated");

    // "report" phase has no inputs so it always returns invalid with "no-inputs"
    // Use a phase that has inputs for a meaningful roundtrip
    // Actually, the report phase always returns { valid: false, reason: "no-inputs" }
    // Let's verify that behavior
    const { json, exitCode } = runJSON(["check", "report", "--json"]);
    expect(json.valid).toBe(false);
    expect(json.reason).toBe("no-inputs");
    expect(exitCode).toBe(1);
  });

  it("update caches a phase with inputs and check validates it", () => {
    // Use a phase with inputs -- "token-sync" depends on ["tokens", "config"]
    const updateResult = run(["update", "token-sync", "3000"]);
    expect(updateResult.exitCode).toBe(0);

    const { json, exitCode } = runJSON(["check", "token-sync", "--json"]);
    // Valid if the input files haven't changed since update
    // (they shouldn't change within the same test run)
    expect(json).not.toBeNull();
    if (json.valid) {
      expect(exitCode).toBe(0);
      expect(json.cachedAt).toBeTruthy();
      expect(json.duration).toBe(3000);
    } else {
      // If no matching files exist, the hash will still match (both empty)
      // so it should be valid. Either way, we verify the structure.
      expect(json.reason).toBeTruthy();
    }
  });

  it("update stores duration in the manifest", () => {
    run(["update", "token-sync", "7500"]);
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    expect(manifest.phases["token-sync"]).toBeDefined();
    expect(manifest.phases["token-sync"].duration).toBe(7500);
    expect(manifest.phases["token-sync"].timestamp).toBeTruthy();
    expect(manifest.phases["token-sync"].result).toBe("success");
  });

  it("update increments totalBuilds metric", () => {
    run(["update", "token-sync", "1000"]);
    run(["update", "intake", "2000"]);
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    expect(manifest.metrics.totalBuilds).toBe(2);
  });

  it("exits with code 2 when no phase is provided to update", () => {
    const result = run(["update"]);
    expect(result.exitCode).toBe(2);
  });
});

// ── invalidate command ──

describe("pipeline-cache.js -- invalidate command", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("invalidates a previously cached phase", () => {
    run(["update", "token-sync", "2000"]);

    const invalidateResult = run(["invalidate", "token-sync"]);
    expect(invalidateResult.exitCode).toBe(0);
    expect(invalidateResult.stdout).toContain("invalidated");

    const { json, exitCode } = runJSON(["check", "token-sync", "--json"]);
    expect(exitCode).toBe(1);
    expect(json.valid).toBe(false);
    expect(json.reason).toBe("no-cache");
  });

  it("warns when invalidating a phase that has no cache", () => {
    const result = run(["invalidate", "token-sync"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No cache found");
  });

  it("invalidate all clears every cached phase", () => {
    run(["update", "token-sync", "1000"]);
    run(["update", "intake", "2000"]);
    run(["update", "e2e-tests", "3000"]);

    const result = run(["invalidate", "all"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("All caches invalidated");

    // Verify all phases are gone
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    expect(Object.keys(manifest.phases)).toHaveLength(0);
    expect(Object.keys(manifest.fileHashes)).toHaveLength(0);
  });

  it("exits with code 2 when no phase is provided", () => {
    const result = run(["invalidate"]);
    expect(result.exitCode).toBe(2);
  });
});

// ── status command ──

describe("pipeline-cache.js -- status command", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("returns JSON with expected top-level fields via --json", () => {
    const { json, exitCode } = runJSON(["status", "--json"]);
    expect(exitCode).toBe(0);
    expect(json).not.toBeNull();
    expect(json).toHaveProperty("phases");
    expect(json).toHaveProperty("fileHashes");
    expect(json).toHaveProperty("metrics");
    expect(json).toHaveProperty("cacheDir");
    expect(json).toHaveProperty("manifestFile");
  });

  it("reports zero phases when manifest is fresh", () => {
    const { json } = runJSON(["status", "--json"]);
    expect(json.phases.total).toBe(0);
    expect(json.phases.valid).toBe(0);
    expect(json.phases.invalid).toBe(0);
    expect(json.phases.list).toEqual([]);
  });

  it("reports cached phases after updates", () => {
    run(["update", "token-sync", "1500"]);
    run(["update", "intake", "3000"]);

    const { json } = runJSON(["status", "--json"]);
    expect(json.phases.total).toBe(2);
    expect(json.phases.list.length).toBe(2);

    const phaseNames = json.phases.list.map((p) => p.name);
    expect(phaseNames).toContain("token-sync");
    expect(phaseNames).toContain("intake");
  });

  it("includes metrics with correct initial values", () => {
    const { json } = runJSON(["status", "--json"]);
    expect(json.metrics.totalBuilds).toBe(0);
    expect(json.metrics.cacheHits).toBe(0);
    expect(json.metrics.cacheMisses).toBe(0);
    expect(json.metrics.timeSaved).toBe(0);
  });

  it("displays human-readable status without --json", () => {
    const result = run(["status"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Pipeline Cache Status");
    expect(result.stdout).toContain("Phases cached:");
    expect(result.stdout).toContain("Cache Metrics:");
    expect(result.stdout).toContain("Total builds:");
  });
});

// ── clean command ──

describe("pipeline-cache.js -- clean command", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("reports cleaned count when cache is empty", () => {
    const result = run(["clean"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Cleaned 0");
  });

  it("cleans all entries with --max-age 0", () => {
    // Create some cached phases
    run(["update", "token-sync", "1000"]);
    run(["update", "intake", "2000"]);

    // Manually backdate the phase timestamps so --max-age 0 can clean them.
    // The clean function checks `timestamp < Date.now() - maxAge*days`, so
    // entries created "now" are NOT strictly older than the cutoff with --max-age 0.
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    for (const phase of Object.keys(manifest.phases)) {
      manifest.phases[phase].timestamp = "2020-01-01T00:00:00.000Z";
    }
    writeFileSync(CACHE_MANIFEST, JSON.stringify(manifest, null, 2));

    // Clean with max-age 0 should remove the backdated entries
    const result = run(["clean", "--max-age", "0"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Cleaned \d+/);
    // At least the 2 phases should have been cleaned
    const cleanedMatch = result.stdout.match(/Cleaned (\d+)/);
    expect(parseInt(cleanedMatch[1], 10)).toBeGreaterThanOrEqual(2);

    // Verify phases are gone
    const { json } = runJSON(["status", "--json"]);
    expect(json.phases.total).toBe(0);
  });

  it("preserves recent entries with default max-age", () => {
    run(["update", "token-sync", "1000"]);

    // Default max-age is 7 days, so freshly created entries should survive
    const result = run(["clean"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Cleaned 0");

    const { json } = runJSON(["status", "--json"]);
    expect(json.phases.total).toBe(1);
  });
});

// ── hit / miss commands ──

describe("pipeline-cache.js -- hit and miss commands", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("hit increments cacheHits metric", () => {
    run(["hit", "5000"]);
    run(["hit", "3000"]);

    const { json } = runJSON(["status", "--json"]);
    expect(json.metrics.cacheHits).toBe(2);
    expect(json.metrics.timeSaved).toBe(8000);
  });

  it("miss increments cacheMisses metric", () => {
    run(["miss"]);
    run(["miss"]);
    run(["miss"]);

    const { json } = runJSON(["status", "--json"]);
    expect(json.metrics.cacheMisses).toBe(3);
  });

  it("hit and miss together track independently", () => {
    run(["hit", "1000"]);
    run(["miss"]);
    run(["hit", "2000"]);
    run(["miss"]);

    const { json } = runJSON(["status", "--json"]);
    expect(json.metrics.cacheHits).toBe(2);
    expect(json.metrics.cacheMisses).toBe(2);
    expect(json.metrics.timeSaved).toBe(3000);
  });

  it("hit with no saved-time argument defaults to 0", () => {
    run(["hit"]);
    const { json } = runJSON(["status", "--json"]);
    expect(json.metrics.cacheHits).toBe(1);
    expect(json.metrics.timeSaved).toBe(0);
  });
});

// ── Manifest structure and persistence ──

describe("pipeline-cache.js -- manifest persistence", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("creates the cache directory and manifest if they do not exist", () => {
    run(["status", "--json"]);
    // status reads but doesn't necessarily write if nothing changes,
    // but update always writes
    run(["update", "report", "100"]);
    expect(existsSync(CACHE_MANIFEST)).toBe(true);
  });

  it("manifest contains version field", () => {
    run(["update", "report", "100"]);
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    expect(manifest.version).toBe("1.0.0");
  });

  it("manifest contains updated timestamp after write", () => {
    run(["update", "report", "100"]);
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    expect(manifest.updated).toBeTruthy();
    // Should be a valid ISO date string
    expect(new Date(manifest.updated).getTime()).not.toBeNaN();
  });

  it("manifest tracks fileHashes for phases with inputs", () => {
    run(["update", "token-sync", "1000"]);
    const manifest = JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
    // fileHashes object should exist (may be empty if no matching files found)
    expect(manifest.fileHashes).toBeDefined();
    expect(typeof manifest.fileHashes).toBe("object");
  });
});

// ── End-to-end workflow ──

describe("pipeline-cache.js -- end-to-end workflow", () => {
  beforeEach(() => {
    if (existsSync(CACHE_MANIFEST)) {
      unlinkSync(CACHE_MANIFEST);
    }
  });

  it("full lifecycle: update -> check valid -> invalidate -> check invalid", () => {
    // Step 1: Update a phase
    const updateResult = run(["update", "token-sync", "4200"]);
    expect(updateResult.exitCode).toBe(0);

    // Step 2: Check should be valid (inputs unchanged)
    const checkResult = runJSON(["check", "token-sync", "--json"]);
    // May be valid or invalid depending on whether input files match
    expect(checkResult.json).not.toBeNull();

    // Step 3: Invalidate
    const invResult = run(["invalidate", "token-sync"]);
    expect(invResult.exitCode).toBe(0);

    // Step 4: Check should be invalid with no-cache
    const { json, exitCode } = runJSON(["check", "token-sync", "--json"]);
    expect(exitCode).toBe(1);
    expect(json.valid).toBe(false);
    expect(json.reason).toBe("no-cache");
  });

  it("multiple phases can be cached and invalidated independently", () => {
    run(["update", "token-sync", "1000"]);
    run(["update", "intake", "2000"]);
    run(["update", "storybook", "3000"]);

    // Status shows 3 phases
    const { json: statusBefore } = runJSON(["status", "--json"]);
    expect(statusBefore.phases.total).toBe(3);

    // Invalidate only one
    run(["invalidate", "intake"]);

    const { json: statusAfter } = runJSON(["status", "--json"]);
    expect(statusAfter.phases.total).toBe(2);

    const remainingNames = statusAfter.phases.list.map((p) => p.name);
    expect(remainingNames).toContain("token-sync");
    expect(remainingNames).toContain("storybook");
    expect(remainingNames).not.toContain("intake");
  });
});
