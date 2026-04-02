import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  rmSync,
} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "stage-profiler.js");
const PROJECT_ROOT = join(__dirname, "..", "..");
const METRICS_DIR = join(PROJECT_ROOT, ".claude", "pipeline-cache", "metrics");
const CURRENT_RUN = join(METRICS_DIR, "current-run.json");
const HISTORY_FILE = join(METRICS_DIR, "history.json");

// Backup file paths (stored outside metrics dir to avoid interference)
const BACKUP_DIR = join(METRICS_DIR, ".test-backup");
const CURRENT_RUN_BAK = join(BACKUP_DIR, "current-run.json.bak");
const HISTORY_BAK = join(BACKUP_DIR, "history.json.bak");

/**
 * Run the stage-profiler.js script with given arguments.
 * Returns { stdout, stderr, exitCode }.
 *
 * Note: Node's execFileSync only populates err.stdout/err.stderr when the
 * child exits with a non-zero code. For zero-exit runs, stderr from
 * console.warn/console.error is not captured by this helper.
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
 * Run the script and capture stdout+stderr separately, regardless of exit code.
 * Uses spawnSync so both streams are always available (unlike execFileSync
 * which only populates err.stdout/err.stderr on non-zero exits).
 */
function runCaptureBoth(args) {
  const result = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf-8",
    timeout: 15000,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    output: (result.stdout || "") + (result.stderr || ""),
    exitCode: result.status,
  };
}

/**
 * Backup existing metrics files before test suite, restore after.
 */
function backupMetrics() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  if (existsSync(CURRENT_RUN)) {
    copyFileSync(CURRENT_RUN, CURRENT_RUN_BAK);
  }
  if (existsSync(HISTORY_FILE)) {
    copyFileSync(HISTORY_FILE, HISTORY_BAK);
  }
}

function restoreMetrics() {
  // Restore current-run.json
  if (existsSync(CURRENT_RUN_BAK)) {
    copyFileSync(CURRENT_RUN_BAK, CURRENT_RUN);
    unlinkSync(CURRENT_RUN_BAK);
  } else if (existsSync(CURRENT_RUN)) {
    unlinkSync(CURRENT_RUN);
  }

  // Restore history.json
  if (existsSync(HISTORY_BAK)) {
    copyFileSync(HISTORY_BAK, HISTORY_FILE);
    unlinkSync(HISTORY_BAK);
  } else if (existsSync(HISTORY_FILE)) {
    unlinkSync(HISTORY_FILE);
  }

  // Clean up backup dir
  if (existsSync(BACKUP_DIR)) {
    rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
}

/**
 * Reset metrics to a clean state (empty current run, empty history).
 */
function resetMetrics() {
  mkdirSync(METRICS_DIR, { recursive: true });
  if (existsSync(CURRENT_RUN)) unlinkSync(CURRENT_RUN);
  if (existsSync(HISTORY_FILE)) unlinkSync(HISTORY_FILE);
}

/**
 * Seed history.json with N completed runs so analyze/history tests work.
 */
function seedHistory(runCount) {
  const runs = [];
  const baseTime = Date.now() - runCount * 60000;
  for (let i = 0; i < runCount; i++) {
    const start = baseTime + i * 60000;
    const duration = 5000 + Math.floor(Math.random() * 3000);
    runs.push({
      runId: `run-seed-${i}`,
      timestamp: new Date(start).toISOString(),
      totalDuration: duration,
      status: "complete",
      summary: {
        stageCount: 2,
        passed: 2,
        failed: 0,
        totalStageDuration: duration - 200,
        overheadDuration: 200,
        parallelSpeedup: "1.04",
      },
      stages: {
        lint: { duration: Math.floor(duration * 0.4), status: "pass" },
        build: { duration: Math.floor(duration * 0.6), status: "pass" },
      },
    });
  }
  mkdirSync(METRICS_DIR, { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify({ runs }, null, 2));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

beforeAll(() => {
  backupMetrics();
});

afterAll(() => {
  restoreMetrics();
});

// ---------------------------------------------------------------------------
// NOTE ON ARG PARSING:
// The script's parseArgs always assigns args[1] to `target`, so flags like
// --json or --format placed at position 1 are consumed as the target value
// rather than parsed as options. For commands that do not require a target
// (status, history, analyze, report, complete), we pass a dummy target "_"
// before the flags, or we use alternative arg positions:
//   history _ --json         -> target="_", options.json=true
//   analyze _ --json         -> target="_", options.json=true
//   status _ --json          -> target="_", options.json=true
//   report _ --format json   -> target="_", options.format="json"
//   complete complete --json -> target="complete" (used as finalStatus)
//
// For history with --last, we can use: history --last 5 --json
//   -> target="--last", then i=2 "5" is not a flag and target is set (ignored),
//      i=3 "--json" parsed correctly. But --last is lost as target.
// Instead use: history _ --last 5 --json
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. start command
// ---------------------------------------------------------------------------

describe("stage-profiler.js start", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("prints confirmation when starting a new stage", () => {
    const { stdout, exitCode } = run(["start", "lint"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Started stage: lint");
  });

  it("warns when starting an already-running stage", () => {
    run(["start", "lint"]);
    // console.warn goes to stderr; use runCaptureBoth to merge both streams
    const { output } = runCaptureBoth(["start", "lint"]);
    expect(output).toContain("already running");
  });

  it("exits with code 2 when no stage name is provided", () => {
    const { exitCode, stderr } = run(["start"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Usage");
  });

  it("persists stage data in current-run.json", () => {
    run(["start", "typecheck"]);
    expect(existsSync(CURRENT_RUN)).toBe(true);
    const data = JSON.parse(readFileSync(CURRENT_RUN, "utf-8"));
    expect(data.stages).toHaveProperty("typecheck");
    expect(data.stages.typecheck.status).toBe("running");
    expect(data.stages.typecheck.startTime).toBeTypeOf("number");
  });
});

// ---------------------------------------------------------------------------
// 2. end command
// ---------------------------------------------------------------------------

describe("stage-profiler.js end", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("exits with code 2 when no stage name is provided", () => {
    const { exitCode, stderr } = run(["end"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Usage");
  });

  it("prints error when ending a stage that was not started", () => {
    // console.error goes to stderr; merge both streams
    const { output } = runCaptureBoth(["end", "nonexistent"]);
    expect(output).toContain("was not started");
  });

  it("prints duration when ending a started stage", () => {
    run(["start", "build"]);
    const { stdout, exitCode } = run(["end", "build"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Ended stage: build");
    // Should contain a duration like "(0.01s)"
    expect(stdout).toMatch(/\d+\.\d+s/);
  });

  it("records failure status with --status fail", () => {
    run(["start", "tests"]);
    const { stdout } = run(["end", "tests", "--status", "fail"]);
    expect(stdout).toContain("Ended stage: tests");

    const data = JSON.parse(readFileSync(CURRENT_RUN, "utf-8"));
    expect(data.stages.tests.status).toBe("fail");
  });

  it("defaults to pass status when --status is not provided", () => {
    run(["start", "lint"]);
    run(["end", "lint"]);
    const data = JSON.parse(readFileSync(CURRENT_RUN, "utf-8"));
    expect(data.stages.lint.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// 3. start + end roundtrip with --json
// ---------------------------------------------------------------------------

describe("stage-profiler.js start+end roundtrip", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("returns structured JSON with duration, status, startTime, endTime", () => {
    run(["start", "compile"]);
    // --json is at position 2 (after target "compile"), so it is parsed correctly
    const { stdout, exitCode } = run(["end", "compile", "--json"]);
    expect(exitCode).toBe(0);

    // stdout contains the "Ended stage" line followed by the JSON block
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();

    const result = JSON.parse(jsonMatch[0]);
    expect(result).toHaveProperty("duration");
    expect(result).toHaveProperty("status", "pass");
    expect(result).toHaveProperty("startTime");
    expect(result).toHaveProperty("endTime");
    expect(result.duration).toBeTypeOf("number");
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.endTime).toBeGreaterThanOrEqual(result.startTime);
  });

  it("captures memory usage in JSON output", () => {
    run(["start", "memory-test"]);
    const { stdout } = run(["end", "memory-test", "--json"]);
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch[0]);

    expect(result).toHaveProperty("startMemory");
    expect(result).toHaveProperty("endMemory");
    // Memory properties should be present on all platforms
    if (result.startMemory) {
      expect(result.startMemory).toHaveProperty("heapUsed");
      expect(result.startMemory).toHaveProperty("rss");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. complete command
// ---------------------------------------------------------------------------

describe("stage-profiler.js complete", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("archives a run with stage count, pass/fail counts, and total duration", () => {
    run(["start", "lint"]);
    run(["end", "lint"]);
    run(["start", "build"]);
    run(["end", "build", "--status", "fail"]);

    const { stdout, exitCode } = run(["complete"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Run completed and archived");
    expect(stdout).toContain("Stages: 2");
    expect(stdout).toContain("Passed: 1");
    expect(stdout).toContain("Failed: 1");
    expect(stdout).toMatch(/Total duration: \d+\.\d+s/);
  });

  it("returns JSON summary with --json flag", () => {
    run(["start", "test"]);
    run(["end", "test"]);
    // Pass "complete" as the target so finalStatus="complete", then --json at position 2
    const { stdout } = run(["complete", "complete", "--json"]);

    const summary = JSON.parse(stdout);
    expect(summary).toHaveProperty("stageCount", 1);
    expect(summary).toHaveProperty("passed", 1);
    expect(summary).toHaveProperty("failed", 0);
    expect(summary).toHaveProperty("totalStageDuration");
    expect(summary.totalStageDuration).toBeTypeOf("number");
  });

  it("writes to history.json after completing", () => {
    run(["start", "deploy"]);
    run(["end", "deploy"]);
    run(["complete"]);

    expect(existsSync(HISTORY_FILE)).toBe(true);
    const history = JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
    expect(history.runs.length).toBeGreaterThanOrEqual(1);
    const lastRun = history.runs[history.runs.length - 1];
    expect(lastRun).toHaveProperty("runId");
    expect(lastRun).toHaveProperty("totalDuration");
    expect(lastRun).toHaveProperty("summary");
    expect(lastRun.stages).toHaveProperty("deploy");
  });

  it("resets current-run.json after completing", () => {
    run(["start", "bundle"]);
    run(["end", "bundle"]);
    run(["complete"]);

    const current = JSON.parse(readFileSync(CURRENT_RUN, "utf-8"));
    expect(Object.keys(current.stages)).toHaveLength(0);
    expect(current.runId).toMatch(/^run-/);
  });
});

// ---------------------------------------------------------------------------
// 5. report command
// ---------------------------------------------------------------------------

describe("stage-profiler.js report", () => {
  beforeEach(() => {
    resetMetrics();
    // Populate some stage data for the report
    run(["start", "lint"]);
    run(["end", "lint"]);
    run(["start", "build"]);
    run(["end", "build"]);
  });

  it("outputs ASCII report by default", () => {
    const { stdout, exitCode } = run(["report"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Pipeline Performance Report");
    expect(stdout).toContain("Stage Timings");
  });

  it("outputs JSON report with --format json (dummy target)", () => {
    // Need a dummy target so --format lands at position 2+
    const { stdout, exitCode } = run(["report", "_", "--format", "json"]);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("current");
    expect(report).toHaveProperty("history");
    expect(report.current).toHaveProperty("stages");
    expect(report.current.stages).toHaveProperty("lint");
    expect(report.current.stages).toHaveProperty("build");
  });

  it("outputs JSON report with --json (dummy target)", () => {
    const { stdout } = run(["report", "_", "--json"]);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("current");
  });

  it("outputs Markdown report with --format md (dummy target)", () => {
    const { stdout } = run(["report", "_", "--format", "md"]);
    expect(stdout).toContain("# Pipeline Performance Report");
    expect(stdout).toContain("## Stage Timings");
    expect(stdout).toContain("| Stage |");
  });

  it("includes stage timing data in the JSON report", () => {
    const { stdout } = run(["report", "_", "--format", "json"]);
    const report = JSON.parse(stdout);
    const lintStage = report.current.stages.lint;
    expect(lintStage.duration).toBeTypeOf("number");
    expect(lintStage.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// 6. history command
// ---------------------------------------------------------------------------

describe("stage-profiler.js history", () => {
  beforeEach(() => {
    resetMetrics();
    seedHistory(3);
  });

  it("returns JSON array with --json flag (dummy target)", () => {
    const { stdout, exitCode } = run(["history", "_", "--json"]);
    expect(exitCode).toBe(0);
    const runs = JSON.parse(stdout);
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBe(3);
  });

  it("limits results with --last N", () => {
    seedHistory(10);
    const { stdout } = run(["history", "_", "--last", "5", "--json"]);
    const runs = JSON.parse(stdout);
    expect(runs.length).toBe(5);
  });

  it("returns all runs when --last exceeds run count", () => {
    const { stdout } = run(["history", "_", "--last", "100", "--json"]);
    const runs = JSON.parse(stdout);
    expect(runs.length).toBe(3);
  });

  it("shows ASCII table by default", () => {
    const { stdout } = run(["history"]);
    expect(stdout).toContain("Last");
    expect(stdout).toContain("Pipeline Runs");
    expect(stdout).toContain("passed");
  });

  it("each history entry has required fields", () => {
    const { stdout } = run(["history", "_", "--json"]);
    const runs = JSON.parse(stdout);
    for (const entry of runs) {
      expect(entry).toHaveProperty("runId");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("totalDuration");
      expect(entry).toHaveProperty("status");
      expect(entry).toHaveProperty("summary");
      expect(entry).toHaveProperty("stages");
    }
  });
});

// ---------------------------------------------------------------------------
// 7. analyze command
// ---------------------------------------------------------------------------

describe("stage-profiler.js analyze", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("returns error message with fewer than 2 runs (JSON)", () => {
    // No history at all; use dummy target so --json is parsed
    const { stdout } = run(["analyze", "_", "--json"]);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/at least 2 runs/i);
  });

  it("returns error with exactly 1 run (JSON)", () => {
    seedHistory(1);
    const { stdout } = run(["analyze", "_", "--json"]);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty("error");
  });

  it("crashes gracefully with fewer than 2 runs (non-JSON)", () => {
    // Without --json, the ASCII path tries to access analysis.slowStages
    // on the error object, which causes a crash. This is a known script
    // limitation. Verify it produces a non-zero exit.
    const { exitCode } = run(["analyze"]);
    expect(exitCode).not.toBe(0);
  });

  it("returns structured analysis with 2+ runs", () => {
    seedHistory(5);
    const { stdout, exitCode } = run(["analyze", "_", "--json"]);
    expect(exitCode).toBe(0);
    const analysis = JSON.parse(stdout);

    expect(analysis).toHaveProperty("totalRuns");
    expect(analysis.totalRuns).toBe(5);
    expect(analysis).toHaveProperty("stages");
    expect(analysis).toHaveProperty("slowStages");
    expect(analysis).toHaveProperty("unreliableStages");
    expect(analysis).toHaveProperty("recommendations");
    expect(Array.isArray(analysis.slowStages)).toBe(true);
    expect(Array.isArray(analysis.unreliableStages)).toBe(true);
    expect(Array.isArray(analysis.recommendations)).toBe(true);
  });

  it("includes per-stage statistics", () => {
    seedHistory(5);
    const { stdout } = run(["analyze", "_", "--json"]);
    const analysis = JSON.parse(stdout);

    // Seeded runs have "lint" and "build" stages
    expect(analysis.stages).toHaveProperty("lint");
    expect(analysis.stages).toHaveProperty("build");

    const lintStats = analysis.stages.lint;
    expect(lintStats).toHaveProperty("avgDuration");
    expect(lintStats).toHaveProperty("minDuration");
    expect(lintStats).toHaveProperty("maxDuration");
    expect(lintStats).toHaveProperty("stdDev");
    expect(lintStats).toHaveProperty("successRate");
    expect(lintStats).toHaveProperty("sampleCount");
    expect(lintStats.sampleCount).toBe(5);
    expect(lintStats.successRate).toBe(100);
  });

  it("shows ASCII output with sufficient history", () => {
    seedHistory(3);
    const { stdout } = run(["analyze"]);
    expect(stdout).toContain("Performance Analysis");
    expect(stdout).toContain("Stage Statistics");
  });
});

// ---------------------------------------------------------------------------
// 8. status command
// ---------------------------------------------------------------------------

describe("stage-profiler.js status", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("returns JSON with runId and stages via --json (dummy target)", () => {
    run(["start", "compile"]);
    const { stdout, exitCode } = run(["status", "_", "--json"]);
    expect(exitCode).toBe(0);

    const status = JSON.parse(stdout);
    expect(status).toHaveProperty("runId");
    expect(status.runId).toMatch(/^run-/);
    expect(status).toHaveProperty("stages");
    expect(status.stages).toHaveProperty("compile");
    expect(status.stages.compile.status).toBe("running");
  });

  it("shows empty stages when no stages have been started", () => {
    const { stdout } = run(["status", "_", "--json"]);
    const status = JSON.parse(stdout);
    expect(Object.keys(status.stages)).toHaveLength(0);
  });

  it("shows ASCII status by default", () => {
    run(["start", "lint"]);
    const { stdout } = run(["status"]);
    expect(stdout).toContain("Current Run Status");
    expect(stdout).toContain("Run ID:");
    expect(stdout).toContain("lint");
  });

  it("reflects completed stages with duration", () => {
    run(["start", "typecheck"]);
    run(["end", "typecheck"]);
    const { stdout } = run(["status", "_", "--json"]);
    const status = JSON.parse(stdout);
    expect(status.stages.typecheck.status).toBe("pass");
    expect(status.stages.typecheck.duration).toBeTypeOf("number");
  });
});

// ---------------------------------------------------------------------------
// 9. Error cases and help
// ---------------------------------------------------------------------------

describe("stage-profiler.js error cases", () => {
  it("shows help and exits 0 when no command is given", () => {
    const { stdout, exitCode } = run([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Stage Profiler");
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("start");
    expect(stdout).toContain("end");
    expect(stdout).toContain("complete");
    expect(stdout).toContain("report");
    expect(stdout).toContain("history");
    expect(stdout).toContain("analyze");
    expect(stdout).toContain("status");
  });

  it("shows help and exits 2 for an unknown command", () => {
    const { stdout, stderr, exitCode } = run(["foobar"]);
    expect(exitCode).toBe(2);
    const output = stdout + stderr;
    expect(output).toContain("Usage");
  });

  it("start without stage name exits 2", () => {
    const { exitCode } = run(["start"]);
    expect(exitCode).toBe(2);
  });

  it("end without stage name exits 2", () => {
    const { exitCode } = run(["end"]);
    expect(exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 10. Full lifecycle: start -> end -> complete -> history -> analyze
// ---------------------------------------------------------------------------

describe("stage-profiler.js full lifecycle", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("runs a complete pipeline lifecycle", () => {
    // Run 1: two stages, one pass, one fail
    run(["start", "lint"]);
    run(["end", "lint"]);
    run(["start", "build"]);
    run(["end", "build", "--status", "fail"]);
    run(["complete"]);

    // Run 2: two stages, both pass
    run(["start", "lint"]);
    run(["end", "lint"]);
    run(["start", "build"]);
    run(["end", "build"]);
    run(["complete"]);

    // History should have 2 runs (use dummy target for --json)
    const historyResult = run(["history", "_", "--json"]);
    const runs = JSON.parse(historyResult.stdout);
    expect(runs.length).toBe(2);

    // First run should have 1 failure
    expect(runs[0].summary.failed).toBe(1);
    expect(runs[0].summary.passed).toBe(1);

    // Second run should have 0 failures
    expect(runs[1].summary.failed).toBe(0);
    expect(runs[1].summary.passed).toBe(2);

    // Analyze should work with 2 runs
    const analyzeResult = run(["analyze", "_", "--json"]);
    const analysis = JSON.parse(analyzeResult.stdout);
    expect(analysis).toHaveProperty("totalRuns", 2);
    expect(analysis.stages).toHaveProperty("lint");
    expect(analysis.stages).toHaveProperty("build");
  });

  it("report captures stages from active run before complete", () => {
    run(["start", "test"]);
    run(["end", "test"]);
    run(["start", "deploy"]);
    run(["end", "deploy"]);

    // Report on active (not yet completed) run, use dummy target
    const { stdout } = run(["report", "_", "--format", "json"]);
    const report = JSON.parse(stdout);
    expect(report.current.stages).toHaveProperty("test");
    expect(report.current.stages).toHaveProperty("deploy");
    expect(report.current.stages.test.duration).toBeTypeOf("number");
    expect(report.current.stages.deploy.duration).toBeTypeOf("number");
  });
});
