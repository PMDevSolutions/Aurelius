#!/usr/bin/env node
/**
 * validate-renderer.js — Validate a renderer manifest against the JSON Schema
 * plus cross-reference checks the schema cannot express:
 *   - manifest validates against renderers/renderer.schema.json (ajv 2020)
 *   - manifest.name matches the directory basename
 *   - the template path exists (resolved against --root)
 *   - the converter names an existing agent at .claude/agents/<converter>.md
 *   - language is one of the four supported values
 *
 * Usage:
 *   node scripts/validate-renderer.js --dir <renderer-dir> [--json]
 *   node scripts/validate-renderer.js --all [--renderers-root <dir>] [--json]
 *   (--root <dir> overrides the repo root for resolving template/agent paths)
 *
 * Exit codes: 0 valid · 1 invalid · 2 usage/IO error
 */
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const SCHEMA = join(repoRoot, "renderers", "renderer.schema.json");
const VALID_LANGUAGES = ["react", "vue", "svelte", "react-native"];

function parseArgs(argv) {
  const out = { dir: null, all: false, json: false, renderersRoot: null, root: repoRoot };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = resolve(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--renderers-root") out.renderersRoot = resolve(argv[++i]);
    else if (a === "--root") out.root = resolve(argv[++i]);
    else if (a === "--json") out.json = true;
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
  if (!out.renderersRoot) out.renderersRoot = join(out.root, "renderers");
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/validate-renderer.js (--dir <renderer-dir> | --all) [options]

Options:
  --dir <path>            Validate a single renderer directory
  --all                   Validate every renderer under the renderers root
  --renderers-root <dir>  Renderers root for --all (default: <root>/renderers)
  --root <dir>            Repo root for resolving template/agent paths
  --json                  Machine-readable output
  -h, --help              Show this message`);
}

async function compileSchema() {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const schema = JSON.parse(readFileSync(SCHEMA, "utf-8"));
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

/** Flatten an ajv error to { path, message } with the offending key surfaced. */
function formatSchemaError(err) {
  const path = err.instancePath || "(root)";
  let message = err.message ?? "validation failed";
  if (err.params?.additionalProperty) message += `: "${err.params.additionalProperty}"`;
  if (err.params?.missingProperty) message += `: "${err.params.missingProperty}"`;
  if (err.params?.allowedValues) message += ` (allowed: ${err.params.allowedValues.join(", ")})`;
  return { path, message };
}

function loadManifest(dir) {
  const p = join(dir, "renderer.json");
  if (!existsSync(p)) throw new Error(`No renderer.json in ${dir}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

function validateRenderer(dir, validate, root) {
  const issues = [];
  const manifest = loadManifest(dir); // may throw -> caller reports it as an (io) issue

  if (!validate(manifest)) {
    for (const e of validate.errors ?? []) issues.push(formatSchemaError(e));
  }

  const dirName = basename(dir);
  if (manifest.name && manifest.name !== dirName) {
    issues.push({
      path: "name",
      message: `manifest name "${manifest.name}" != directory "${dirName}"`,
    });
  }

  if (manifest.language && !VALID_LANGUAGES.includes(manifest.language)) {
    issues.push({
      path: "language",
      message: `invalid language "${manifest.language}" (allowed: ${VALID_LANGUAGES.join(", ")})`,
    });
  }

  if (manifest.template) {
    const templatePath = resolve(root, manifest.template);
    if (!existsSync(templatePath)) {
      issues.push({ path: "template", message: `template path not found: ${manifest.template}` });
    }
  }

  if (manifest.converter) {
    const agentFile = join(root, ".claude", "agents", `${manifest.converter}.md`);
    if (!existsSync(agentFile)) {
      issues.push({
        path: "converter",
        message: `converter agent not found: .claude/agents/${manifest.converter}.md`,
      });
    }
  }

  return { name: manifest.name ?? dirName, dir, ok: issues.length === 0, issues };
}

function listRendererDirs(root) {
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir && !args.all) {
    printHelp();
    process.exit(2);
  }

  let validate;
  try {
    validate = await compileSchema();
  } catch (e) {
    if (args.json) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error(`✗ ${e.message}`);
    process.exit(2);
  }

  let dirs;
  if (args.all) {
    dirs = listRendererDirs(args.renderersRoot);
  } else {
    if (!existsSync(join(args.dir, "renderer.json"))) {
      const msg = `No renderer.json found in ${args.dir}`;
      if (args.json) console.log(JSON.stringify({ ok: false, error: msg }));
      else console.error(`✗ ${msg}`);
      process.exit(2);
    }
    dirs = [args.dir];
  }

  const results = [];
  for (const d of dirs) {
    try {
      results.push(validateRenderer(d, validate, args.root));
    } catch (e) {
      results.push({
        name: basename(d),
        dir: d,
        ok: false,
        issues: [{ path: "(io)", message: e.message }],
      });
    }
  }

  const ok = results.every((r) => r.ok);
  if (args.json) {
    console.log(
      JSON.stringify(
        { ok, count: results.length, results, issues: results.flatMap((r) => r.issues) },
        null,
        2,
      ),
    );
  } else {
    if (args.all && results.length === 0)
      console.log(`No renderers found under ${args.renderersRoot}`);
    for (const r of results) {
      if (r.ok) console.log(`✓ ${r.name}`);
      else {
        console.log(`✗ ${r.name} (${r.issues.length} issue(s)):`);
        for (const i of r.issues) console.log(`    ${i.path}: ${i.message}`);
      }
    }
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ Unhandled error: ${e.stack ?? e.message}`);
  process.exit(2);
});
