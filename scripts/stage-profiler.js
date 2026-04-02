#!/usr/bin/env node
/**
 * stage-profiler.js — Pipeline stage timing and performance profiling
 *
 * Usage:
 *   node scripts/stage-profiler.js start <stage-name>
 *   node scripts/stage-profiler.js end <stage-name> [--status pass|fail]
 *   node scripts/stage-profiler.js report [--format md|json|ascii]
 *   node scripts/stage-profiler.js history [--last N]
 *   node scripts/stage-profiler.js analyze [--slow-threshold 30000]
 *
 * Features:
 *   - Precise stage timing with sub-second accuracy
 *   - Memory and CPU profiling (when available)
 *   - Historical trend analysis
 *   - Slow stage detection
 *   - Build performance reports
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// Paths
const METRICS_DIR = join(PROJECT_ROOT, ".claude", "pipeline-cache", "metrics");
const CURRENT_RUN = join(METRICS_DIR, "current-run.json");
const HISTORY_FILE = join(METRICS_DIR, "history.json");
const REPORT_DIR = join(PROJECT_ROOT, ".claude", "visual-qa");

// Ensure directories exist
function ensureDirs() {
  if (!existsSync(METRICS_DIR)) {
    mkdirSync(METRICS_DIR, { recursive: true });
  }
}

// Load current run data
function loadCurrentRun() {
  ensureDirs();
  if (!existsSync(CURRENT_RUN)) {
    return {
      runId: generateRunId(),
      startTime: Date.now(),
      stages: {},
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };
  }
  return JSON.parse(readFileSync(CURRENT_RUN, "utf-8"));
}

// Save current run data
function saveCurrentRun(data) {
  ensureDirs();
  writeFileSync(CURRENT_RUN, JSON.stringify(data, null, 2));
}

// Load history
function loadHistory() {
  ensureDirs();
  if (!existsSync(HISTORY_FILE)) {
    return { runs: [] };
  }
  return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
}

// Save history
function saveHistory(data) {
  ensureDirs();
  writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

// Generate run ID
function generateRunId() {
  const now = new Date();
  return `run-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
}

// Get memory usage
function getMemoryUsage() {
  try {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
    };
  } catch {
    return null;
  }
}

// Get system memory (cross-platform)
function getSystemMemory() {
  try {
    if (process.platform === "win32") {
      const output = execSync("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value", {
        encoding: "utf-8",
        timeout: 5000,
      });
      const free = parseInt(output.match(/FreePhysicalMemory=(\d+)/)?.[1] || "0", 10) * 1024;
      const total = parseInt(output.match(/TotalVisibleMemorySize=(\d+)/)?.[1] || "0", 10) * 1024;
      return { free, total, used: total - free };
    } else {
      const output = execSync("free -b", { encoding: "utf-8", timeout: 5000 });
      const lines = output.split("\n");
      const memLine = lines.find((l) => l.startsWith("Mem:"));
      if (memLine) {
        const parts = memLine.split(/\s+/);
        return {
          total: parseInt(parts[1], 10),
          used: parseInt(parts[2], 10),
          free: parseInt(parts[3], 10),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

// Start timing a stage
function startStage(stageName) {
  const run = loadCurrentRun();

  if (run.stages[stageName]?.startTime && !run.stages[stageName]?.endTime) {
    console.warn(`⚠ Stage '${stageName}' already running`);
    return;
  }

  run.stages[stageName] = {
    startTime: Date.now(),
    startMemory: getMemoryUsage(),
    startSystemMemory: getSystemMemory(),
    status: "running",
  };

  saveCurrentRun(run);

  console.log(`▶ Started stage: ${stageName}`);
  return run.stages[stageName];
}

// End timing a stage
function endStage(stageName, status = "pass") {
  const run = loadCurrentRun();
  const stage = run.stages[stageName];

  if (!stage) {
    console.error(`✗ Stage '${stageName}' was not started`);
    return null;
  }

  if (stage.endTime) {
    console.warn(`⚠ Stage '${stageName}' already ended`);
    return stage;
  }

  stage.endTime = Date.now();
  stage.duration = stage.endTime - stage.startTime;
  stage.status = status;
  stage.endMemory = getMemoryUsage();
  stage.endSystemMemory = getSystemMemory();

  // Calculate memory delta
  if (stage.startMemory && stage.endMemory) {
    stage.memoryDelta = {
      heapUsed: stage.endMemory.heapUsed - stage.startMemory.heapUsed,
      heapTotal: stage.endMemory.heapTotal - stage.startMemory.heapTotal,
      rss: stage.endMemory.rss - stage.startMemory.rss,
    };
  }

  saveCurrentRun(run);

  const durationSec = (stage.duration / 1000).toFixed(2);
  const statusIcon = status === "pass" ? "✓" : status === "fail" ? "✗" : "⚠";
  console.log(`${statusIcon} Ended stage: ${stageName} (${durationSec}s)`);

  return stage;
}

// Complete the current run and archive it
function completeRun(finalStatus = "complete") {
  const run = loadCurrentRun();
  run.endTime = Date.now();
  run.totalDuration = run.endTime - run.startTime;
  run.status = finalStatus;

  // Calculate totals
  let passCount = 0;
  let failCount = 0;
  let totalStageDuration = 0;

  for (const stage of Object.values(run.stages)) {
    if (stage.status === "pass") passCount++;
    else if (stage.status === "fail") failCount++;
    totalStageDuration += stage.duration || 0;
  }

  run.summary = {
    stageCount: Object.keys(run.stages).length,
    passed: passCount,
    failed: failCount,
    totalStageDuration,
    overheadDuration: run.totalDuration - totalStageDuration,
    parallelSpeedup:
      totalStageDuration > 0 ? (totalStageDuration / run.totalDuration).toFixed(2) : 1,
  };

  // Archive to history
  const history = loadHistory();
  history.runs.push({
    runId: run.runId,
    timestamp: new Date(run.startTime).toISOString(),
    totalDuration: run.totalDuration,
    status: run.status,
    summary: run.summary,
    stages: Object.fromEntries(
      Object.entries(run.stages).map(([name, data]) => [
        name,
        { duration: data.duration, status: data.status },
      ]),
    ),
  });

  // Keep only last 50 runs
  if (history.runs.length > 50) {
    history.runs = history.runs.slice(-50);
  }

  saveHistory(history);

  // Reset current run
  saveCurrentRun({
    runId: generateRunId(),
    startTime: Date.now(),
    stages: {},
    metadata: run.metadata,
  });

  return run;
}

// Generate performance report
function generateReport(format = "md") {
  const run = loadCurrentRun();
  const history = loadHistory();

  // Sort stages by duration (slowest first)
  const sortedStages = Object.entries(run.stages)
    .filter(([_, data]) => data.duration != null)
    .sort((a, b) => (b[1].duration || 0) - (a[1].duration || 0));

  if (format === "json") {
    return JSON.stringify({ current: run, history: history.runs.slice(-10) }, null, 2);
  }

  const lines = [];

  if (format === "md") {
    lines.push("# Pipeline Performance Report");
    lines.push("");
    lines.push(`**Run ID:** ${run.runId}`);
    lines.push(`**Started:** ${new Date(run.startTime).toISOString()}`);
    lines.push("");

    lines.push("## Stage Timings");
    lines.push("");
    lines.push("| Stage | Duration | Status | Memory Delta |");
    lines.push("|-------|----------|--------|--------------|");

    for (const [name, data] of sortedStages) {
      const duration = data.duration ? `${(data.duration / 1000).toFixed(2)}s` : "N/A";
      const status = data.status === "pass" ? "✅" : data.status === "fail" ? "❌" : "⏳";
      const memDelta = data.memoryDelta
        ? `${(data.memoryDelta.heapUsed / 1024 / 1024).toFixed(1)}MB`
        : "N/A";
      lines.push(`| ${name} | ${duration} | ${status} | ${memDelta} |`);
    }

    lines.push("");
    lines.push("## Performance Analysis");
    lines.push("");

    // Identify slow stages (>30s)
    const slowStages = sortedStages.filter(([_, d]) => (d.duration || 0) > 30000);
    if (slowStages.length > 0) {
      lines.push("### Slow Stages (>30s)");
      lines.push("");
      for (const [name, data] of slowStages) {
        lines.push(`- **${name}**: ${(data.duration / 1000).toFixed(1)}s`);
      }
      lines.push("");
    }

    // Historical comparison
    if (history.runs.length > 1) {
      lines.push("### Historical Trend");
      lines.push("");
      const recent = history.runs.slice(-5);
      lines.push("| Run | Date | Duration | Status |");
      lines.push("|-----|------|----------|--------|");
      for (const r of recent) {
        const date = r.timestamp.slice(0, 10);
        const duration = `${(r.totalDuration / 1000).toFixed(1)}s`;
        const status = r.status === "complete" ? "✅" : "❌";
        lines.push(`| ${r.runId.slice(4, 20)} | ${date} | ${duration} | ${status} |`);
      }
    }
  } else {
    // ASCII format
    lines.push("=== Pipeline Performance Report ===");
    lines.push("");
    lines.push(`Run ID: ${run.runId}`);
    lines.push(`Started: ${new Date(run.startTime).toISOString()}`);
    lines.push("");
    lines.push("Stage Timings (slowest first):");
    lines.push("─".repeat(60));

    const maxNameLen = Math.max(...sortedStages.map(([n]) => n.length), 20);

    for (const [name, data] of sortedStages) {
      const duration = data.duration ? (data.duration / 1000).toFixed(2) : "N/A";
      const statusIcon = data.status === "pass" ? "✓" : data.status === "fail" ? "✗" : "⏳";
      const bar = data.duration ? "█".repeat(Math.min(Math.ceil(data.duration / 5000), 20)) : "";
      lines.push(`${statusIcon} ${name.padEnd(maxNameLen)} ${duration.padStart(8)}s ${bar}`);
    }

    lines.push("─".repeat(60));

    // Total
    const totalDuration = sortedStages.reduce((sum, [_, d]) => sum + (d.duration || 0), 0);
    lines.push(`Total stage time: ${(totalDuration / 1000).toFixed(2)}s`);
  }

  return lines.join("\n");
}

// Analyze performance trends
function analyzePerformance(slowThreshold = 30000) {
  const history = loadHistory();

  if (history.runs.length < 2) {
    return { error: "Need at least 2 runs for analysis" };
  }

  const recentRuns = history.runs.slice(-10);

  // Calculate averages per stage
  const stageStats = {};

  for (const run of recentRuns) {
    for (const [stage, data] of Object.entries(run.stages)) {
      if (!stageStats[stage]) {
        stageStats[stage] = { durations: [], failures: 0, successes: 0 };
      }
      if (data.duration != null) {
        stageStats[stage].durations.push(data.duration);
      }
      if (data.status === "pass") stageStats[stage].successes++;
      else if (data.status === "fail") stageStats[stage].failures++;
    }
  }

  // Compute statistics
  const analysis = {
    totalRuns: recentRuns.length,
    stages: {},
    slowStages: [],
    unreliableStages: [],
    recommendations: [],
  };

  for (const [stage, stats] of Object.entries(stageStats)) {
    const durations = stats.durations;
    if (durations.length === 0) continue;

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    const successRate = (stats.successes / (stats.successes + stats.failures)) * 100;

    analysis.stages[stage] = {
      avgDuration: Math.round(avg),
      minDuration: min,
      maxDuration: max,
      stdDev: Math.round(stdDev),
      successRate: Math.round(successRate),
      sampleCount: durations.length,
    };

    // Flag slow stages
    if (avg > slowThreshold) {
      analysis.slowStages.push({
        stage,
        avgDuration: Math.round(avg),
        recommendation: `Consider optimizing or caching ${stage}`,
      });
    }

    // Flag unreliable stages (high variance or low success rate)
    if (stdDev > avg * 0.5 || successRate < 80) {
      analysis.unreliableStages.push({
        stage,
        stdDev: Math.round(stdDev),
        successRate: Math.round(successRate),
        recommendation:
          successRate < 80
            ? `${stage} fails ${100 - Math.round(successRate)}% of the time`
            : `${stage} has high variance (±${(stdDev / 1000).toFixed(1)}s)`,
      });
    }
  }

  // Generate recommendations
  if (analysis.slowStages.length > 0) {
    analysis.recommendations.push(
      `Found ${analysis.slowStages.length} slow stage(s): ${analysis.slowStages
        .map((s) => s.stage)
        .join(", ")}`,
    );
  }

  if (analysis.unreliableStages.length > 0) {
    analysis.recommendations.push(
      `Found ${analysis.unreliableStages.length} unreliable stage(s) needing attention`,
    );
  }

  // Overall trend
  const recentDurations = recentRuns.filter((r) => r.totalDuration).map((r) => r.totalDuration);
  if (recentDurations.length >= 3) {
    const firstHalf = recentDurations.slice(0, Math.floor(recentDurations.length / 2));
    const secondHalf = recentDurations.slice(Math.floor(recentDurations.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (secondAvg > firstAvg * 1.2) {
      analysis.recommendations.push(
        `Build times are trending up (+${((secondAvg / firstAvg - 1) * 100).toFixed(0)}%)`,
      );
    } else if (secondAvg < firstAvg * 0.8) {
      analysis.recommendations.push(
        `Build times are improving (-${((1 - secondAvg / firstAvg) * 100).toFixed(0)}%)`,
      );
    }
  }

  return analysis;
}

// Get last N runs from history
function getHistory(count = 10) {
  const history = loadHistory();
  return history.runs.slice(-count);
}

// Parse CLI arguments
function parseArgs(args) {
  const parsed = {
    command: args[0],
    target: args[1],
    options: {},
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      parsed.options.json = true;
    } else if (arg === "--format" && args[i + 1]) {
      parsed.options.format = args[++i];
    } else if (arg === "--status" && args[i + 1]) {
      parsed.options.status = args[++i];
    } else if (arg === "--last" && args[i + 1]) {
      parsed.options.last = parseInt(args[++i], 10);
    } else if (arg === "--slow-threshold" && args[i + 1]) {
      parsed.options.slowThreshold = parseInt(args[++i], 10);
    } else if (arg === "--output" && args[i + 1]) {
      parsed.options.output = args[++i];
    } else if (!parsed.target) {
      parsed.target = arg;
    }
  }

  return parsed;
}

// Main CLI handler
const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case "start": {
    if (!args.target) {
      console.error("Usage: stage-profiler.js start <stage-name>");
      process.exit(2);
    }
    startStage(args.target);
    break;
  }

  case "end": {
    if (!args.target) {
      console.error("Usage: stage-profiler.js end <stage-name> [--status pass|fail]");
      process.exit(2);
    }
    const result = endStage(args.target, args.options.status || "pass");
    if (args.options.json && result) {
      console.log(JSON.stringify(result, null, 2));
    }
    break;
  }

  case "complete": {
    const run = completeRun(args.target || "complete");
    if (args.options.json) {
      console.log(JSON.stringify(run.summary, null, 2));
    } else {
      console.log("✓ Run completed and archived");
      console.log(`  Stages: ${run.summary.stageCount}`);
      console.log(`  Passed: ${run.summary.passed}`);
      console.log(`  Failed: ${run.summary.failed}`);
      console.log(`  Total duration: ${(run.totalDuration / 1000).toFixed(1)}s`);
      console.log(`  Parallel speedup: ${run.summary.parallelSpeedup}x`);
    }
    break;
  }

  case "report": {
    const format = args.options.format || (args.options.json ? "json" : "ascii");
    const report = generateReport(format);

    if (args.options.output) {
      writeFileSync(args.options.output, report);
      console.log(`✓ Report written to ${args.options.output}`);
    } else {
      console.log(report);
    }
    break;
  }

  case "history": {
    const count = args.options.last || 10;
    const runs = getHistory(count);

    if (args.options.json) {
      console.log(JSON.stringify(runs, null, 2));
    } else {
      console.log(`=== Last ${runs.length} Pipeline Runs ===`);
      console.log("");
      for (const run of runs) {
        const date = run.timestamp.slice(0, 19).replace("T", " ");
        const duration = `${(run.totalDuration / 1000).toFixed(1)}s`;
        const status = run.status === "complete" ? "✓" : "✗";
        console.log(
          `${status} ${date}  ${duration.padStart(8)}  ${run.summary.passed}/${run.summary.stageCount} passed`,
        );
      }
    }
    break;
  }

  case "analyze": {
    const threshold = args.options.slowThreshold || 30000;
    const analysis = analyzePerformance(threshold);

    if (args.options.json) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log("=== Performance Analysis ===");
      console.log("");
      console.log(`Analyzed ${analysis.totalRuns} recent runs`);
      console.log("");

      if (analysis.slowStages.length > 0) {
        console.log("Slow Stages (>${threshold / 1000}s average):");
        for (const s of analysis.slowStages) {
          console.log(`  ⚠ ${s.stage}: ${(s.avgDuration / 1000).toFixed(1)}s avg`);
        }
        console.log("");
      }

      if (analysis.unreliableStages.length > 0) {
        console.log("Unreliable Stages:");
        for (const s of analysis.unreliableStages) {
          console.log(`  ⚠ ${s.stage}: ${s.recommendation}`);
        }
        console.log("");
      }

      if (analysis.recommendations.length > 0) {
        console.log("Recommendations:");
        for (const r of analysis.recommendations) {
          console.log(`  → ${r}`);
        }
      }

      console.log("");
      console.log("Stage Statistics:");
      for (const [stage, stats] of Object.entries(analysis.stages)) {
        console.log(
          `  ${stage.padEnd(20)} avg: ${(stats.avgDuration / 1000).toFixed(1)}s  ` +
            `min: ${(stats.minDuration / 1000).toFixed(1)}s  ` +
            `max: ${(stats.maxDuration / 1000).toFixed(1)}s  ` +
            `success: ${stats.successRate}%`,
        );
      }
    }
    break;
  }

  case "status": {
    const run = loadCurrentRun();
    if (args.options.json) {
      console.log(JSON.stringify(run, null, 2));
    } else {
      console.log("=== Current Run Status ===");
      console.log(`Run ID: ${run.runId}`);
      console.log(`Started: ${new Date(run.startTime).toISOString()}`);
      console.log(`Stages: ${Object.keys(run.stages).length}`);
      console.log("");
      for (const [name, data] of Object.entries(run.stages)) {
        const status = data.status || "unknown";
        const duration = data.duration ? `${(data.duration / 1000).toFixed(1)}s` : "running...";
        console.log(`  ${name}: ${status} (${duration})`);
      }
    }
    break;
  }

  default:
    console.log("Stage Profiler — Pipeline timing and performance analysis");
    console.log("");
    console.log("Usage:");
    console.log("  stage-profiler.js start <stage>       Start timing a stage");
    console.log("  stage-profiler.js end <stage>         End timing a stage");
    console.log("  stage-profiler.js complete            Archive current run");
    console.log("  stage-profiler.js report              Generate performance report");
    console.log("  stage-profiler.js history             Show recent runs");
    console.log("  stage-profiler.js analyze             Analyze performance trends");
    console.log("  stage-profiler.js status              Show current run status");
    console.log("");
    console.log("Options:");
    console.log("  --json                Output as JSON");
    console.log("  --format md|json|ascii Report format (default: ascii)");
    console.log("  --status pass|fail    Stage completion status");
    console.log("  --last N              Number of historical runs");
    console.log("  --slow-threshold N    Threshold in ms for slow stages");
    console.log("  --output <file>       Write report to file");
    process.exit(args.command ? 2 : 0);
}
