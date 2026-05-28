#!/usr/bin/env node
/**
 * validate-agent-plugin.js — Validate an agent plugin's manifest (against the
 * JSON Schema) plus structural checks the schema cannot express:
 *   - manifest.name matches directory name AND agent.md frontmatter name
 *   - declared hook scripts exist
 *   - the agent file exists and is a file
 *   - skill deps exist under .claude/skills/, tool deps exist as repo files
 *   - agent.md frontmatter has name/description/tools; model/permissionMode valid
 *   - agent dependencies resolve against the catalog (siblings, in --dir mode)
 *
 * Usage:
 *   node scripts/validate-agent-plugin.js --dir <plugin-dir> [--json]
 *   node scripts/validate-agent-plugin.js --all [--plugins-root <dir>] [--json]
 *
 * Exit codes: 0 valid · 1 invalid · 2 usage/IO error
 */
import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import {
  parseFrontmatter,
  loadManifest,
  buildCatalog,
  resolveDependencies,
  listPluginDirs,
} from "./agent-plugin-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_PLUGINS_ROOT = join(repoRoot, ".claude", "agent-plugins");
const SCHEMA = join(repoRoot, ".claude", "agent-plugin.schema.json");
const SKILLS_ROOT = join(repoRoot, ".claude", "skills");
const VALID_MODELS = ["opus", "sonnet", "haiku"];
const VALID_PERM = ["default", "acceptEdits", "bypassPermissions", "plan"];

function parseArgs(argv) {
  const out = { dir: null, all: false, json: false, pluginsRoot: DEFAULT_PLUGINS_ROOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = resolve(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--plugins-root") out.pluginsRoot = resolve(argv[++i]);
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
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/validate-agent-plugin.js (--dir <plugin-dir> | --all) [options]

Options:
  --dir <path>           Validate a single plugin directory
  --all                  Validate every plugin under the plugins root
  --plugins-root <dir>   Plugins root for --all (default: .claude/agent-plugins)
  --json                 Machine-readable output
  -h, --help             Show this message`);
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

function validatePlugin(dir, validate, catalog) {
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

  const agentFile = join(dir, manifest.agent || "agent.md");
  let agentStat = null;
  try {
    agentStat = statSync(agentFile);
  } catch {
    /* missing */
  }
  if (!agentStat || !agentStat.isFile()) {
    issues.push({
      path: "agent",
      message: `agent file not found or not a file: ${manifest.agent || "agent.md"}`,
    });
  } else {
    const { frontmatter, hasFrontmatter } = parseFrontmatter(readFileSync(agentFile, "utf-8"));
    if (!hasFrontmatter) {
      issues.push({ path: "agent", message: "agent file has no frontmatter" });
    } else {
      if (manifest.name && frontmatter.name && frontmatter.name !== manifest.name) {
        issues.push({
          path: "agent.frontmatter.name",
          message: `frontmatter name "${frontmatter.name}" != manifest name "${manifest.name}"`,
        });
      }
      for (const f of ["name", "description", "tools"]) {
        if (!frontmatter[f])
          issues.push({ path: `agent.frontmatter.${f}`, message: `missing "${f}"` });
      }
      if (frontmatter.model && !VALID_MODELS.includes(frontmatter.model)) {
        issues.push({
          path: "agent.frontmatter.model",
          message: `invalid model "${frontmatter.model}"`,
        });
      }
      if (frontmatter.permissionMode && !VALID_PERM.includes(frontmatter.permissionMode)) {
        issues.push({
          path: "agent.frontmatter.permissionMode",
          message: `invalid permissionMode "${frontmatter.permissionMode}"`,
        });
      }
    }
  }

  for (const [hook, rel] of Object.entries(manifest.hooks ?? {})) {
    if (!existsSync(join(dir, rel)))
      issues.push({ path: `hooks.${hook}`, message: `hook script not found: ${rel}` });
  }

  for (const skill of manifest.dependencies?.skills ?? []) {
    if (!existsSync(join(SKILLS_ROOT, skill)))
      issues.push({ path: "dependencies.skills", message: `skill not found: ${skill}` });
  }
  for (const tool of manifest.dependencies?.tools ?? []) {
    if (!existsSync(join(repoRoot, tool)))
      issues.push({ path: "dependencies.tools", message: `tool not found: ${tool}` });
  }

  if (catalog[manifest.name]) {
    const { errors } = resolveDependencies(catalog, manifest.name);
    for (const e of errors) issues.push({ path: "dependencies.agents", message: e.message });
  }

  return { name: manifest.name ?? dirName, dir, ok: issues.length === 0, issues };
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
  let catalog;
  if (args.all) {
    catalog = buildCatalog(args.pluginsRoot);
    dirs = listPluginDirs(args.pluginsRoot);
  } else {
    if (!existsSync(join(args.dir, "plugin.json"))) {
      const msg = `No plugin.json found in ${args.dir}`;
      if (args.json) console.log(JSON.stringify({ ok: false, error: msg }));
      else console.error(`✗ ${msg}`);
      process.exit(2);
    }
    dirs = [args.dir];
    // Seed the catalog from sibling plugins so the target's agent deps resolve.
    catalog = buildCatalog(dirname(args.dir));
  }

  const results = [];
  for (const d of dirs) {
    try {
      results.push(validatePlugin(d, validate, catalog));
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
    if (args.all && results.length === 0) console.log(`No plugins found under ${args.pluginsRoot}`);
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
