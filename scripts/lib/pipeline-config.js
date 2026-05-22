#!/usr/bin/env node
/**
 * pipeline-config.js — Read values from .claude/pipeline.config.json
 *
 * Used by shell scripts that previously inlined `node -e` blobs to fetch
 * config keys. Designed to be safe to call from any cwd: the config file is
 * resolved relative to the repo root (the parent of scripts/).
 *
 * Library use (ESM):
 *
 *   import { getValue, loadConfig } from "./lib/pipeline-config.js";
 *   const level = getValue("security.auditLevel", "moderate");
 *
 * CLI use (from common.sh `common_config_get`):
 *
 *   node scripts/lib/pipeline-config.js get <dotted.path> [default]
 *
 * Exit code is always 0 — the default value is printed if anything fails so
 * callers can rely on `VALUE=$(...)` without `set -e` blowing up.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Repo root = scripts/lib/.. /.. */
const REPO_ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = join(REPO_ROOT, ".claude", "pipeline.config.json");

let cachedConfig = null;
let cachedMtimeMs = null;

/**
 * Load pipeline.config.json. Returns {} when the file is missing or invalid
 * so callers can rely on optional-chaining without crashing.
 */
export function loadConfig(configPath = CONFIG_PATH) {
  if (!existsSync(configPath)) return {};
  try {
    // Cheap mtime-based cache for repeated calls in the same process.
    let mtime;
    try {
      mtime = statSync(configPath).mtimeMs;
    } catch {
      mtime = null;
    }
    if (cachedConfig && cachedMtimeMs === mtime) return cachedConfig;

    const raw = readFileSync(configPath, "utf8");
    cachedConfig = JSON.parse(raw);
    cachedMtimeMs = mtime;
    return cachedConfig;
  } catch {
    return {};
  }
}

/**
 * Look up a dotted path in the config. Missing keys → defaultValue.
 *
 * Boolean defaults are honored exactly — passing `false` returns `false` when
 * the key is absent, which matches the legacy `!== false ? 'true' : 'false'`
 * pattern that scripts used inline.
 */
export function getValue(dottedPath, defaultValue = undefined) {
  const config = loadConfig();
  const parts = String(dottedPath).split(".").filter(Boolean);
  let cur = config;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object" || !(p in cur)) {
      return defaultValue;
    }
    cur = cur[p];
  }
  return cur === undefined ? defaultValue : cur;
}

/**
 * Render a value for shell consumption. Booleans become "true"/"false"
 * literals (matches existing scripts), nullish becomes the default, objects
 * are JSON-stringified.
 */
function renderForShell(value, fallback) {
  if (value === undefined || value === null) return fallback ?? "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function main(argv) {
  const [cmd, key, fallback] = argv;
  if (cmd !== "get" || !key) {
    process.stderr.write("Usage: pipeline-config.js get <dotted.path> [default]\n");
    // Print whatever fallback was given so set -e callers don't break.
    process.stdout.write(`${fallback ?? ""}\n`);
    return;
  }
  const v = getValue(key, fallback);
  process.stdout.write(`${renderForShell(v, fallback)}\n`);
}

// Run as CLI when invoked directly.
const invokedDirect = process.argv[1] && resolve(process.argv[1]) === __filename;
if (invokedDirect) {
  main(process.argv.slice(2));
}

export default { loadConfig, getValue };
