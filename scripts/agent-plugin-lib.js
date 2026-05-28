#!/usr/bin/env node
/**
 * agent-plugin-lib.js — shared helpers for the agent-plugin tooling
 * (validate / registry / create / test). Pure, side-effect-free functions
 * over plugin files so each CLI stays thin and testable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import semver from "semver";

/** Parse simple single-line `key: value` YAML frontmatter from a Markdown string. */
export function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content, hasFrontmatter: false };
  const frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (km) frontmatter[km[1]] = km[2].trim();
  }
  return { frontmatter, body: m[2], hasFrontmatter: true };
}

/** Count `<example>` blocks in an agent description. */
export function countExamples(description = "") {
  return (description.match(/<example>/g) || []).length;
}

/** Read and parse a plugin's plugin.json. Throws if absent. */
export function loadManifest(pluginDir) {
  const p = join(pluginDir, "plugin.json");
  if (!existsSync(p)) throw new Error(`No plugin.json in ${pluginDir}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

/** Build a catalog { name -> { version, dir, manifest, deps } } from a plugins root. */
export function buildCatalog(pluginsRoot) {
  const catalog = {};
  if (!existsSync(pluginsRoot)) return catalog;
  for (const entry of readdirSync(pluginsRoot)) {
    const dir = join(pluginsRoot, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "plugin.json"))) continue;
    const manifest = loadManifest(dir);
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
