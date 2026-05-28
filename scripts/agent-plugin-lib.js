#!/usr/bin/env node
/**
 * agent-plugin-lib.js — shared helpers for the agent-plugin tooling
 * (validate / registry / create / test). Pure, side-effect-free functions
 * over plugin files so each CLI stays thin and testable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import semver from "semver";

/**
 * Parse single-line `key: value` YAML frontmatter from a Markdown string.
 * Also supports YAML block-list values (a key with an empty inline value
 * followed by indented `- item` lines); list items are joined with ", " to
 * match the inline `tools: A, B` convention used across this repo's agents.
 * Multi-line scalar/nested-map values beyond this are not supported.
 */
export function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content, hasFrontmatter: false };
  const frontmatter = {};
  const listAccum = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (km) {
      currentKey = km[1];
      frontmatter[currentKey] = km[2].trim();
      continue;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && currentKey && (frontmatter[currentKey] === "" || currentKey in listAccum)) {
      (listAccum[currentKey] ??= []).push(item[1].trim());
      frontmatter[currentKey] = listAccum[currentKey].join(", ");
    }
  }
  return { frontmatter, body: m[2], hasFrontmatter: true };
}

/** Count `<example>` blocks in an agent description. Null/undefined → 0. */
export function countExamples(description = "") {
  return (String(description ?? "").match(/<example>/g) || []).length;
}

/** Read and parse a plugin's plugin.json. Throws if absent. */
export function loadManifest(pluginDir) {
  const p = join(pluginDir, "plugin.json");
  if (!existsSync(p)) throw new Error(`No plugin.json in ${pluginDir}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

/** Build a catalog { name -> { version, dir, manifest, deps } } from a plugins root.
 *  Entries that are unreadable or have a malformed/nameless plugin.json are skipped
 *  (the validator surfaces those separately), so one bad plugin can't abort the scan. */
export function buildCatalog(pluginsRoot) {
  const catalog = {};
  if (!existsSync(pluginsRoot)) return catalog;
  for (const entry of readdirSync(pluginsRoot)) {
    const dir = join(pluginsRoot, entry);
    let isDir;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (!existsSync(join(dir, "plugin.json"))) continue;
    let manifest;
    try {
      manifest = loadManifest(dir);
    } catch {
      continue;
    }
    if (!manifest || typeof manifest.name !== "string") continue;
    catalog[manifest.name] = {
      version: manifest.version,
      dir,
      manifest,
      deps: manifest.dependencies?.agents ?? {},
    };
  }
  return catalog;
}

/** True if `version` satisfies the semver `range`. */
export function satisfiesRange(version, range) {
  return semver.satisfies(version, range, { includePrerelease: true });
}

/**
 * Resolve the transitive agent-dependency graph rooted at `rootName`.
 * Returns { order, errors, involved }. `order` lists deps before dependents
 * (topological). `errors` collects every problem: missing deps, semver
 * mismatches, and cycles. Errors do not short-circuit — all are reported.
 */
export function resolveDependencies(catalog, rootName) {
  const errors = [];
  const involved = new Set();
  const edges = {}; // name -> [dependency names]

  function visit(name, chain) {
    if (!catalog[name]) {
      const by = chain.length ? ` (required by ${chain.join(" -> ")})` : "";
      errors.push({ code: "missing", message: `"${name}" not found in catalog${by}` });
      return;
    }
    if (involved.has(name)) return;
    involved.add(name);
    edges[name] = [];
    for (const [dep, range] of Object.entries(catalog[name].deps || {})) {
      edges[name].push(dep);
      if (!catalog[dep]) {
        errors.push({
          code: "missing",
          message: `"${dep}" not found (required by ${[...chain, name].join(" -> ")})`,
        });
        continue;
      }
      if (!satisfiesRange(catalog[dep].version, range)) {
        errors.push({
          code: "version",
          message: `"${dep}@${catalog[dep].version}" does not satisfy "${range}" (required by ${name})`,
        });
      }
      visit(dep, [...chain, name]);
    }
  }
  visit(rootName, []);

  // Kahn topological sort over involved nodes (edge n -> d means n depends on d).
  const indeg = {};
  for (const n of involved) indeg[n] = (edges[n] || []).filter((d) => involved.has(d)).length;
  const queue = [...involved].filter((n) => indeg[n] === 0);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of involved) {
      if ((edges[m] || []).includes(n)) {
        indeg[m]--;
        if (indeg[m] === 0) queue.push(m);
      }
    }
  }
  if (order.length !== involved.size) {
    const cyclic = [...involved].filter((n) => !order.includes(n));
    errors.push({ code: "cycle", message: `dependency cycle involving: ${cyclic.join(", ")}` });
  }
  return { order, errors, involved: [...involved] };
}
