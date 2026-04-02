#!/usr/bin/env node
/**
 * metrics-dashboard.js — Build performance metrics dashboard generator
 *
 * Usage:
 *   node scripts/metrics-dashboard.js generate [--output <file>] [--format html|md|json]
 *   node scripts/metrics-dashboard.js summary [--json]
 *   node scripts/metrics-dashboard.js trends [--period 7d|30d|all]
 *   node scripts/metrics-dashboard.js compare <run-id-1> <run-id-2>
 *
 * Features:
 *   - Comprehensive build metrics visualization
 *   - Cache efficiency tracking
 *   - Performance trend analysis
 *   - Stage-by-stage breakdowns
 *   - Actionable optimization recommendations
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// Paths
const METRICS_DIR = join(PROJECT_ROOT, ".claude", "pipeline-cache", "metrics");
const CACHE_DIR = join(PROJECT_ROOT, ".claude", "pipeline-cache");
const CACHE_MANIFEST = join(CACHE_DIR, "cache-manifest.json");
const HISTORY_FILE = join(METRICS_DIR, "history.json");
const DASHBOARD_DIR = join(PROJECT_ROOT, ".claude", "visual-qa", "dashboard");

// Load data files
function loadHistory() {
  if (!existsSync(HISTORY_FILE)) {
    return { runs: [] };
  }
  return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
}

function loadCacheManifest() {
  if (!existsSync(CACHE_MANIFEST)) {
    return { phases: {}, metrics: { cacheHits: 0, cacheMisses: 0, timeSaved: 0 } };
  }
  return JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
}

// Calculate summary statistics
function calculateSummary() {
  const history = loadHistory();
  const cache = loadCacheManifest();
  const runs = history.runs;

  if (runs.length === 0) {
    return {
      error: "No build history found",
      recommendation: "Run the pipeline to collect metrics",
    };
  }

  // Basic stats
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.status === "complete").length;
  const failedRuns = runs.filter((r) => r.status !== "complete").length;

  // Duration stats
  const durations = runs.filter((r) => r.totalDuration).map((r) => r.totalDuration);
  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

  // Recent trend (last 7 runs)
  const recentRuns = runs.slice(-7);
  const recentAvg =
    recentRuns.length > 0
      ? recentRuns.filter((r) => r.totalDuration).reduce((a, r) => a + r.totalDuration, 0) /
        recentRuns.length
      : 0;

  // Cache efficiency
  const cacheMetrics = cache.metrics || {};
  const totalCacheOps = (cacheMetrics.cacheHits || 0) + (cacheMetrics.cacheMisses || 0);
  const cacheHitRate =
    totalCacheOps > 0 ? ((cacheMetrics.cacheHits || 0) / totalCacheOps) * 100 : 0;

  // Stage analysis
  const stageStats = {};
  for (const run of runs) {
    if (!run.stages) continue;
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

  // Find slowest stages
  const stageAvgs = Object.entries(stageStats).map(([stage, stats]) => ({
    stage,
    avgDuration:
      stats.durations.length > 0
        ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
        : 0,
    successRate:
      stats.successes + stats.failures > 0
        ? (stats.successes / (stats.successes + stats.failures)) * 100
        : 100,
  }));

  const slowestStages = stageAvgs.sort((a, b) => b.avgDuration - a.avgDuration).slice(0, 5);

  return {
    overview: {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: ((successfulRuns / totalRuns) * 100).toFixed(1),
    },
    duration: {
      average: Math.round(avgDuration),
      min: minDuration,
      max: maxDuration,
      recent: Math.round(recentAvg),
      trend:
        recentAvg < avgDuration ? "improving" : recentAvg > avgDuration ? "degrading" : "stable",
    },
    cache: {
      hits: cacheMetrics.cacheHits || 0,
      misses: cacheMetrics.cacheMisses || 0,
      hitRate: cacheHitRate.toFixed(1),
      timeSaved: cacheMetrics.timeSaved || 0,
    },
    slowestStages,
    stageCount: Object.keys(stageStats).length,
  };
}

// Calculate trends over a period
function calculateTrends(period = "7d") {
  const history = loadHistory();
  let runs = history.runs;

  // Filter by period
  if (period !== "all") {
    const days = parseInt(period, 10) || 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    runs = runs.filter((r) => new Date(r.timestamp).getTime() > cutoff);
  }

  if (runs.length < 2) {
    return { error: "Not enough data for trend analysis", runs: runs.length };
  }

  // Calculate daily averages
  const dailyStats = {};
  for (const run of runs) {
    const date = run.timestamp.slice(0, 10);
    if (!dailyStats[date]) {
      dailyStats[date] = { durations: [], successes: 0, failures: 0 };
    }
    if (run.totalDuration) {
      dailyStats[date].durations.push(run.totalDuration);
    }
    if (run.status === "complete") dailyStats[date].successes++;
    else dailyStats[date].failures++;
  }

  const dailyTrend = Object.entries(dailyStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      avgDuration:
        stats.durations.length > 0
          ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
          : 0,
      runs: stats.durations.length,
      successRate:
        stats.successes + stats.failures > 0
          ? Math.round((stats.successes / (stats.successes + stats.failures)) * 100)
          : 100,
    }));

  // Calculate trend direction
  if (dailyTrend.length >= 2) {
    const firstHalf = dailyTrend.slice(0, Math.floor(dailyTrend.length / 2));
    const secondHalf = dailyTrend.slice(Math.floor(dailyTrend.length / 2));

    const firstAvg = firstHalf.reduce((a, d) => a + d.avgDuration, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, d) => a + d.avgDuration, 0) / secondHalf.length;

    const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

    return {
      period,
      dataPoints: dailyTrend.length,
      daily: dailyTrend,
      trend: {
        direction: percentChange < -5 ? "improving" : percentChange > 5 ? "degrading" : "stable",
        percentChange: percentChange.toFixed(1),
      },
    };
  }

  return { period, daily: dailyTrend };
}

// Compare two runs
function compareRuns(runId1, runId2) {
  const history = loadHistory();
  const run1 = history.runs.find((r) => r.runId === runId1 || r.runId.includes(runId1));
  const run2 = history.runs.find((r) => r.runId === runId2 || r.runId.includes(runId2));

  if (!run1 || !run2) {
    return { error: "One or both runs not found" };
  }

  const comparison = {
    run1: { id: run1.runId, timestamp: run1.timestamp, duration: run1.totalDuration },
    run2: { id: run2.runId, timestamp: run2.timestamp, duration: run2.totalDuration },
    durationDiff: (run2.totalDuration || 0) - (run1.totalDuration || 0),
    stages: {},
  };

  // Compare stages
  const allStages = new Set([...Object.keys(run1.stages || {}), ...Object.keys(run2.stages || {})]);

  for (const stage of allStages) {
    const stage1 = run1.stages?.[stage] || {};
    const stage2 = run2.stages?.[stage] || {};

    comparison.stages[stage] = {
      run1: { duration: stage1.duration, status: stage1.status },
      run2: { duration: stage2.duration, status: stage2.status },
      durationDiff: (stage2.duration || 0) - (stage1.duration || 0),
      improved: (stage2.duration || 0) < (stage1.duration || 0),
    };
  }

  return comparison;
}

// Generate HTML dashboard
function generateHtmlDashboard() {
  const summary = calculateSummary();
  const trends = calculateTrends("7d");

  if (summary.error) {
    return `<html><body><h1>No Data</h1><p>${summary.error}</p></body></html>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pipeline Performance Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
    }
    .dashboard { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 2rem; color: #f8fafc; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .card {
      background: #1e293b;
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid #334155;
    }
    .card h2 { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; }
    .metric { font-size: 2.5rem; font-weight: 700; color: #f8fafc; }
    .metric.success { color: #4ade80; }
    .metric.warning { color: #fbbf24; }
    .metric.error { color: #f87171; }
    .sub { font-size: 0.875rem; color: #64748b; margin-top: 0.5rem; }
    .bar-chart { margin-top: 1rem; }
    .bar {
      display: flex;
      align-items: center;
      margin: 0.5rem 0;
    }
    .bar-label { width: 140px; font-size: 0.875rem; color: #94a3b8; }
    .bar-track {
      flex: 1;
      height: 24px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-size: 0.75rem;
      color: #fff;
    }
    .trend-up { color: #f87171; }
    .trend-down { color: #4ade80; }
    .trend-stable { color: #fbbf24; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th, td {
      text-align: left;
      padding: 0.75rem;
      border-bottom: 1px solid #334155;
    }
    th { color: #94a3b8; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
    td { font-size: 0.875rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge.success { background: #166534; color: #4ade80; }
    .badge.warning { background: #854d0e; color: #fbbf24; }
    .badge.error { background: #991b1b; color: #f87171; }
    .timestamp { color: #64748b; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="dashboard">
    <h1>🚀 Pipeline Performance Dashboard</h1>

    <div class="grid">
      <!-- Overview Card -->
      <div class="card">
        <h2>Build Overview</h2>
        <div class="metric">${summary.overview.totalRuns}</div>
        <div class="sub">Total pipeline runs</div>
        <div style="margin-top: 1rem;">
          <span class="badge success">${summary.overview.successfulRuns} passed</span>
          <span class="badge error">${summary.overview.failedRuns} failed</span>
        </div>
        <div class="sub">Success rate: ${summary.overview.successRate}%</div>
      </div>

      <!-- Duration Card -->
      <div class="card">
        <h2>Build Duration</h2>
        <div class="metric">${(summary.duration.average / 1000).toFixed(1)}s</div>
        <div class="sub">Average duration</div>
        <div style="margin-top: 1rem; display: flex; gap: 1rem;">
          <div>
            <div style="font-size: 1.25rem; font-weight: 600;">${(summary.duration.min / 1000).toFixed(1)}s</div>
            <div class="sub">Fastest</div>
          </div>
          <div>
            <div style="font-size: 1.25rem; font-weight: 600;">${(summary.duration.max / 1000).toFixed(1)}s</div>
            <div class="sub">Slowest</div>
          </div>
        </div>
        <div class="sub ${summary.duration.trend === "improving" ? "trend-down" : summary.duration.trend === "degrading" ? "trend-up" : "trend-stable"}">
          Trend: ${summary.duration.trend}
        </div>
      </div>

      <!-- Cache Card -->
      <div class="card">
        <h2>Cache Efficiency</h2>
        <div class="metric ${parseFloat(summary.cache.hitRate) > 50 ? "success" : "warning"}">${summary.cache.hitRate}%</div>
        <div class="sub">Cache hit rate</div>
        <div style="margin-top: 1rem;">
          <div>Hits: ${summary.cache.hits} | Misses: ${summary.cache.misses}</div>
          <div class="sub">Time saved: ${(summary.cache.timeSaved / 1000).toFixed(1)}s</div>
        </div>
      </div>

      <!-- Stages Card -->
      <div class="card" style="grid-column: span 2;">
        <h2>Slowest Stages</h2>
        <div class="bar-chart">
          ${summary.slowestStages
            .map((s) => {
              const maxDuration = summary.slowestStages[0]?.avgDuration || 1;
              const pct = (s.avgDuration / maxDuration) * 100;
              return `
            <div class="bar">
              <div class="bar-label">${s.stage}</div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${pct}%">${(s.avgDuration / 1000).toFixed(1)}s</div>
              </div>
            </div>`;
            })
            .join("")}
        </div>
      </div>

      <!-- Trends Card -->
      <div class="card" style="grid-column: span 2;">
        <h2>7-Day Trend</h2>
        ${
          trends.daily
            ? `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Runs</th>
              <th>Avg Duration</th>
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            ${trends.daily
              .slice(-7)
              .map(
                (d) => `
            <tr>
              <td>${d.date}</td>
              <td>${d.runs}</td>
              <td>${(d.avgDuration / 1000).toFixed(1)}s</td>
              <td><span class="badge ${d.successRate >= 90 ? "success" : d.successRate >= 70 ? "warning" : "error"}">${d.successRate}%</span></td>
            </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
        `
            : '<div class="sub">Not enough data for trends</div>'
        }
      </div>
    </div>

    <div class="timestamp" style="margin-top: 2rem;">
      Generated: ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;

  return html;
}

// Generate Markdown dashboard
function generateMarkdownDashboard() {
  const summary = calculateSummary();
  const trends = calculateTrends("7d");

  if (summary.error) {
    return `# Pipeline Performance Dashboard\n\n**No data available:** ${summary.error}`;
  }

  const lines = [
    "# Pipeline Performance Dashboard",
    "",
    `*Generated: ${new Date().toISOString()}*`,
    "",
    "## Overview",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Runs | ${summary.overview.totalRuns} |`,
    `| Successful | ${summary.overview.successfulRuns} |`,
    `| Failed | ${summary.overview.failedRuns} |`,
    `| Success Rate | ${summary.overview.successRate}% |`,
    "",
    "## Build Duration",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Average | ${(summary.duration.average / 1000).toFixed(1)}s |`,
    `| Fastest | ${(summary.duration.min / 1000).toFixed(1)}s |`,
    `| Slowest | ${(summary.duration.max / 1000).toFixed(1)}s |`,
    `| Recent Avg | ${(summary.duration.recent / 1000).toFixed(1)}s |`,
    `| Trend | ${summary.duration.trend} |`,
    "",
    "## Cache Efficiency",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Hit Rate | ${summary.cache.hitRate}% |`,
    `| Hits | ${summary.cache.hits} |`,
    `| Misses | ${summary.cache.misses} |`,
    `| Time Saved | ${(summary.cache.timeSaved / 1000).toFixed(1)}s |`,
    "",
    "## Slowest Stages",
    "",
    "| Stage | Avg Duration | Success Rate |",
    "|-------|--------------|--------------|",
  ];

  for (const s of summary.slowestStages) {
    lines.push(
      `| ${s.stage} | ${(s.avgDuration / 1000).toFixed(1)}s | ${s.successRate.toFixed(0)}% |`,
    );
  }

  if (trends.daily && trends.daily.length > 0) {
    lines.push("");
    lines.push("## 7-Day Trend");
    lines.push("");
    lines.push("| Date | Runs | Avg Duration | Success Rate |");
    lines.push("|------|------|--------------|--------------|");

    for (const d of trends.daily.slice(-7)) {
      lines.push(
        `| ${d.date} | ${d.runs} | ${(d.avgDuration / 1000).toFixed(1)}s | ${d.successRate}% |`,
      );
    }

    if (trends.trend) {
      lines.push("");
      lines.push(`**Trend:** ${trends.trend.direction} (${trends.trend.percentChange}%)`);
    }
  }

  return lines.join("\n");
}

// Parse CLI arguments
function parseArgs(args) {
  const parsed = {
    command: args[0],
    target: args[1],
    options: {},
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      parsed.options.json = true;
    } else if (arg === "--format" && args[i + 1]) {
      parsed.options.format = args[++i];
    } else if (arg === "--output" && args[i + 1]) {
      parsed.options.output = args[++i];
    } else if (arg === "--period" && args[i + 1]) {
      parsed.options.period = args[++i];
    } else if (!parsed.target && !arg.startsWith("--")) {
      parsed.target = arg;
    } else if (!parsed.options.target2 && !arg.startsWith("--")) {
      parsed.options.target2 = arg;
    }
  }

  return parsed;
}

// Ensure dashboard directory exists
function ensureDashboardDir() {
  if (!existsSync(DASHBOARD_DIR)) {
    mkdirSync(DASHBOARD_DIR, { recursive: true });
  }
}

// Main CLI handler
const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case "generate": {
    const format = args.options.format || "html";
    let content;
    let ext;

    switch (format) {
      case "html":
        content = generateHtmlDashboard();
        ext = "html";
        break;
      case "md":
        content = generateMarkdownDashboard();
        ext = "md";
        break;
      case "json":
        content = JSON.stringify(calculateSummary(), null, 2);
        ext = "json";
        break;
      default:
        console.error(`Unknown format: ${format}`);
        process.exit(2);
    }

    if (args.options.output) {
      writeFileSync(args.options.output, content);
      console.log(`✓ Dashboard written to ${args.options.output}`);
    } else {
      ensureDashboardDir();
      const outPath = join(DASHBOARD_DIR, `dashboard.${ext}`);
      writeFileSync(outPath, content);
      console.log(`✓ Dashboard written to ${outPath}`);
    }
    break;
  }

  case "summary": {
    const summary = calculateSummary();
    if (args.options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      if (summary.error) {
        console.log(`⚠ ${summary.error}`);
        break;
      }
      console.log("=== Pipeline Performance Summary ===");
      console.log("");
      console.log(`Total runs:    ${summary.overview.totalRuns}`);
      console.log(`Success rate:  ${summary.overview.successRate}%`);
      console.log("");
      console.log(`Avg duration:  ${(summary.duration.average / 1000).toFixed(1)}s`);
      console.log(`Fastest:       ${(summary.duration.min / 1000).toFixed(1)}s`);
      console.log(`Slowest:       ${(summary.duration.max / 1000).toFixed(1)}s`);
      console.log(`Trend:         ${summary.duration.trend}`);
      console.log("");
      console.log(`Cache hit rate: ${summary.cache.hitRate}%`);
      console.log(`Time saved:     ${(summary.cache.timeSaved / 1000).toFixed(1)}s`);
      console.log("");
      console.log("Slowest stages:");
      for (const s of summary.slowestStages) {
        console.log(`  ${s.stage.padEnd(20)} ${(s.avgDuration / 1000).toFixed(1)}s`);
      }
    }
    break;
  }

  case "trends": {
    const period = args.options.period || "7d";
    const trends = calculateTrends(period);

    if (args.options.json) {
      console.log(JSON.stringify(trends, null, 2));
    } else {
      if (trends.error) {
        console.log(`⚠ ${trends.error}`);
        break;
      }
      console.log(`=== Performance Trends (${period}) ===`);
      console.log("");

      if (trends.daily) {
        console.log("Date         Runs    Avg Duration    Success");
        console.log("─".repeat(50));
        for (const d of trends.daily) {
          console.log(
            `${d.date}    ${String(d.runs).padStart(4)}    ${((d.avgDuration / 1000).toFixed(1) + "s").padStart(12)}    ${(d.successRate + "%").padStart(6)}`,
          );
        }
      }

      if (trends.trend) {
        console.log("");
        console.log(`Overall trend: ${trends.trend.direction} (${trends.trend.percentChange}%)`);
      }
    }
    break;
  }

  case "compare": {
    if (!args.target || !args.options.target2) {
      console.error("Usage: metrics-dashboard.js compare <run-id-1> <run-id-2>");
      process.exit(2);
    }

    const comparison = compareRuns(args.target, args.options.target2);

    if (args.options.json) {
      console.log(JSON.stringify(comparison, null, 2));
    } else {
      if (comparison.error) {
        console.log(`✗ ${comparison.error}`);
        break;
      }

      console.log("=== Run Comparison ===");
      console.log("");
      console.log(`Run 1: ${comparison.run1.id}`);
      console.log(`       ${comparison.run1.timestamp}`);
      console.log(`       Duration: ${(comparison.run1.duration / 1000).toFixed(1)}s`);
      console.log("");
      console.log(`Run 2: ${comparison.run2.id}`);
      console.log(`       ${comparison.run2.timestamp}`);
      console.log(`       Duration: ${(comparison.run2.duration / 1000).toFixed(1)}s`);
      console.log("");

      const diff = comparison.durationDiff / 1000;
      const sign = diff > 0 ? "+" : "";
      console.log(
        `Difference: ${sign}${diff.toFixed(1)}s ${diff > 0 ? "(slower)" : diff < 0 ? "(faster)" : ""}`,
      );
      console.log("");

      console.log("Stage Comparison:");
      console.log("Stage                   Run 1       Run 2       Diff");
      console.log("─".repeat(60));

      for (const [stage, data] of Object.entries(comparison.stages)) {
        const d1 =
          data.run1.duration != null ? (data.run1.duration / 1000).toFixed(1) + "s" : "N/A";
        const d2 =
          data.run2.duration != null ? (data.run2.duration / 1000).toFixed(1) + "s" : "N/A";
        const stageDiff = (data.durationDiff / 1000).toFixed(1);
        const icon = data.improved ? "↓" : data.durationDiff > 0 ? "↑" : "=";
        console.log(
          `${stage.padEnd(20)} ${d1.padStart(10)} ${d2.padStart(10)} ${icon} ${stageDiff}s`,
        );
      }
    }
    break;
  }

  default:
    console.log("Metrics Dashboard — Build performance visualization");
    console.log("");
    console.log("Usage:");
    console.log("  metrics-dashboard.js generate     Generate dashboard (HTML/MD/JSON)");
    console.log("  metrics-dashboard.js summary      Show performance summary");
    console.log("  metrics-dashboard.js trends       Show performance trends");
    console.log("  metrics-dashboard.js compare      Compare two runs");
    console.log("");
    console.log("Options:");
    console.log("  --json                Output as JSON");
    console.log("  --format html|md|json Dashboard format");
    console.log("  --output <file>       Write to specific file");
    console.log("  --period 7d|30d|all   Trend analysis period");
    process.exit(args.command ? 2 : 0);
}
