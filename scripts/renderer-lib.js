#!/usr/bin/env node
/**
 * renderer-lib.js — shared helpers for the renderer tooling
 * (registry / validate). Pure, side-effect-free functions over renderer
 * manifests so each CLI stays thin and testable. Mirrors how
 * agent-plugin-lib.js factors shared logic out of the agent-plugin CLIs.
 *
 * A renderer is a directory under the renderers root containing a
 * renderer.json manifest (see renderers/renderer.schema.json).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

/** Read and parse a renderer's renderer.json. Throws if absent. */
export function loadManifest(dir) {
  const p = join(dir, "renderer.json");
  if (!existsSync(p)) throw new Error(`No renderer.json in ${dir}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

/** Build a catalog { name -> { dir, manifest } } from renderer.json files
 *  under the renderers root. Skips unreadable or malformed manifests (and
 *  nameless ones) so one bad renderer can't abort the scan; the validator
 *  surfaces those separately. */
export function loadCatalog(root) {
  const catalog = {};
  if (!existsSync(root)) return catalog;
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    let isDir;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (!existsSync(join(dir, "renderer.json"))) continue;
    let manifest;
    try {
      manifest = loadManifest(dir);
    } catch {
      continue;
    }
    if (!manifest || typeof manifest.name !== "string") continue;
    catalog[manifest.name] = { dir, manifest };
  }
  return catalog;
}

/** List absolute paths of renderer directories (those containing renderer.json)
 *  under a root. Skips unreadable entries; returns [] if the root is missing. */
export function listRendererDirs(root) {
  const dirs = [];
  if (!existsSync(root)) return dirs;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    try {
      if (statSync(full).isDirectory() && existsSync(join(full, "renderer.json"))) dirs.push(full);
    } catch {
      /* skip unreadable entry */
    }
  }
  return dirs;
}

/** Translate a simple glob (only `*` wildcards) to an anchored regex. */
export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
