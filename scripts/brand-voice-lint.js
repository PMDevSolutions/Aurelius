#!/usr/bin/env node
/**
 * brand-voice-lint.js — Mechanical enforcement of brand-guidelines.json.
 *
 * Scans Markdown/text files for violations of the brand lockfile:
 *   - lexicon.banned words/phrases                       → error
 *   - claims.prohibited terms                            → error
 *   - lexicon.productNames incorrect forms               → error
 *   - lexicon.preferred "insteadOf" terms                → warning
 *   - compliance.disclaimers required for the asset type → error if missing
 *
 * Usage:
 *   node scripts/brand-voice-lint.js <file-or-dir> [...more] [--json]
 *   node scripts/brand-voice-lint.js content/
 *   node scripts/brand-voice-lint.js --self-test        # validate the lockfile itself
 *
 * Exit codes: 0 = clean (warnings allowed), 1 = errors found, 2 = usage/IO error
 *             (including a missing lockfile — there is nothing to enforce).
 */

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const LOCKFILE = join(repoRoot, "brand-guidelines.json");

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
  const out = { paths: [], json: false, selfTest: false };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a === "--self-test") out.selfTest = true;
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

function loadLockfile() {
  if (!existsSync(LOCKFILE)) {
    console.error(
      "✗ brand-guidelines.json not found at the project root.\n" +
        "  There is nothing to enforce — run /setup-brand to create the lockfile."
    );
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(LOCKFILE, "utf8"));
  } catch (err) {
    console.error(`✗ brand-guidelines.json is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}

function selfTest(lock) {
  const problems = [];
  if (!lock.version) problems.push("missing version");
  if (!lock.voice?.personality?.length) problems.push("voice.personality is empty");
  if (!Array.isArray(lock.lexicon?.banned)) problems.push("lexicon.banned missing (use [] if none)");
  const banned = new Set((lock.lexicon?.banned ?? []).map((w) => w.toLowerCase()));
  for (const phrase of lock.voice?.examplePhrases ?? []) {
    for (const b of banned) {
      if (phrase.toLowerCase().includes(b))
        problems.push(`examplePhrases contains banned term "${b}": "${phrase}"`);
    }
  }
  const boiler = (lock.brand?.boilerplate ?? "").toLowerCase();
  for (const b of banned) {
    if (boiler.includes(b)) problems.push(`brand.boilerplate contains banned term "${b}"`);
  }
  if (problems.length) {
    console.error("✗ Lockfile self-test failed:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `✓ brand-guidelines.json v${lock.version} parses and is enforceable ` +
      `(${(lock.lexicon?.banned ?? []).length} banned terms, ` +
      `${(lock.lexicon?.preferred ?? []).length} preferred mappings, ` +
      `${(lock.compliance?.disclaimers ?? []).length} disclaimer rules).`
  );
  process.exit(0);
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

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find case-insensitive whole-word/phrase matches, returning line numbers. */
function findTerm(lines, term) {
  const re = new RegExp(`(?<![\\w-])${escapeRe(term)}(?![\\w-])`, "i");
  const hits = [];
  lines.forEach((line, i) => {
    if (re.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 90) });
  });
  return hits;
}

function lintFile(file, lock) {
  const raw = readFileSync(file, "utf8");
  const lines = raw.split("\n");
  const findings = [];

  for (const term of lock.lexicon?.banned ?? []) {
    for (const hit of findTerm(lines, term)) {
      findings.push({ severity: "error", rule: "lexicon.banned", term, ...hit });
    }
  }

  for (const term of lock.claims?.prohibited ?? []) {
    for (const hit of findTerm(lines, term)) {
      findings.push({ severity: "error", rule: "claims.prohibited", term, ...hit });
    }
  }

  for (const naming of lock.lexicon?.productNames ?? []) {
    for (const wrong of naming.incorrect ?? []) {
      // Case-sensitive: the incorrect form is a specific misspelling/casing.
      const re = new RegExp(`(?<![\\w-])${escapeRe(wrong)}(?![\\w-])`);
      lines.forEach((line, i) => {
        if (re.test(line)) {
          findings.push({
            severity: "error",
            rule: "lexicon.productNames",
            term: wrong,
            line: i + 1,
            text: line.trim().slice(0, 90),
            fix: `use "${naming.correct}"`,
          });
        }
      });
    }
  }

  for (const pref of lock.lexicon?.preferred ?? []) {
    for (const avoid of pref.insteadOf ?? []) {
      for (const hit of findTerm(lines, avoid)) {
        findings.push({
          severity: "warning",
          rule: "lexicon.preferred",
          term: avoid,
          ...hit,
          fix: `prefer "${pref.use}"`,
        });
      }
    }
  }

  const type = inferType(file);
  for (const rule of lock.compliance?.disclaimers ?? []) {
    if (rule.assetType === type && rule.required && rule.text) {
      // Presence check: a distinctive fragment of the disclaimer must appear.
      const fragment = rule.text.split(/[+.]/)[0].trim();
      if (fragment && !raw.toLowerCase().includes(fragment.toLowerCase())) {
        findings.push({
          severity: "error",
          rule: "compliance.disclaimers",
          term: rule.text,
          line: 0,
          text: `required disclaimer for ${type} not found`,
        });
      }
    }
  }

  return findings;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const lock = loadLockfile();
  if (args.selfTest) selfTest(lock);

  const files = collectFiles(args.paths);
  const report = [];
  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    const findings = lintFile(file, lock);
    errors += findings.filter((f) => f.severity === "error").length;
    warnings += findings.filter((f) => f.severity === "warning").length;
    if (findings.length) report.push({ file, findings });
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        { ok: errors === 0, files: files.length, errors, warnings, report },
        null,
        2
      )
    );
  } else if (files.length === 0) {
    console.log("brand-voice-lint: no Markdown/text files found — nothing to lint.");
  } else if (report.length === 0) {
    console.log(`✓ ${files.length} file(s) clean against brand-guidelines.json v${lock.version}.`);
  } else {
    for (const { file, findings } of report) {
      console.log(`\n${file}`);
      for (const f of findings) {
        const mark = f.severity === "error" ? "✗" : "⚠";
        const loc = f.line ? `:${f.line}` : "";
        const fix = f.fix ? ` → ${f.fix}` : "";
        console.log(`  ${mark} [${f.rule}] "${f.term}"${loc}${fix}`);
        if (f.text && f.line) console.log(`      ${f.text}`);
      }
    }
    console.log(`\n${errors} error(s), ${warnings} warning(s) across ${report.length} file(s).`);
  }

  process.exit(errors > 0 ? 1 : 0);
}

main();
