#!/usr/bin/env node
/**
 * readability-score.js — Score marketing copy against per-asset-type
 * readability targets from .claude/pipeline.config.json.
 *
 * Computes Flesch Reading Ease, average sentence length, and a passive-voice
 * heuristic for each Markdown/text file, then compares against the target for
 * the file's asset type (inferred from its path, or forced with --type).
 *
 * Usage:
 *   node scripts/readability-score.js <file-or-dir> [...more] [options]
 *   node scripts/readability-score.js content/ --check
 *   node scripts/readability-score.js content/blog/post.md --type blog-post --json
 *
 * Options:
 *   --type <assetType>  Force an asset type instead of path inference
 *   --check             Exit 1 if any file misses its Flesch target
 *   --json              Machine-readable output
 *
 * Exit codes: 0 = ok (or advisory misses without --check), 1 = --check failure,
 *             2 = usage/IO error.
 */

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const CONFIG_PATH = join(repoRoot, ".claude", "pipeline.config.json");

const DEFAULT_TARGET = { fleschMin: 60, maxAvgSentenceWords: 22, maxPassiveVoicePct: 12 };

// Path-segment → assetType inference, checked in order.
const PATH_TYPE_MAP = [
  ["blog", "blog-post"],
  ["landing-page", "landing-page"],
  ["landing", "landing-page"],
  ["email-sequence", "email-sequence"],
  ["email", "email"],
  ["social", "social-batch"],
  ["ads", "ad-campaign"],
  ["ad-variants", "ad-campaign"],
  ["press", "press-release"],
  ["video", "video-script"],
];

function parseArgs(argv) {
  const out = { paths: [], type: null, check: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type") out.type = argv[++i];
    else if (a === "--check") out.check = true;
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    } else out.paths.push(a);
  }
  if (out.paths.length === 0) out.paths.push("content");
  return out;
}

function printHelp() {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  for (const line of src.split("\n").slice(1)) {
    if (!line.startsWith(" *")) break;
    console.log(line.replace(/^ \*\/?\s?/, ""));
  }
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
    } else if ([".md", ".mdx", ".txt"].includes(extname(p))) {
      files.push(p);
    }
  };
  for (const p of paths) walk(p);
  return files;
}

function inferType(filePath) {
  const lower = filePath.toLowerCase();
  for (const [segment, type] of PATH_TYPE_MAP) {
    if (lower.includes(`/${segment}/`) || lower.includes(`/${segment}s/`)) return type;
  }
  return "blog-post";
}

/** Strip front matter, code, and Markdown syntax down to prose. */
function toProse(raw) {
  let text = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`]*`/g, " ");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/^#+\s+/gm, "");
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/[*_~|]/g, " ");
  return text;
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  let stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  stripped = stripped.replace(/^y/, "");
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

const PASSIVE_RE =
  /\b(?:am|is|are|was|were|be|been|being|get|gets|got|gotten)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/i;

function analyze(raw) {
  const prose = toProse(raw);
  const sentences = prose
    .split(/[.!?]+[\s\n]+|[.!?]+$/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2);
  const words = prose.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (sentences.length === 0 || words.length === 0) return null;

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const passiveCount = sentences.filter((s) => PASSIVE_RE.test(s)).length;

  return {
    sentences: sentences.length,
    words: words.length,
    flesch: Math.round(flesch * 10) / 10,
    avgSentenceWords: Math.round(wordsPerSentence * 10) / 10,
    passivePct: Math.round((passiveCount / sentences.length) * 1000) / 10,
  };
}

function loadTargets() {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return {
      targets: config.readability?.targets ?? {},
      blocking: config.readability?.blocking ?? false,
    };
  } catch {
    return { targets: {}, blocking: false };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { targets } = loadTargets();
  const files = collectFiles(args.paths);
  if (files.length === 0) {
    if (args.json) console.log(JSON.stringify({ ok: true, files: [], note: "no files found" }));
    else console.log("readability-score: no Markdown/text files found — nothing to score.");
    process.exit(0);
  }

  const results = [];
  let misses = 0;
  for (const file of files) {
    const type = args.type ?? inferType(file);
    const target = { ...DEFAULT_TARGET, ...(targets[type] ?? {}) };
    const metrics = analyze(readFileSync(file, "utf8"));
    if (!metrics) {
      results.push({ file, type, status: "skip", reason: "no scoreable prose" });
      continue;
    }
    const problems = [];
    if (metrics.flesch < target.fleschMin)
      problems.push(`flesch ${metrics.flesch} < target ${target.fleschMin}`);
    if (metrics.avgSentenceWords > target.maxAvgSentenceWords)
      problems.push(`avg sentence ${metrics.avgSentenceWords}w > ${target.maxAvgSentenceWords}w`);
    if (metrics.passivePct > target.maxPassiveVoicePct)
      problems.push(`passive voice ${metrics.passivePct}% > ${target.maxPassiveVoicePct}%`);
    const status = problems.length === 0 ? "pass" : "miss";
    if (metrics.flesch < target.fleschMin) misses++;
    results.push({ file, type, status, ...metrics, target, problems });
  }

  if (args.json) {
    const ok = !(args.check && misses > 0);
    console.log(JSON.stringify({ ok, misses, files: results }, null, 2));
  } else {
    for (const r of results) {
      if (r.status === "skip") {
        console.log(`- ${r.file} [${r.type}] skipped (${r.reason})`);
        continue;
      }
      const mark = r.status === "pass" ? "✓" : "✗";
      console.log(
        `${mark} ${r.file} [${r.type}] flesch ${r.flesch} · ${r.avgSentenceWords}w/sentence · passive ${r.passivePct}%`
      );
      for (const p of r.problems) console.log(`    ${p}`);
    }
    const scored = results.filter((r) => r.status !== "skip").length;
    console.log(`\n${scored} scored, ${misses} below Flesch target.`);
  }

  process.exit(args.check && misses > 0 ? 1 : 0);
}

main();
