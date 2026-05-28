#!/usr/bin/env node
/**
 * test-agent-plugin.js — Run a plugin's static/structural assertions from
 * tests/plugin.test.json (or inline --assert). Each assertion is a pure,
 * deterministic predicate over the plugin's files — no Claude invocation.
 *
 * Usage:
 *   node scripts/test-agent-plugin.js --dir <plugin-dir> [--json]
 *   node scripts/test-agent-plugin.js --all [--plugins-root <dir>] [--json]
 *   node scripts/test-agent-plugin.js --dir <d> --assert "manifest.valid" [--assert ...]
 *
 * Exit codes: 0 all pass · 1 a failure · 2 usage/IO/unknown-assertion error
 */
import { readFileSync, existsSync, accessSync, constants } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import {
  parseFrontmatter,
  loadManifest,
  buildCatalog,
  resolveDependencies,
  countExamples,
  listPluginDirs,
} from "./agent-plugin-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_PLUGINS_ROOT = join(repoRoot, ".claude", "agent-plugins");
const VALIDATOR = join(__dirname, "validate-agent-plugin.js");

function parseArgs(argv) {
  const out = {
    dir: null,
    all: false,
    json: false,
    asserts: [],
    pluginsRoot: DEFAULT_PLUGINS_ROOT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = resolve(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--plugins-root") out.pluginsRoot = resolve(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "--assert") out.asserts.push(argv[++i]);
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  if (out.dir && out.all) {
    console.error("Use either --dir or --all, not both.");
    process.exit(2);
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/test-agent-plugin.js (--dir <plugin-dir> | --all) [options]

Options:
  --dir <path>           Test a single plugin directory
  --all                  Test every plugin under the plugins root
  --plugins-root <dir>   Plugins root for --all (default: .claude/agent-plugins)
  --assert "<expr>"      Override assertions (repeatable) instead of tests/plugin.test.json
  --json                 Machine-readable output
  -h, --help             Show this message`);
}

function loadAgent(dir, manifest) {
  const file = join(dir, manifest.agent || "agent.md");
  if (!existsSync(file)) return { frontmatter: {}, body: "" };
  return parseFrontmatter(readFileSync(file, "utf-8"));
}

const PREDICATES = {
  "manifest.valid": (ctx) => {
    try {
      execFileSync("node", [VALIDATOR, "--dir", ctx.dir, "--json"], { encoding: "utf-8" });
      return { pass: true };
    } catch (e) {
      let detail = "validate-agent-plugin reported issues";
      try {
        const out = JSON.parse(e.stdout || "{}");
        const first = out.issues?.[0];
        if (first) detail = `${out.issues.length} issue(s): ${first.path}: ${first.message}`;
      } catch {
        /* keep the generic detail */
      }
      return { pass: false, detail };
    }
  },
  "deps.resolve": (ctx) => {
    const { errors } = resolveDependencies(ctx.catalog, ctx.manifest.name);
    return { pass: errors.length === 0, detail: errors.map((e) => e.message).join("; ") };
  },
  "hooks.executable": (ctx) => {
    for (const rel of Object.values(ctx.manifest.hooks ?? {})) {
      const p = join(ctx.dir, rel);
      if (!existsSync(p)) return { pass: false, detail: `missing hook ${rel}` };
      try {
        accessSync(p, constants.R_OK);
      } catch {
        return { pass: false, detail: `unreadable hook ${rel}` };
      }
    }
    return { pass: true };
  },
  "description.examples >= 2": (ctx) => {
    const n = countExamples(ctx.agent.frontmatter.description || "");
    return { pass: n >= 2, detail: `found ${n} example(s)` };
  },
};

function evalAssertion(str, ctx) {
  if (PREDICATES[str]) return PREDICATES[str](ctx);

  let m = str.match(/^frontmatter\.has\(([^)]*)\)$/);
  if (m) {
    const fields = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const missing = fields.filter((f) => !ctx.agent.frontmatter[f]);
    return {
      pass: missing.length === 0,
      detail: missing.length ? `missing ${missing.join(", ")}` : "",
    };
  }

  m = str.match(/^frontmatter\.(\w+) in \(([^)]*)\)$/);
  if (m) {
    const field = m[1];
    const allowed = m[2].split(",").map((s) => s.trim());
    const val = ctx.agent.frontmatter[field];
    if (val === undefined) return { pass: true, detail: `${field} not set (optional)` };
    return { pass: allowed.includes(val), detail: `${field}="${val}"` };
  }

  m = str.match(/^prompt\.section\('(.+)'\)$/);
  if (m) {
    const heading = m[1];
    const re = new RegExp(`^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
    const pass = re.test(ctx.agent.body);
    return { pass, detail: pass ? "" : `no section "${heading}"` };
  }

  return { pass: false, unknown: true, detail: `unknown assertion "${str}"` };
}

function runPlugin(dir, catalog, overrideAsserts) {
  const manifest = loadManifest(dir);
  const agent = loadAgent(dir, manifest);
  const ctx = { dir, manifest, agent, catalog, repoRoot };

  let asserts = overrideAsserts;
  if (!asserts || asserts.length === 0) {
    const testsRel = manifest.tests || "tests/plugin.test.json";
    const testsFile = join(dir, testsRel);
    if (!existsSync(testsFile)) {
      return { name: manifest.name, ok: false, error: `no tests file (${testsRel})`, results: [] };
    }
    asserts = JSON.parse(readFileSync(testsFile, "utf-8")).assert ?? [];
  }

  const results = [];
  let unknown = false;
  for (const a of asserts) {
    const r = evalAssertion(a, ctx);
    if (r.unknown) unknown = true;
    results.push({ assert: a, pass: r.pass, detail: r.detail || "" });
  }
  return { name: manifest.name, ok: !unknown && results.every((r) => r.pass), unknown, results };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir && !args.all) {
    printHelp();
    process.exit(2);
  }

  let dirs;
  let catalog;
  if (args.all) {
    catalog = buildCatalog(args.pluginsRoot);
    dirs = listPluginDirs(args.pluginsRoot);
  } else {
    if (!existsSync(join(args.dir, "plugin.json"))) {
      console.error(`✗ No plugin.json in ${args.dir}`);
      process.exit(2);
    }
    dirs = [args.dir];
    catalog = buildCatalog(dirname(args.dir));
  }

  const reports = [];
  for (const d of dirs) {
    try {
      reports.push(runPlugin(d, catalog, args.asserts));
    } catch (e) {
      reports.push({ name: basename(d), ok: false, error: e.message, results: [] });
    }
  }

  const anyUnknown = reports.some((r) => r.unknown);
  const ok = reports.every((r) => r.ok);

  if (args.json) {
    console.log(
      JSON.stringify({ ok, results: reports.flatMap((r) => r.results), reports }, null, 2),
    );
  } else {
    if (args.all && reports.length === 0) console.log(`No plugins found under ${args.pluginsRoot}`);
    for (const r of reports) {
      if (r.error) {
        console.log(`✗ ${r.name}: ${r.error}`);
        continue;
      }
      console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
      for (const a of r.results)
        console.log(`    ${a.pass ? "✓" : "✗"} ${a.assert}${a.detail ? ` — ${a.detail}` : ""}`);
    }
  }
  if (anyUnknown) process.exit(2);
  process.exit(ok ? 0 : 1);
}

main();
