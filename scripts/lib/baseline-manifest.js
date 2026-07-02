/**
 * baseline-manifest.js — RFC 0002 provenance manifest for cross-browser
 * screenshot baselines.
 *
 * The manifest (default .claude/visual-qa/baselines/manifest.json, committed
 * alongside the PNGs) records the capture envelope per baseline: sha256,
 * engine, route, breakpoint, capture host (container|local), gitSha, plus the
 * top-level Playwright version and pinned container image. The comparator
 * verifies this before trusting a baseline, so stale or foreign baselines are
 * flagged instead of surfacing as false pixel diffs.
 *
 * Library use (ESM):
 *
 *   import { recordBaselines, verifyBaselines } from "./lib/baseline-manifest.js";
 *
 * CLI use:
 *
 *   node scripts/lib/baseline-manifest.js record [--engines a,b] [--host container]
 *   node scripts/lib/baseline-manifest.js sync   [--engines a,b] [--host local]
 *   node scripts/lib/baseline-manifest.js verify [--json]
 *
 * Defaults come from pipeline.config.json → visualBaselines. Exit codes:
 * 0 ok, 1 provenance violations (verify), 2 usage/IO error.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from "fs";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { join, dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { getValue } from "./pipeline-config.js";

const __filename = fileURLToPath(import.meta.url);

/** Engines whose baselines are only trustworthy from containerized capture. */
const CROSS_ENGINES = new Set(["firefox", "webkit"]);

export function toPosix(p) {
  return String(p).replace(/\\/g, "/");
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Parse `<engine>/<routeSlug>/<breakpoint>_<width>px.png`. Breakpoint names
 * may themselves contain underscores; the width is the final `_<digits>px`.
 * Returns null for anything that is not a baseline PNG (e.g. manifest.json).
 */
export function parseBaselineRelPath(relPath) {
  const m = toPosix(relPath).match(/^([^/]+)\/([^/]+)\/(.+)_(\d+)px\.png$/);
  if (!m) return null;
  return { engine: m[1], routeSlug: m[2], breakpoint: m[3], width: Number(m[4]) };
}

/** Route → directory slug, mirroring the capture scripts ('/' → 'home'). */
export function slugForRoute(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
}

function routesBySlug(routes = []) {
  const map = {};
  for (const route of routes) map[slugForRoute(route)] = route;
  return map;
}

export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

function writeManifest(manifestPath, manifest) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function sortedByKey(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/** All baseline PNGs for one engine, as posix paths relative to baselineDir. */
function scanEngine(baselineDir, engine) {
  const results = [];
  const engineRoot = join(baselineDir, engine);
  if (!existsSync(engineRoot)) return results;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".png")) {
        results.push(toPosix(relative(baselineDir, full)));
      }
    }
  };
  walk(engineRoot);
  return results.sort();
}

/** All baseline PNGs for the given engines, posix-relative to baselineDir. */
export function listBaselines(baselineDir, engines) {
  const results = [];
  for (const engine of engines) results.push(...scanEngine(baselineDir, engine));
  return results;
}

function buildEntry(baselineDir, relPath, { host, gitSha }, slugMap) {
  const parsed = parseBaselineRelPath(relPath);
  return {
    sha256: sha256File(join(baselineDir, relPath)),
    capturedAt: new Date().toISOString(),
    gitSha: gitSha ?? null,
    engine: parsed?.engine ?? null,
    route: parsed ? (slugMap[parsed.routeSlug] ?? null) : null,
    breakpoint: parsed?.breakpoint ?? null,
    host: host ?? "local",
  };
}

/** Drop manifest entries belonging to the given engines. */
function withoutEngines(baselines, engines) {
  const next = {};
  for (const [key, entry] of Object.entries(baselines)) {
    const parsed = parseBaselineRelPath(key);
    if (parsed && engines.includes(parsed.engine)) continue;
    next[key] = entry;
  }
  return next;
}

/**
 * Record provenance for the given engines from a fresh capture: entries for
 * those engines are rebuilt from disk (stale ones dropped), other engines'
 * entries are preserved, and the top-level envelope is updated.
 */
export function recordBaselines({ baselineDir, manifestPath, engines, envelope, routes = [] }) {
  const existing = loadManifest(manifestPath) ?? {};
  const slugMap = routesBySlug(routes);
  const baselines = withoutEngines(existing.baselines ?? {}, engines);
  for (const engine of engines) {
    for (const rel of scanEngine(baselineDir, engine)) {
      baselines[rel] = buildEntry(baselineDir, rel, envelope, slugMap);
    }
  }
  const manifest = {
    playwrightVersion: envelope.playwrightVersion ?? existing.playwrightVersion ?? null,
    image: envelope.image ?? existing.image ?? null,
    baselines: sortedByKey(baselines),
  };
  writeManifest(manifestPath, manifest);
  return manifest;
}

/**
 * Refresh entries for engines whose baselines were rewritten by a sibling
 * writer (capture-baselines.sh, regression-test.sh --update-baselines).
 * Unchanged files keep their original entry; the top-level envelope is never
 * touched. No-op (returns null) when no manifest exists yet — provenance is
 * opt-in until the first cross-browser capture records one.
 */
export function syncManifest({ baselineDir, manifestPath, engines, host, gitSha, routes = [] }) {
  const manifest = loadManifest(manifestPath);
  if (!manifest) return null;
  const slugMap = routesBySlug(routes);
  const previous = manifest.baselines ?? {};
  const baselines = withoutEngines(previous, engines);
  for (const engine of engines) {
    for (const rel of scanEngine(baselineDir, engine)) {
      const old = previous[rel];
      baselines[rel] =
        old && old.sha256 === sha256File(join(baselineDir, rel))
          ? old
          : buildEntry(baselineDir, rel, { host, gitSha }, slugMap);
    }
  }
  const next = { ...manifest, baselines: sortedByKey(baselines) };
  writeManifest(manifestPath, next);
  return next;
}

/**
 * Verify baselines on disk against the manifest and the current capture
 * envelope. Per-baseline statuses:
 *   ok | untracked | modified | missing-file | foreign-host
 * Manifest-level drift (version/image) and envelope match are reported
 * separately: a local current envelope makes results advisory
 * (envelopeMatch: false) without flagging individual baselines.
 */
export function verifyBaselines({ baselineDir, manifestPath, engines, envelope = {}, image }) {
  const manifest = loadManifest(manifestPath);
  const entries = manifest?.baselines ?? {};
  const statuses = {};

  const onDisk = [];
  for (const engine of engines) onDisk.push(...scanEngine(baselineDir, engine));

  for (const rel of onDisk) {
    const entry = entries[rel];
    if (!entry) {
      statuses[rel] = "untracked";
      continue;
    }
    if (sha256File(join(baselineDir, rel)) !== entry.sha256) {
      statuses[rel] = "modified";
      continue;
    }
    const parsed = parseBaselineRelPath(rel);
    if (entry.host !== "container" && parsed && CROSS_ENGINES.has(parsed.engine)) {
      statuses[rel] = "foreign-host";
      continue;
    }
    statuses[rel] = "ok";
  }

  const onDiskSet = new Set(onDisk);
  for (const rel of Object.keys(entries)) {
    const parsed = parseBaselineRelPath(rel);
    if (!parsed || !engines.includes(parsed.engine)) continue;
    if (!onDiskSet.has(rel)) statuses[rel] = "missing-file";
  }

  const drift = {
    version: Boolean(
      manifest &&
        envelope.playwrightVersion &&
        manifest.playwrightVersion &&
        envelope.playwrightVersion !== manifest.playwrightVersion,
    ),
    image: Boolean(manifest && image && manifest.image && image !== manifest.image),
  };

  const counts = { ok: 0, untracked: 0, modified: 0, missingFile: 0, foreignHost: 0 };
  const countKey = {
    ok: "ok",
    untracked: "untracked",
    modified: "modified",
    "missing-file": "missingFile",
    "foreign-host": "foreignHost",
  };
  for (const status of Object.values(statuses)) counts[countKey[status]]++;

  const violations =
    counts.untracked +
    counts.modified +
    counts.missingFile +
    counts.foreignHost +
    (drift.version ? 1 : 0) +
    (drift.image ? 1 : 0);

  const envelopeMatch = Boolean(
    manifest &&
      envelope.host === "container" &&
      (!envelope.playwrightVersion ||
        !manifest.playwrightVersion ||
        envelope.playwrightVersion === manifest.playwrightVersion),
  );

  return {
    manifestFound: Boolean(manifest),
    statuses,
    counts,
    drift,
    envelopeMatch,
    violations,
    total: Object.keys(statuses).length,
  };
}

/** Short git sha of HEAD, or null outside a repository. */
export function currentGitSha(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// --- CLI -------------------------------------------------------------------

function printHelp() {
  console.log(`Usage: node scripts/lib/baseline-manifest.js <record|sync|verify> [options]

Options (defaults from pipeline.config.json → visualBaselines):
  --baseline-dir <dir>          Baseline root
  --manifest <path>             Manifest path
  --engines <a,b>               Engines to operate on
  --routes <a,b>                Routes for slug→route mapping
  --host <container|local>      Capture host recorded/asserted
  --playwright-version <x.y.z>  Current Playwright version (record/verify)
  --image <ref>                 Pinned container image (record/verify)
  --git-sha <sha>               Override git sha (default: HEAD)
  --json                        Machine-readable output`);
}

function parseCliArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--baseline-dir") opts.baselineDir = resolve(argv[++i]);
    else if (a === "--manifest") opts.manifestPath = resolve(argv[++i]);
    else if (a === "--engines") opts.engines = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--routes") opts.routes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--host") opts.host = argv[++i];
    else if (a === "--playwright-version") opts.playwrightVersion = argv[++i];
    else if (a === "--image") opts.image = argv[++i];
    else if (a === "--git-sha") opts.gitSha = argv[++i];
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return opts;
}

function cliMain(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || !["record", "sync", "verify"].includes(cmd)) {
    printHelp();
    process.exit(cmd === undefined ? 2 : 2);
  }
  const opts = parseCliArgs(rest);
  const baselineDir =
    opts.baselineDir ?? resolve(getValue("visualBaselines.baselineDir", ".claude/visual-qa/baselines"));
  const manifestPath =
    opts.manifestPath ??
    resolve(getValue("visualBaselines.provenance.manifest", ".claude/visual-qa/baselines/manifest.json"));
  const engines = opts.engines ?? getValue("visualBaselines.browsers", ["chromium", "firefox", "webkit"]);
  const routes = opts.routes ?? getValue("visualBaselines.routes", ["/"]);
  const image = opts.image ?? getValue("visualBaselines.capture.image", null);
  const gitSha = opts.gitSha ?? currentGitSha();

  if (cmd === "record") {
    const manifest = recordBaselines({
      baselineDir,
      manifestPath,
      engines,
      routes,
      envelope: {
        playwrightVersion: opts.playwrightVersion ?? null,
        image,
        host: opts.host ?? "local",
        gitSha,
      },
    });
    if (opts.json) console.log(JSON.stringify(manifest, null, 2));
    else console.log(`Recorded ${Object.keys(manifest.baselines).length} baseline(s) → ${manifestPath}`);
    return;
  }

  if (cmd === "sync") {
    const manifest = syncManifest({
      baselineDir,
      manifestPath,
      engines,
      routes,
      host: opts.host ?? "local",
      gitSha,
    });
    if (opts.json) console.log(JSON.stringify({ synced: Boolean(manifest) }));
    else if (manifest) console.log(`Manifest synced for engines: ${engines.join(", ")}`);
    else console.log("No manifest found — nothing to sync (run a cross-browser capture first).");
    return;
  }

  const result = verifyBaselines({
    baselineDir,
    manifestPath,
    engines,
    image,
    envelope: {
      playwrightVersion: opts.playwrightVersion ?? null,
      host: opts.host ?? "local",
    },
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Provenance: ${result.total} baseline(s) checked, ${result.violations} violation(s)`);
    for (const [rel, status] of Object.entries(result.statuses)) {
      if (status !== "ok") console.log(`  ${status}: ${rel}`);
    }
    if (result.drift.version) console.log("  drift: manifest Playwright version differs from current");
    if (result.drift.image) console.log("  drift: manifest image differs from configured image");
    if (!result.manifestFound && result.total > 0) {
      console.log("  no manifest — run cross-browser-baseline.sh capture to establish provenance");
    }
  }
  process.exit(result.violations > 0 ? 1 : 0);
}

const invokedDirect = process.argv[1] && resolve(process.argv[1]) === __filename;
if (invokedDirect) {
  cliMain(process.argv.slice(2));
}
