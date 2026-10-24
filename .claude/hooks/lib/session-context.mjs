#!/usr/bin/env node
// session-context.mjs — print the short status block the SessionStart hook adds
// to context: a pipeline run in flight (.claude/plans/pipeline-state.json), the
// build spec, the token lockfiles, the visual baselines, and the git branch.
// Every section is optional and every failure is silent; the output is plain
// text.
//
// Usage: node session-context.mjs <project-dir>
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const projectDir = process.argv[2] || process.cwd();

// Outside an Aurelius checkout, stay silent: the plugin's hooks load in every
// repo that enables it, and those repos run no pipeline.
if (!existsSync(join(projectDir, ".claude", "pipeline.config.json"))) process.exit(0);

const out = [];
const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
};
const isDir = (p) => {
  try { return statSync(p).isDirectory(); } catch { return false; }
};
const list = (p) => {
  try { return readdirSync(p); } catch { return []; }
};
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
// Phase keys: "C0", "C1" (/build-from-conversation) come before "0" … "9".
const phaseOrder = (k) => (/^C\d+$/.test(k) ? -100 + Number(k.slice(1)) : parseFloat(k));
const byPhase = (a, b) => phaseOrder(a) - phaseOrder(b);

// --- Pipeline run in flight -------------------------------------------------
const state = readJson(join(projectDir, ".claude", "plans", "pipeline-state.json"));
if (state && state.phase !== "done") {
  const phases = state.phases || {};
  const current = phases[state.phase] || {};
  const next = Object.keys(phases).sort(byPhase).find((k) => !["done", "skipped"].includes(phases[k]?.status));
  const target = [state.renderer, state.appType].filter(Boolean).join(", ");
  out.push(`Pipeline run in flight: /build-from-${state.pipeline || "?"}${target ? ` (${target})` : ""}, phase ${state.phase ?? "?"}${current.name ? ` ${current.name}` : ""}${current.status ? ` [${current.status}]` : ""}, updated ${day(state.updatedAt) || "?"}.`);
  const comps = Object.values(state.components || {});
  if (comps.length) out.push(`  components: ${comps.filter((c) => c?.build === "green").length}/${comps.length} green, ${comps.filter((c) => ["needs-review", "failed"].includes(c?.build)).length} need review`);
  const pages = Object.values(state.pages || {});
  if (pages.length) out.push(`  pages: ${pages.filter((p) => p?.visual === "pass").length}/${pages.length} visually verified`);
  out.push(`  resume: run /build-from-${state.pipeline || "<source>"} again; it reads the state file and continues from phase ${next ?? state.phase}.`);
} else if (state && state.phase === "done") {
  out.push(`Last pipeline run: /build-from-${state.pipeline || "?"} finished ${day(state.updatedAt) || "?"}; report in .claude/visual-qa/build-report.md.`);
}

// --- Build spec ----------------------------------------------------------------
const spec = readJson(join(projectDir, ".claude", "plans", "build-spec.json"));
if (spec) {
  const pages = Array.isArray(spec.pages) ? spec.pages.length : 0;
  const comps = Array.isArray(spec.components) ? spec.components.length : 0;
  const parts = [spec.source, spec.renderer, spec.appType].filter(Boolean).join(", ");
  out.push(`Build spec: .claude/plans/build-spec.json (${parts || "unknown source"}; ${pages} page(s), ${comps} component(s)).`);
}

// --- Token lockfiles: the project root and app folders beside it -----------------
const SKIP = new Set(["node_modules", "packages", "templates", "scripts", "docs", "renderers", "evals"]);
const lockfiles = [];
const findLock = (dir) => {
  for (const rel of ["src/styles/design-tokens.lock.json", "design-tokens.lock.json"]) {
    if (existsSync(join(dir, rel))) { lockfiles.push(join(dir, rel)); return; }
  }
};
findLock(projectDir);
for (const name of list(projectDir)) {
  if (name.startsWith(".") || SKIP.has(name) || !isDir(join(projectDir, name))) continue;
  findLock(join(projectDir, name));
}
for (const file of lockfiles.slice(0, 3)) {
  const lock = readJson(file) || {};
  const from = lock.source || (lock.figmaFileKey ? "figma" : "");
  out.push(`Token lockfile: ${relative(projectDir, file)}${lock.version ? ` v${lock.version}` : ""}${from || lock.generatedAt ? ` (${[from, day(lock.generatedAt)].filter(Boolean).join(", ")})` : ""}. It is binding: no hardcoded colors, sizes or text; the token guard denies a commit that adds them.`);
}

// --- Visual baselines ---------------------------------------------------------------
const baselines = join(projectDir, ".claude", "visual-qa", "baselines");
if (isDir(baselines)) {
  const counts = [];
  for (const engine of list(baselines)) {
    const n = list(join(baselines, engine)).filter((f) => f.endsWith(".png")).length;
    if (n) counts.push(`${engine} ${n}`);
  }
  const loose = list(baselines).filter((f) => f.endsWith(".png")).length;
  if (loose) counts.push(`unsorted ${loose}`);
  if (counts.length) out.push(`Visual baselines: ${counts.join(", ")} (./scripts/regression-test.sh, ./scripts/cross-browser-baseline.sh compare).`);
}

// --- Git -----------------------------------------------------------------------------
try {
  const git = (...args) => execFileSync("git", args, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean).length;
  if (/^(main|master)$/.test(branch)) out.push(`On ${branch}${dirty ? ` with ${dirty} uncommitted file(s)` : ""}: start a feature branch before changing anything.`);
  else if (dirty) out.push(`Branch ${branch}: ${dirty} uncommitted file(s).`);
} catch { /* not a git checkout */ }

out.push("Hooks active: deploy guard (asks before deploys, publishes, releases, merges and pushes to the default branch; denies them in subagents), token guard and bundle-size check on git commit, quality-gate reminders after builds, test runs and visual diffs.");

process.stdout.write(`Aurelius status\n${out.map((l) => (l.startsWith("  ") ? l : `- ${l}`)).join("\n")}\n`);
