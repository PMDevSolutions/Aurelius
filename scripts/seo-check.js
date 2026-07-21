#!/usr/bin/env node
/**
 * seo-check.js — On-page SEO checks for Markdown content, driven by
 * .claude/pipeline.config.json → seoChecklist.
 *
 * Per file:
 *   FAIL  missing/over-length title or meta description (front matter)
 *   FAIL  keyword declared but absent from title / H1 (when required)
 *   FAIL  zero or multiple H1s
 *   WARN  heading hierarchy skips (## → ####)
 *   WARN  internal links below minInternalLinks
 *   WARN  cited external sources below minCitedSources
 *
 * Usage:
 *   node scripts/seo-check.js <file-or-dir> [...more] [--json]
 *
 * Exit codes: 0 = no failures (warnings allowed), 1 = failures found,
 *             2 = usage/IO error.
 */

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const CONFIG_PATH = join(repoRoot, ".claude", "pipeline.config.json");

const DEFAULTS = {
  titleMaxChars: 60,
  metaDescriptionMaxChars: 155,
  requireKeywordInTitle: true,
  requireKeywordInH1: true,
  minInternalLinks: 2,
  minCitedSources: 1,
  enforceHeadingHierarchy: true,
};

function parseArgs(argv) {
  const out = { paths: [], json: false };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") {
      const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
      for (const line of src.split("\n").slice(1)) {
        if (!line.startsWith(" *")) break;
        console.log(line.replace(/^ \*\/?\s?/, ""));
      }
      process.exit(0);
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    } else out.paths.push(a);
  }
  if (out.paths.length === 0) out.paths.push("content");
  return out;
}

function collectFiles(paths) {
  const files = [];
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        walk(join(p, entry));
      }
    } else if ([".md", ".mdx"].includes(extname(p))) {
      files.push(p);
    }
  };
  for (const p of paths) walk(p);
  return files;
}

function parseFrontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { fm, body: raw.slice(m[0].length) };
}

function checkFile(file, cfg) {
  const raw = readFileSync(file, "utf8");
  const { fm, body } = parseFrontMatter(raw);
  const failures = [];
  const warnings = [];

  const title = fm.title ?? "";
  const desc = fm.description ?? "";
  const keyword = (fm.keyword ?? "").toLowerCase();

  if (!title) failures.push("front matter: title missing");
  else if (title.length > cfg.titleMaxChars)
    failures.push(`title ${title.length} chars > max ${cfg.titleMaxChars}`);

  if (!desc) failures.push("front matter: description (meta) missing");
  else if (desc.length > cfg.metaDescriptionMaxChars)
    failures.push(`description ${desc.length} chars > max ${cfg.metaDescriptionMaxChars}`);

  // Body without code blocks for structural checks.
  const prose = body.replace(/```[\s\S]*?```/g, "");
  const headings = [...prose.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) failures.push("no H1 heading");
  if (h1s.length > 1) failures.push(`${h1s.length} H1 headings (expected exactly 1)`);

  if (keyword) {
    if (cfg.requireKeywordInTitle && !title.toLowerCase().includes(keyword))
      failures.push(`keyword "${keyword}" not in title`);
    if (cfg.requireKeywordInH1 && h1s.length && !h1s[0].text.toLowerCase().includes(keyword))
      failures.push(`keyword "${keyword}" not in H1`);
  }

  if (cfg.enforceHeadingHierarchy) {
    let prev = null;
    for (const h of headings) {
      if (prev !== null && h.level > prev + 1)
        warnings.push(`heading hierarchy skip: H${prev} → H${h.level} at "${h.text.slice(0, 40)}"`);
      prev = h.level;
    }
  }

  const links = [...prose.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  const internal = links.filter((l) => l.startsWith("/") || l.startsWith("./") || l.startsWith("../"));
  const external = links.filter((l) => /^https?:\/\//.test(l));
  if (internal.length < cfg.minInternalLinks)
    warnings.push(`${internal.length} internal link(s) < min ${cfg.minInternalLinks}`);
  if (external.length < cfg.minCitedSources)
    warnings.push(`${external.length} external source link(s) < min ${cfg.minCitedSources}`);

  return { file, failures, warnings, title: title.length, description: desc.length };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let cfg = DEFAULTS;
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    cfg = { ...DEFAULTS, ...(config.seoChecklist ?? {}) };
  } catch {
    /* defaults */
  }

  const files = collectFiles(args.paths);
  if (files.length === 0) {
    if (args.json) console.log(JSON.stringify({ ok: true, files: [], note: "no files found" }));
    else console.log("seo-check: no Markdown files found — nothing to check.");
    process.exit(0);
  }

  const results = files.map((f) => checkFile(f, cfg));
  const failCount = results.reduce((n, r) => n + r.failures.length, 0);
  const warnCount = results.reduce((n, r) => n + r.warnings.length, 0);

  if (args.json) {
    console.log(JSON.stringify({ ok: failCount === 0, failCount, warnCount, results }, null, 2));
  } else {
    for (const r of results) {
      const mark = r.failures.length ? "✗" : "✓";
      console.log(`${mark} ${r.file}`);
      for (const f of r.failures) console.log(`    FAIL ${f}`);
      for (const w of r.warnings) console.log(`    warn ${w}`);
    }
    console.log(`\n${files.length} file(s): ${failCount} failure(s), ${warnCount} warning(s).`);
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main();
