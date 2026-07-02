/**
 * cross-browser-baseline.js — Cross-browser screenshot baselines (RFC 0002).
 *
 * Captures firefox/webkit (and chromium) baselines, verifies per-baseline
 * provenance against the committed manifest, and pixel-diffs current
 * screenshots against baselines via visual-diff.js at the cross-engine
 * threshold. Storage is pluggable (visualBaselines.backend).
 *
 * Usage (prefer the ./scripts/cross-browser-baseline.sh wrapper):
 *   node scripts/cross-browser-baseline.js capture [url] [--local] [--engines a,b] [--json]
 *   node scripts/cross-browser-baseline.js compare [url] [--current-dir <dir>] [--blocking] [--json]
 *   node scripts/cross-browser-baseline.js verify  [--json]
 *
 * Config: pipeline.config.json → visualBaselines (override path via CBB_CONFIG).
 *
 * Exit codes:
 *   0 — pass, or failures while blocking=false (Phase A non-blocking), or skip
 *   1 — failures with blocking enabled, or provenance violations (verify)
 *   2 — usage/environment error
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "fs";
import { execFileSync, spawnSync } from "child_process";
import { createRequire } from "module";
import { join, dirname, resolve, isAbsolute } from "path";
import { fileURLToPath } from "url";

import {
  listBaselines,
  parseBaselineRelPath,
  recordBaselines,
  verifyBaselines,
  currentGitSha,
  slugForRoute,
} from "./lib/baseline-manifest.js";
import { resolveBackend, BackendError } from "./lib/baseline-backends.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const VISUAL_DIFF = join(__dirname, "visual-diff.js");

const CROSS_ENGINES = new Set(["firefox", "webkit"]);

class UsageError extends Error {}

// --- Config ------------------------------------------------------------------

const DEFAULTS = {
  enabled: true,
  backend: "commit",
  storage: "git",
  baselineDir: ".claude/visual-qa/baselines",
  screenshotDir: ".claude/visual-qa/screenshots/cross-browser",
  diffDir: ".claude/visual-qa/diffs/cross-browser",
  browsers: ["chromium", "firefox", "webkit"],
  routes: ["/"],
  breakpoints: { mobile: 375, desktop: 1440 },
  threshold: 0.03,
  blocking: false,
  reportFile: "cross-browser-report.md",
  capture: {
    mode: "container",
    image: "mcr.microsoft.com/playwright:v1.61.1-noble",
    waitAfterLoadMs: 1500,
    fullPage: true,
  },
  provenance: {
    manifest: ".claude/visual-qa/baselines/manifest.json",
    policy: "warn",
  },
  ciArtifact: { compareAgainst: "last-green-main", retentionDays: 30 },
  service: { provider: "chromatic", projectTokenEnv: "CHROMATIC_PROJECT_TOKEN" },
};

function loadCbbConfig() {
  const configPath = process.env.CBB_CONFIG ?? join(repoRoot, ".claude", "pipeline.config.json");
  let vb = {};
  try {
    vb = JSON.parse(readFileSync(configPath, "utf-8")).visualBaselines ?? {};
  } catch {
    // missing/invalid config → defaults
  }
  return {
    ...DEFAULTS,
    ...vb,
    capture: { ...DEFAULTS.capture, ...vb.capture },
    provenance: { ...DEFAULTS.provenance, ...vb.provenance },
    ciArtifact: { ...DEFAULTS.ciArtifact, ...vb.ciArtifact },
    service: { ...DEFAULTS.service, ...vb.service },
  };
}

function resolvePath(p) {
  return isAbsolute(p) ? p : resolve(repoRoot, p);
}

function resolveReportPath(reportFile) {
  if (isAbsolute(reportFile) || reportFile.includes("/") || reportFile.includes("\\")) {
    return resolvePath(reportFile);
  }
  return join(repoRoot, ".claude", "visual-qa", reportFile);
}

// --- Environment -------------------------------------------------------------

function inContainer() {
  return process.env.CBB_IN_CONTAINER === "1" || existsSync("/.dockerenv");
}

function detectHost() {
  return inContainer() ? "container" : "local";
}

/**
 * Playwright is not an Aurelius dependency — it belongs to the downstream app
 * (or the container's scratch install). Resolve it from the most local
 * package first.
 */
function resolvePlaywright() {
  const candidates = [process.env.CBB_PLAYWRIGHT_DIR, process.cwd(), __dirname].filter(Boolean);
  for (const dir of candidates) {
    try {
      const req = createRequire(join(dir, "package.json"));
      const version = req("@playwright/test/package.json").version;
      return { requireFrom: dir, version, req };
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Version embedded in an mcr.microsoft.com/playwright:vX.Y.Z-distro tag. */
export function imageTagVersion(image) {
  const m = /:v(\d+\.\d+\.\d+)/.exec(image ?? "");
  return m ? m[1] : null;
}

/**
 * storage ↔ .gitattributes drift (RFC 0002 §6.1): warn when storage=lfs but
 * no LFS filter covers the baseline dir, or storage=git while one does.
 */
function lfsAttributesDrift(cfg) {
  let attributes = "";
  try {
    attributes = readFileSync(join(repoRoot, ".gitattributes"), "utf-8");
  } catch {
    // no .gitattributes — only a problem when storage=lfs
  }
  const covered = attributes
    .split("\n")
    .some((line) => line.includes(cfg.baselineDir) && line.includes("filter=lfs"));
  if (cfg.storage === "lfs" && !covered) {
    return (
      "storage is \"lfs\" but .gitattributes has no LFS filter for the baseline dir — " +
      "run ./scripts/setup-baseline-lfs.sh"
    );
  }
  if (cfg.storage === "git" && covered) {
    return (
      "storage is \"git\" but .gitattributes routes baselines through LFS — " +
      "set visualBaselines.storage to \"lfs\" or remove the filter"
    );
  }
  return null;
}

// --- Output ------------------------------------------------------------------

function makeLogger(json) {
  // With --json, stdout carries only the JSON document.
  return (line) => (json ? process.stderr : process.stdout).write(`${line}\n`);
}

function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

// --- Capture -----------------------------------------------------------------

async function captureTree({ url, outDir, engines, routes, breakpoints, waitMs, fullPage, log }) {
  const pw = resolvePlaywright();
  if (!pw) {
    throw new UsageError(
      "@playwright/test is not resolvable from this project. Install it with: " +
        "pnpm add -D @playwright/test && npx playwright install",
    );
  }
  const playwright = pw.req("@playwright/test");
  const failures = [];
  for (const engine of engines) {
    const launcher = playwright[engine];
    if (!launcher) {
      failures.push(`${engine}: unknown engine`);
      continue;
    }
    log(`--- ${engine} ---`);
    const browser = await launcher.launch();
    try {
      for (const route of routes) {
        const routeSlug = slugForRoute(route);
        for (const [bpName, width] of Object.entries(breakpoints)) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          try {
            await page.goto(`${url}${route}`, { waitUntil: "networkidle", timeout: 30000 });
            await page.waitForTimeout(waitMs);
            const dir = join(outDir, engine, routeSlug);
            mkdirSync(dir, { recursive: true });
            await page.screenshot({ path: join(dir, `${bpName}_${width}px.png`), fullPage });
            log(`  ✓ ${engine}/${routeSlug}/${bpName}_${width}px.png`);
          } catch (err) {
            failures.push(`${engine}/${routeSlug}/${bpName}: ${err.message}`);
            log(`  ✗ ${engine}/${routeSlug}/${bpName}: ${err.message}`);
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  return { failures, playwrightVersion: pw.version };
}

/**
 * Build the docker invocation that reruns this CLI's capture inside the
 * pinned Playwright image (RFC 0002 §5/§6.3). The image ships browsers at
 * /ms-playwright but not the npm package, so @playwright/test (at the
 * version embedded in the image tag) is installed into a scratch dir that
 * resolvePlaywright() picks up via CBB_PLAYWRIGHT_DIR. The repo is mounted
 * at /work; localhost URLs are rewritten so the container can reach the
 * host's dev server.
 */
function buildDockerCaptureCommand({ cfg, url, engines }) {
  const image = cfg.capture.image;
  const playwrightVersion = imageTagVersion(image);
  if (!playwrightVersion) {
    throw new UsageError(
      `cannot derive a Playwright version from visualBaselines.capture.image "${image}" — ` +
        "pin a tag like mcr.microsoft.com/playwright:v1.61.1-noble",
    );
  }
  const rewrittenUrl = url.replace(
    /^(https?:\/\/)(localhost|127\.0\.0\.1)/,
    "$1host.docker.internal",
  );
  const inner = [
    "mkdir -p /tmp/cbb",
    "cd /tmp/cbb",
    "npm init -y >/dev/null 2>&1",
    `npm i --no-fund --no-audit @playwright/test@${playwrightVersion} >/dev/null 2>&1`,
    "cd /work",
    `node scripts/cross-browser-baseline.js capture ${rewrittenUrl} --host container --no-manifest` +
      (engines ? ` --engines ${engines.join(",")}` : ""),
  ].join(" && ");
  const docker = [
    "docker",
    "run",
    "--rm",
    "-v",
    `${repoRoot}:/work`,
    "-w",
    "/work",
    "--add-host=host.docker.internal:host-gateway",
    "-e",
    "CBB_IN_CONTAINER=1",
    "-e",
    "CBB_PLAYWRIGHT_DIR=/tmp/cbb",
    image,
    "bash",
    "-lc",
    inner,
  ];
  return { docker, url: rewrittenUrl, image, playwrightVersion };
}

async function runContainerCapture(args, cfg, log) {
  const url = args.url ?? "http://localhost:3000";
  const command = buildDockerCaptureCommand({ cfg, url, engines: args.engines });

  if (args.dryRun) {
    if (args.json) emitJson({ dryRun: true, ...command });
    else {
      log("Would run:");
      log(`  ${command.docker.join(" ")}`);
    }
    return 0;
  }

  try {
    execFileSync("docker", ["--version"], { stdio: "ignore" });
  } catch {
    throw new UsageError(
      "docker is required for container capture (visualBaselines.capture.mode = \"container\") — " +
        "install Docker, or pass --local for an untrusted local capture",
    );
  }

  log(`Running pinned capture in ${command.image} ...`);
  const spawned = spawnSync(command.docker[0], command.docker.slice(1), {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (spawned.status !== 0) {
    throw new UsageError(`container capture failed (exit ${spawned.status ?? "unknown"})`);
  }

  // Provenance is recorded host-side: the container only wrote PNGs onto the
  // mounted volume, while gitSha comes from the host checkout.
  const engines = args.engines ?? cfg.browsers;
  const baselineDir = resolvePath(cfg.baselineDir);
  const manifest = recordBaselines({
    baselineDir,
    manifestPath: resolvePath(cfg.provenance.manifest),
    engines,
    routes: cfg.routes,
    envelope: {
      playwrightVersion: command.playwrightVersion,
      image: command.image,
      host: "container",
      gitSha: currentGitSha(repoRoot),
    },
  });

  const backend = resolveBackend(cfg);
  if (args.json) {
    emitJson({
      captured: Object.keys(manifest.baselines).length,
      host: "container",
      image: command.image,
      playwrightVersion: command.playwrightVersion,
      backend: backend.name,
    });
  } else {
    log("");
    log(`Baselines captured to ${baselineDir} (host=container, ${command.image})`);
    log("To persist them:");
    for (const line of backend.storeInstructions({
      baselineDir: cfg.baselineDir,
      manifestPath: cfg.provenance.manifest,
    })) {
      log(`  ${line}`);
    }
  }
  return 0;
}

async function cmdCapture(args, cfg) {
  const log = makeLogger(args.json);
  if (!cfg.enabled) {
    if (args.json) emitJson({ skipped: true, reason: "visualBaselines disabled in config" });
    else log("⊘ visualBaselines disabled in config — skipping capture");
    return 0;
  }
  const engines = args.engines ?? cfg.browsers;
  const url = args.url ?? "http://localhost:3000";
  const mode = args.local ? "local" : cfg.capture.mode;

  const drift = lfsAttributesDrift(cfg);
  if (drift) log(`⚠ ${drift}`);

  if (mode === "container" && !inContainer()) {
    return runContainerCapture(args, cfg, log);
  }

  const host = args.host ?? detectHost();
  const baselineDir = resolvePath(cfg.baselineDir);
  const localCrossEngines = engines.filter((e) => CROSS_ENGINES.has(e));
  if (host === "local" && localCrossEngines.length) {
    log(
      `⚠ capturing ${localCrossEngines.join("/")} outside the pinned container — ` +
        "baselines will be recorded with host=local and flagged as foreign by provenance",
    );
  }

  const { failures, playwrightVersion } = await captureTree({
    url,
    outDir: baselineDir,
    engines,
    routes: cfg.routes,
    breakpoints: cfg.breakpoints,
    waitMs: cfg.capture.waitAfterLoadMs,
    fullPage: cfg.capture.fullPage,
    log,
  });

  const pinned = imageTagVersion(cfg.capture.image);
  if (pinned && playwrightVersion && pinned !== playwrightVersion) {
    log(
      `⚠ pinned image version v${pinned} differs from resolved @playwright/test ` +
        `${playwrightVersion} — update visualBaselines.capture.image or the installed Playwright`,
    );
  }

  let manifest = null;
  if (!args.noManifest) {
    manifest = recordBaselines({
      baselineDir,
      manifestPath: resolvePath(cfg.provenance.manifest),
      engines,
      routes: cfg.routes,
      envelope: {
        playwrightVersion,
        image: cfg.capture.image,
        host,
        gitSha: currentGitSha(repoRoot),
      },
    });
  }

  const backend = resolveBackend(cfg);
  const instructions = backend.storeInstructions({
    baselineDir: cfg.baselineDir,
    manifestPath: cfg.provenance.manifest,
  });

  if (args.json) {
    emitJson({
      captured: manifest ? Object.keys(manifest.baselines).length : null,
      failures,
      host,
      playwrightVersion,
      backend: backend.name,
    });
  } else {
    log("");
    log(`Baselines captured to ${baselineDir} (host=${host})`);
    log("To persist them:");
    for (const line of instructions) log(`  ${line}`);
  }
  return failures.length ? 1 : 0;
}

// --- Compare -----------------------------------------------------------------

function runVisualDiff(current, baseline, diffOut, threshold) {
  mkdirSync(dirname(diffOut), { recursive: true });
  let stdout;
  try {
    stdout = execFileSync(
      "node",
      [VISUAL_DIFF, current, baseline, "--output", diffOut, "--threshold", String(threshold), "--json"],
      { encoding: "utf-8", timeout: 60000 },
    );
  } catch (err) {
    stdout = err.stdout ?? "";
  }
  try {
    const parsed = JSON.parse(stdout);
    return {
      status: (parsed.status ?? "UNKNOWN").toUpperCase(),
      mismatchPct: parsed.mismatchPct ?? null,
    };
  } catch {
    return { status: "WARN", mismatchPct: null };
  }
}

function writeCompareReport(reportPath, payload) {
  const lines = [
    "# Cross-Browser Baseline Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Backend:** ${payload.backend}`,
    `**Threshold:** ${payload.threshold} (${payload.threshold * 100}%)`,
    `**Blocking:** ${payload.blocking}`,
    `**Advisory:** ${payload.advisory ? "yes — capture envelope does not match the manifest (results are informational)" : "no"}`,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "|--------|-------|",
    `| Pass | ${payload.pass} |`,
    `| Fail | ${payload.fail} |`,
    `| Warn | ${payload.warn} |`,
    `| Skip | ${payload.skip} |`,
    `| Provenance failures | ${payload.provenanceFailures} |`,
    `| Provenance violations | ${payload.provenance.violations} |`,
    "",
    "## Results",
    "",
    "| Baseline | Engine | Status | Mismatch | Provenance |",
    "|----------|--------|--------|----------|------------|",
    ...payload.results.map(
      (r) =>
        `| ${r.path} | ${r.engine ?? "?"} | ${r.status} | ${r.mismatchPct ?? "-"}${r.mismatchPct != null ? "%" : ""} | ${r.provenance} |`,
    ),
    "",
  ];
  if (payload.provenance.drift.version || payload.provenance.drift.image) {
    lines.push("## Provenance drift", "");
    if (payload.provenance.drift.version) {
      lines.push("- Manifest Playwright version differs from the current envelope.");
    }
    if (payload.provenance.drift.image) {
      lines.push("- Manifest container image differs from visualBaselines.capture.image.");
    }
    lines.push("");
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

async function cmdCompare(args, cfg) {
  const log = makeLogger(args.json);
  if (!cfg.enabled) {
    if (args.json) emitJson({ skipped: true, reason: "visualBaselines disabled in config" });
    else log("⊘ visualBaselines disabled in config — skipping compare");
    return 0;
  }

  const drift = lfsAttributesDrift(cfg);
  if (drift) log(`⚠ ${drift}`);

  const backend = resolveBackend(cfg);
  const engines = args.engines ?? cfg.browsers;
  const { baselineRoot } = await backend.fetch({ baselineDir: resolvePath(cfg.baselineDir) });
  const manifestPath = resolvePath(cfg.provenance.manifest);

  const rels = listBaselines(baselineRoot, engines);
  if (!rels.length) {
    const reason =
      "no baselines found — run ./scripts/cross-browser-baseline.sh capture <url> " +
      "(inside the pinned container) and commit the result";
    if (args.json) emitJson({ skipped: true, reason, backend: backend.name });
    else log(`⊘ ${reason}`);
    return 0;
  }

  const host = args.host ?? detectHost();
  const playwrightVersion = resolvePlaywright()?.version ?? null;
  const provenance = verifyBaselines({
    baselineDir: baselineRoot,
    manifestPath,
    engines,
    envelope: { playwrightVersion, host },
    image: cfg.capture.image,
  });

  let currentRoot = args.currentDir ? resolve(args.currentDir) : null;
  if (!currentRoot) {
    currentRoot = resolvePath(cfg.screenshotDir);
    rmSync(currentRoot, { recursive: true, force: true });
    log("--- Capturing current screenshots ---");
    const { failures } = await captureTree({
      url: args.url ?? "http://localhost:3000",
      outDir: currentRoot,
      engines,
      routes: cfg.routes,
      breakpoints: cfg.breakpoints,
      waitMs: cfg.capture.waitAfterLoadMs,
      fullPage: cfg.capture.fullPage,
      log,
    });
    if (failures.length) log(`⚠ ${failures.length} capture failure(s) — affected baselines will be skipped`);
  }

  const diffRoot = resolvePath(cfg.diffDir);
  rmSync(diffRoot, { recursive: true, force: true });

  const enforce = cfg.provenance.policy === "enforce";
  const results = [];
  for (const rel of rels) {
    const engine = parseBaselineRelPath(rel)?.engine ?? null;
    const provStatus = provenance.statuses[rel] ?? "untracked";
    if (enforce && provStatus !== "ok") {
      log(`PROVENANCE: ${rel} (${provStatus}) — excluded from diff`);
      results.push({ path: rel, engine, status: "PROVENANCE", mismatchPct: null, provenance: provStatus });
      continue;
    }
    const currentFile = join(currentRoot, ...rel.split("/"));
    if (!existsSync(currentFile)) {
      log(`SKIP: ${rel} (no current screenshot)`);
      results.push({ path: rel, engine, status: "SKIP", mismatchPct: null, provenance: provStatus });
      continue;
    }
    const { status, mismatchPct } = runVisualDiff(
      currentFile,
      join(baselineRoot, ...rel.split("/")),
      join(diffRoot, ...rel.split("/")),
      cfg.threshold,
    );
    log(`${status}: ${rel}${mismatchPct != null ? ` (${mismatchPct}%)` : ""}${provStatus !== "ok" ? ` [provenance: ${provStatus}]` : ""}`);
    results.push({ path: rel, engine, status, mismatchPct, provenance: provStatus });
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  const payload = {
    backend: backend.name,
    engines,
    threshold: cfg.threshold,
    blocking: Boolean(args.blocking || cfg.blocking),
    advisory: !provenance.envelopeMatch,
    pass: count("PASS"),
    fail: count("FAIL"),
    warn: count("WARN") + count("UNKNOWN"),
    skip: count("SKIP"),
    provenanceFailures: count("PROVENANCE"),
    provenance: {
      manifestFound: provenance.manifestFound,
      violations: provenance.violations,
      counts: provenance.counts,
      drift: provenance.drift,
      envelopeMatch: provenance.envelopeMatch,
    },
    results,
  };
  payload.wouldBlock = payload.fail + payload.provenanceFailures > 0;

  const reportPath = resolveReportPath(cfg.reportFile);
  writeCompareReport(reportPath, payload);
  payload.reportPath = reportPath;

  log("");
  log(
    `Pass: ${payload.pass} | Fail: ${payload.fail} | Warn: ${payload.warn} | ` +
      `Skip: ${payload.skip} | Provenance: ${payload.provenanceFailures}`,
  );
  if (payload.advisory) {
    log("⚠ advisory: current capture envelope does not match the baseline manifest (local run?)");
  }
  if (args.json) emitJson(payload);

  return payload.wouldBlock && payload.blocking ? 1 : 0;
}

// --- Verify ------------------------------------------------------------------

function cmdVerify(args, cfg) {
  const log = makeLogger(args.json);
  if (!cfg.enabled) {
    if (args.json) emitJson({ skipped: true, reason: "visualBaselines disabled in config" });
    else log("⊘ visualBaselines disabled in config — skipping verify");
    return 0;
  }
  const engines = args.engines ?? cfg.browsers;
  const result = verifyBaselines({
    baselineDir: resolvePath(cfg.baselineDir),
    manifestPath: resolvePath(cfg.provenance.manifest),
    engines,
    envelope: {
      playwrightVersion: resolvePlaywright()?.version ?? null,
      host: args.host ?? detectHost(),
    },
    image: cfg.capture.image,
  });
  if (args.json) {
    emitJson(result);
  } else {
    log(`Provenance: ${result.total} baseline(s) checked, ${result.violations} violation(s)`);
    for (const [rel, status] of Object.entries(result.statuses)) {
      if (status !== "ok") log(`  ${status}: ${rel}`);
    }
    if (!result.manifestFound && result.total > 0) {
      log("  no manifest — run ./scripts/cross-browser-baseline.sh capture to establish provenance");
    }
  }
  return result.violations > 0 ? 1 : 0;
}

// --- CLI ---------------------------------------------------------------------

function printHelp(stream = process.stdout) {
  stream.write(`Usage: node scripts/cross-browser-baseline.js <capture|compare|verify> [options]

Cross-browser screenshot baselines (RFC 0002). Config: pipeline.config.json →
visualBaselines (override file via CBB_CONFIG).

Subcommands:
  capture [url]   Capture baselines for the configured engines and record
                  provenance (default url: http://localhost:3000)
  compare [url]   Capture current screenshots (or use --current-dir) and diff
                  them against stored baselines at the cross-engine threshold
  verify          Check baseline provenance only (no server required)

Options:
  --engines <a,b>       Restrict to specific engines
  --json                Machine-readable output on stdout
  --local               capture: force local capture (recorded host=local, untrusted for firefox/webkit)
  --dry-run             capture: print the docker command for container mode without running it
  --current-dir <dir>   compare: use existing screenshots instead of capturing
  --blocking            compare: exit 1 on failures regardless of config
  --host <h>            Override detected capture host (container|local)
  --no-manifest         capture: skip provenance recording (internal)
  -h, --help            Show this message
`);
}

function parseArgs(argv) {
  const args = { json: false, local: false, blocking: false, noManifest: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--local") args.local = true;
    else if (a === "--blocking") args.blocking = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-manifest") args.noManifest = true;
    else if (a === "--engines") args.engines = argv[++i]?.split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--current-dir") args.currentDir = argv[++i];
    else if (a === "--host") args.host = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else if (a.startsWith("--")) throw new UsageError(`Unknown option: ${a}`);
    else positional.push(a);
  }
  args.command = positional[0];
  args.url = positional[1];
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    printHelp(process.stderr);
    process.exit(2);
  }
  if (args.help || (!args.command && process.argv.slice(2).includes("--help"))) {
    printHelp();
    process.exit(0);
  }
  if (!args.command || !["capture", "compare", "verify"].includes(args.command)) {
    process.stderr.write(`Usage error: expected a subcommand (capture | compare | verify)\n`);
    printHelp(process.stderr);
    process.exit(2);
  }

  const cfg = loadCbbConfig();
  try {
    if (args.command === "capture") process.exit(await cmdCapture(args, cfg));
    if (args.command === "compare") process.exit(await cmdCompare(args, cfg));
    process.exit(cmdVerify(args, cfg));
  } catch (err) {
    if (err instanceof UsageError || err instanceof BackendError) {
      process.stderr.write(`✗ ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`✗ Unhandled error: ${err.stack ?? err.message}\n`);
    process.exit(2);
  }
}

const invokedDirect = process.argv[1] && resolve(process.argv[1]) === __filename;
if (invokedDirect) {
  main();
}
