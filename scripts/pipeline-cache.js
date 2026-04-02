#!/usr/bin/env node
/**
 * pipeline-cache.js — Asset hash-based caching for pipeline optimization
 *
 * Usage:
 *   node scripts/pipeline-cache.js hash <file|dir> [--output <cache.json>]
 *   node scripts/pipeline-cache.js check <phase> [--cache <cache.json>]
 *   node scripts/pipeline-cache.js invalidate <phase> [--cache <cache.json>]
 *   node scripts/pipeline-cache.js clean [--max-age <days>]
 *   node scripts/pipeline-cache.js status [--json]
 *
 * Features:
 *   - Content-addressable hashing using SHA-256
 *   - Phase-level cache invalidation
 *   - Automatic cache cleanup
 *   - Dependency-aware cache validation
 */

import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  unlinkSync,
  rmSync,
} from "fs";
import { join, relative, resolve, extname, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// Default paths
const CACHE_DIR = join(PROJECT_ROOT, ".claude", "pipeline-cache");
const CACHE_MANIFEST = join(CACHE_DIR, "cache-manifest.json");
const METRICS_FILE = join(CACHE_DIR, "build-metrics.json");

// File patterns for different input categories
const INPUT_PATTERNS = {
  source: ["src/**/*.{ts,tsx,js,jsx}", "components/**/*.{ts,tsx}"],
  styles: ["src/**/*.css", "styles/**/*.css", "tailwind.config.*"],
  tests: ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx}"],
  config: [
    "package.json",
    "tsconfig.json",
    "vite.config.*",
    "next.config.*",
    ".claude/pipeline.config.json",
  ],
  tokens: ["design-tokens.lock.json", "tailwind.config.*"],
  figma: ["build-spec.json", "design-tokens.lock.json"],
};

// Phase input dependencies
const PHASE_INPUTS = {
  "token-sync": ["tokens", "config"],
  intake: ["figma"],
  "token-lock": ["figma", "tokens"],
  "tdd-scaffold": ["figma", "tokens", "tests"],
  "component-build": ["source", "styles", "tokens", "tests", "config"],
  storybook: ["source", "styles"],
  "visual-diff": ["source", "styles"],
  "dark-mode": ["source", "styles"],
  "e2e-tests": ["source", "tests", "config"],
  "cross-browser": ["source", "styles"],
  "quality-gate": ["source", "tests", "config"],
  responsive: ["source", "styles"],
  report: [],
};

// Initialize cache directory
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Load cache manifest
function loadManifest() {
  ensureCacheDir();
  if (!existsSync(CACHE_MANIFEST)) {
    return {
      version: "1.0.0",
      created: new Date().toISOString(),
      phases: {},
      fileHashes: {},
      metrics: {
        totalBuilds: 0,
        cacheHits: 0,
        cacheMisses: 0,
        timeSaved: 0,
      },
    };
  }
  return JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
}

// Save cache manifest
function saveManifest(manifest) {
  ensureCacheDir();
  manifest.updated = new Date().toISOString();
  writeFileSync(CACHE_MANIFEST, JSON.stringify(manifest, null, 2));
}

// Compute SHA-256 hash of file content
function hashFile(filepath) {
  try {
    const content = readFileSync(filepath);
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

// Compute hash of directory (combination of all file hashes)
function hashDirectory(dirpath, patterns = ["**/*"]) {
  const hashes = [];

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          const hash = hashFile(fullPath);
          if (hash) {
            hashes.push(`${relative(PROJECT_ROOT, fullPath)}:${hash}`);
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  if (existsSync(dirpath)) {
    if (statSync(dirpath).isDirectory()) {
      walkDir(dirpath);
    } else {
      const hash = hashFile(dirpath);
      if (hash) {
        hashes.push(`${relative(PROJECT_ROOT, dirpath)}:${hash}`);
      }
    }
  }

  hashes.sort();
  return createHash("sha256").update(hashes.join("\n")).digest("hex").slice(0, 16);
}

// Find files matching glob patterns
function findFiles(patterns) {
  const files = [];

  function matchesPattern(filepath, pattern) {
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/\*\*/g, "{{GLOBSTAR}}")
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.")
          .replace(/{{GLOBSTAR}}/g, ".*") +
        "$",
    );
    return regex.test(filepath);
  }

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(PROJECT_ROOT, fullPath);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          for (const pattern of patterns) {
            if (matchesPattern(relPath, pattern)) {
              files.push(fullPath);
              break;
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  walkDir(PROJECT_ROOT);
  return files;
}

// Compute combined hash for a set of input categories
function computeInputHash(categories) {
  const allPatterns = [];
  for (const category of categories) {
    if (INPUT_PATTERNS[category]) {
      allPatterns.push(...INPUT_PATTERNS[category]);
    }
  }

  const files = findFiles(allPatterns);
  const hashes = [];

  for (const file of files) {
    const hash = hashFile(file);
    if (hash) {
      hashes.push(`${relative(PROJECT_ROOT, file)}:${hash}`);
    }
  }

  hashes.sort();
  return createHash("sha256").update(hashes.join("\n")).digest("hex").slice(0, 16);
}

// Check if a phase's cache is valid
function checkPhaseCache(phase) {
  const manifest = loadManifest();
  const phaseData = manifest.phases[phase];

  if (!phaseData) {
    return { valid: false, reason: "no-cache", changed: [] };
  }

  const inputCategories = PHASE_INPUTS[phase] || [];
  if (inputCategories.length === 0) {
    // Phases with no inputs always run
    return { valid: false, reason: "no-inputs", changed: [] };
  }

  const currentHash = computeInputHash(inputCategories);
  const cachedHash = phaseData.inputHash;

  if (currentHash === cachedHash) {
    return {
      valid: true,
      cachedAt: phaseData.timestamp,
      duration: phaseData.duration,
    };
  }

  // Identify which files changed
  const changed = [];
  for (const category of inputCategories) {
    const patterns = INPUT_PATTERNS[category] || [];
    const files = findFiles(patterns);

    for (const file of files) {
      const relPath = relative(PROJECT_ROOT, file);
      const currentFileHash = hashFile(file);
      const cachedFileHash = manifest.fileHashes[relPath];

      if (currentFileHash !== cachedFileHash) {
        changed.push(relPath);
      }
    }
  }

  return { valid: false, reason: "hash-mismatch", changed: changed.slice(0, 10) };
}

// Update phase cache after successful completion
function updatePhaseCache(phase, duration, result = "success") {
  const manifest = loadManifest();
  const inputCategories = PHASE_INPUTS[phase] || [];
  const inputHash = inputCategories.length > 0 ? computeInputHash(inputCategories) : null;

  // Update file hashes
  for (const category of inputCategories) {
    const patterns = INPUT_PATTERNS[category] || [];
    const files = findFiles(patterns);

    for (const file of files) {
      const relPath = relative(PROJECT_ROOT, file);
      const hash = hashFile(file);
      if (hash) {
        manifest.fileHashes[relPath] = hash;
      }
    }
  }

  // Update phase cache
  manifest.phases[phase] = {
    inputHash,
    timestamp: new Date().toISOString(),
    duration,
    result,
  };

  // Update metrics
  manifest.metrics.totalBuilds++;

  saveManifest(manifest);
  return { phase, inputHash, duration };
}

// Invalidate a phase's cache
function invalidatePhase(phase) {
  const manifest = loadManifest();

  if (manifest.phases[phase]) {
    delete manifest.phases[phase];
    saveManifest(manifest);
    return true;
  }

  return false;
}

// Invalidate all caches
function invalidateAll() {
  const manifest = loadManifest();
  manifest.phases = {};
  manifest.fileHashes = {};
  saveManifest(manifest);
}

// Clean old cache entries
function cleanCache(maxAgeDays = 7) {
  const manifest = loadManifest();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [phase, data] of Object.entries(manifest.phases)) {
    if (new Date(data.timestamp).getTime() < cutoff) {
      delete manifest.phases[phase];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    saveManifest(manifest);
  }

  // Also clean artifact directories
  const artifactDirs = [join(CACHE_DIR, "artifacts"), join(CACHE_DIR, "screenshots")];

  for (const dir of artifactDirs) {
    if (existsSync(dir)) {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const entryPath = join(dir, entry);
          const stat = statSync(entryPath);
          if (stat.mtimeMs < cutoff) {
            rmSync(entryPath, { recursive: true, force: true });
            cleaned++;
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return cleaned;
}

// Get cache status summary
function getCacheStatus() {
  const manifest = loadManifest();
  const phases = Object.entries(manifest.phases).map(([name, data]) => ({
    name,
    valid: checkPhaseCache(name).valid,
    cachedAt: data.timestamp,
    duration: data.duration,
    result: data.result,
  }));

  const validCount = phases.filter((p) => p.valid).length;
  const totalDuration = phases.reduce((sum, p) => sum + (p.duration || 0), 0);

  return {
    cacheDir: CACHE_DIR,
    manifestFile: CACHE_MANIFEST,
    created: manifest.created,
    updated: manifest.updated,
    phases: {
      total: phases.length,
      valid: validCount,
      invalid: phases.length - validCount,
      list: phases,
    },
    fileHashes: Object.keys(manifest.fileHashes).length,
    metrics: manifest.metrics,
    estimatedTimeSaved: validCount > 0 ? totalDuration : 0,
  };
}

// Record a cache hit
function recordCacheHit(phase, savedTime) {
  const manifest = loadManifest();
  manifest.metrics.cacheHits++;
  manifest.metrics.timeSaved += savedTime || 0;
  saveManifest(manifest);
}

// Record a cache miss
function recordCacheMiss() {
  const manifest = loadManifest();
  manifest.metrics.cacheMisses++;
  saveManifest(manifest);
}

// Hash a specific file or directory
function hashTarget(target, outputFile = null) {
  const fullPath = resolve(PROJECT_ROOT, target);
  let result;

  if (existsSync(fullPath)) {
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result = {
        type: "directory",
        path: target,
        hash: hashDirectory(fullPath),
        size: getDirSize(fullPath),
      };
    } else {
      result = {
        type: "file",
        path: target,
        hash: hashFile(fullPath),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    }
  } else {
    result = { error: `Path not found: ${target}` };
  }

  if (outputFile) {
    writeFileSync(outputFile, JSON.stringify(result, null, 2));
  }

  return result;
}

// Get directory size recursively
function getDirSize(dirPath) {
  let size = 0;

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          try {
            size += statSync(fullPath).size;
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walkDir(dirPath);
  return size;
}

// Format human-readable output
function formatStatus(status) {
  const lines = [];

  lines.push("=== Pipeline Cache Status ===");
  lines.push("");
  lines.push(`Cache directory: ${status.cacheDir}`);
  lines.push(`Created: ${status.created || "N/A"}`);
  lines.push(`Updated: ${status.updated || "N/A"}`);
  lines.push("");
  lines.push(`Phases cached: ${status.phases.total}`);
  lines.push(`  Valid: ${status.phases.valid}`);
  lines.push(`  Invalid: ${status.phases.invalid}`);
  lines.push("");
  lines.push(`File hashes tracked: ${status.fileHashes}`);
  lines.push("");
  lines.push("Cache Metrics:");
  lines.push(`  Total builds: ${status.metrics.totalBuilds}`);
  lines.push(`  Cache hits: ${status.metrics.cacheHits}`);
  lines.push(`  Cache misses: ${status.metrics.cacheMisses}`);
  lines.push(
    `  Hit rate: ${
      status.metrics.totalBuilds > 0
        ? ((status.metrics.cacheHits / status.metrics.totalBuilds) * 100).toFixed(1)
        : 0
    }%`,
  );
  lines.push(`  Time saved: ${(status.metrics.timeSaved / 1000).toFixed(1)}s`);

  if (status.phases.list.length > 0) {
    lines.push("");
    lines.push("Cached Phases:");
    for (const phase of status.phases.list) {
      const validMark = phase.valid ? "✓" : "✗";
      const duration = phase.duration ? `${(phase.duration / 1000).toFixed(1)}s` : "N/A";
      lines.push(
        `  ${validMark} ${phase.name.padEnd(20)} ${duration.padStart(8)}  ${phase.result || ""}`,
      );
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

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      parsed.options.json = true;
    } else if (arg === "--output" && args[i + 1]) {
      parsed.options.output = args[++i];
    } else if (arg === "--cache" && args[i + 1]) {
      parsed.options.cache = args[++i];
    } else if (arg === "--max-age" && args[i + 1]) {
      parsed.options.maxAge = parseInt(args[++i], 10);
    } else if (!parsed.target) {
      parsed.target = arg;
    }
  }

  return parsed;
}

// Main CLI handler
const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case "hash": {
    if (!args.target) {
      console.error("Usage: pipeline-cache.js hash <file|dir> [--output <file>]");
      process.exit(2);
    }
    const result = hashTarget(args.target, args.options.output);
    console.log(
      args.options.json ? JSON.stringify(result, null, 2) : `Hash: ${result.hash || result.error}`,
    );
    break;
  }

  case "check": {
    if (!args.target) {
      console.error("Usage: pipeline-cache.js check <phase> [--json]");
      process.exit(2);
    }
    const result = checkPhaseCache(args.target);
    if (args.options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.valid) {
        console.log(`✓ Cache VALID for ${args.target}`);
        console.log(`  Cached at: ${result.cachedAt}`);
        console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
      } else {
        console.log(`✗ Cache INVALID for ${args.target}`);
        console.log(`  Reason: ${result.reason}`);
        if (result.changed && result.changed.length > 0) {
          console.log(`  Changed files: ${result.changed.join(", ")}`);
        }
      }
    }
    process.exit(result.valid ? 0 : 1);
    break;
  }

  case "update": {
    if (!args.target) {
      console.error("Usage: pipeline-cache.js update <phase> <duration-ms> [--json]");
      process.exit(2);
    }
    const duration = parseInt(args.options.duration || process.argv[4], 10) || 0;
    const result = updatePhaseCache(args.target, duration);
    console.log(
      args.options.json ? JSON.stringify(result, null, 2) : `✓ Cache updated for ${args.target}`,
    );
    break;
  }

  case "invalidate": {
    if (!args.target) {
      console.error("Usage: pipeline-cache.js invalidate <phase|all>");
      process.exit(2);
    }
    if (args.target === "all") {
      invalidateAll();
      console.log("✓ All caches invalidated");
    } else {
      const success = invalidatePhase(args.target);
      console.log(
        success ? `✓ Cache invalidated for ${args.target}` : `⚠ No cache found for ${args.target}`,
      );
    }
    break;
  }

  case "clean": {
    const maxAge = args.options.maxAge || 7;
    const cleaned = cleanCache(maxAge);
    console.log(`✓ Cleaned ${cleaned} old cache entries (older than ${maxAge} days)`);
    break;
  }

  case "status": {
    const status = getCacheStatus();
    console.log(args.options.json ? JSON.stringify(status, null, 2) : formatStatus(status));
    break;
  }

  case "hit": {
    const savedTime = parseInt(args.target, 10) || 0;
    recordCacheHit(args.options.phase, savedTime);
    console.log("✓ Cache hit recorded");
    break;
  }

  case "miss": {
    recordCacheMiss();
    console.log("✓ Cache miss recorded");
    break;
  }

  default:
    console.log("Pipeline Cache Manager");
    console.log("");
    console.log("Usage:");
    console.log("  pipeline-cache.js hash <file|dir>     Hash a file or directory");
    console.log("  pipeline-cache.js check <phase>       Check if phase cache is valid");
    console.log("  pipeline-cache.js update <phase> <ms> Update phase cache with duration");
    console.log("  pipeline-cache.js invalidate <phase>  Invalidate a phase cache");
    console.log("  pipeline-cache.js clean [--max-age N] Clean old cache entries");
    console.log("  pipeline-cache.js status              Show cache status");
    console.log("");
    console.log("Options:");
    console.log("  --json        Output as JSON");
    console.log("  --output <f>  Write result to file");
    console.log("  --max-age <N> Max age in days for clean command (default: 7)");
    process.exit(args.command ? 2 : 0);
}
