#!/usr/bin/env node
/**
 * validate-pipeline-config.js — Validate .claude/pipeline.config.json against
 * the project's JSON Schema, plus structural checks the schema cannot express
 * (orchestration dependency graph, qualityGateSubtasks references, etc.).
 *
 * Usage:
 *   node scripts/validate-pipeline-config.js
 *   node scripts/validate-pipeline-config.js --config <path>
 *   node scripts/validate-pipeline-config.js --schema <path>
 *   node scripts/validate-pipeline-config.js --json
 *
 * Exit codes:
 *   0 — config is valid
 *   1 — config has schema or structural errors
 *   2 — usage/IO error (file missing, parse failure, etc.)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const DEFAULT_CONFIG = join(repoRoot, ".claude", "pipeline.config.json");
const DEFAULT_SCHEMA = join(repoRoot, ".claude", "pipeline.config.schema.json");

function parseArgs(argv) {
  const out = { config: DEFAULT_CONFIG, schema: DEFAULT_SCHEMA, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = resolve(argv[++i]);
    else if (a === "--schema") out.schema = resolve(argv[++i]);
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
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/validate-pipeline-config.js [options]

Options:
  --config <path>   Path to config (default: .claude/pipeline.config.json)
  --schema <path>   Path to schema (default: .claude/pipeline.config.schema.json)
  --json            Emit machine-readable JSON output
  -h, --help        Show this message`);
}

function loadJson(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found at ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(`Failed to parse ${label} (${path}): ${e.message}`, { cause: e });
  }
}

/**
 * Walk a schema-validation error from ajv and convert to a flat record
 * with a JSON Pointer-style path for easy reading.
 */
function formatSchemaError(err) {
  const path = err.instancePath || "(root)";
  const detail = err.message ?? "validation failed";
  const extras = [];
  if (err.params?.additionalProperty) {
    extras.push(`unexpected key "${err.params.additionalProperty}"`);
  }
  if (err.params?.allowedValues) {
    extras.push(`allowed: ${JSON.stringify(err.params.allowedValues)}`);
  }
  if (err.params?.missingProperty) {
    extras.push(`missing "${err.params.missingProperty}"`);
  }
  return { path, message: detail, extras };
}

/**
 * Structural checks the JSON Schema cannot express:
 *   - orchestration.phases[*].depends references existing phase keys
 *   - orchestration graph has no cycles
 *   - caching.phaseInputs keys reference real inputCategories
 *   - storybook.viewports reference real visualDiff.breakpoints
 *   - e2e.requiredBreakpoints reference real visualDiff.breakpoints
 *   - visualBaselines: storage=lfs only on the commit backend; threshold
 *     equals e2e.crossBrowserDiffThreshold; browsers ⊆ e2e.crossBrowserBrowsers
 */
function structuralChecks(config) {
  const issues = [];

  // 1. Orchestration dependency graph
  const phases = config.orchestration?.phases;
  if (phases && typeof phases === "object") {
    const names = new Set(Object.keys(phases));
    for (const [name, def] of Object.entries(phases)) {
      for (const dep of def.depends ?? []) {
        if (!names.has(dep)) {
          issues.push({
            path: `/orchestration/phases/${name}/depends`,
            message: `references unknown phase "${dep}"`,
          });
        }
      }
    }
    // Cycle detection (Kahn's algorithm). Only count edges to existing phases so
    // a missing-dep error doesn't masquerade as a cycle.
    const incoming = Object.fromEntries(Object.keys(phases).map((n) => [n, 0]));
    for (const [name, def] of Object.entries(phases)) {
      for (const dep of def.depends ?? []) {
        if (names.has(dep)) incoming[name]++;
      }
    }
    const queue = Object.keys(incoming).filter((n) => incoming[n] === 0);
    const visited = new Set();
    while (queue.length) {
      const n = queue.shift();
      visited.add(n);
      for (const [m, def] of Object.entries(phases)) {
        if ((def.depends ?? []).includes(n)) {
          incoming[m]--;
          if (incoming[m] === 0) queue.push(m);
        }
      }
    }
    if (visited.size !== Object.keys(phases).length) {
      const cyclic = Object.keys(phases).filter((n) => !visited.has(n));
      issues.push({
        path: "/orchestration/phases",
        message: `dependency cycle detected involving: ${cyclic.join(", ")}`,
      });
    }
  }

  // 2. caching.phaseInputs → inputCategories
  const caching = config.caching;
  if (caching?.phaseInputs && caching?.inputCategories) {
    const categories = new Set(Object.keys(caching.inputCategories));
    for (const [phase, inputs] of Object.entries(caching.phaseInputs)) {
      for (const cat of inputs ?? []) {
        if (!categories.has(cat)) {
          issues.push({
            path: `/caching/phaseInputs/${phase}`,
            message: `references unknown inputCategory "${cat}"`,
          });
        }
      }
    }
  }

  // 3. Breakpoint name references
  const breakpoints = config.visualDiff?.breakpoints;
  if (breakpoints) {
    const known = new Set(Object.keys(breakpoints));
    for (const name of config.visualDiff?.requiredBreakpoints ?? []) {
      if (!known.has(name)) {
        issues.push({
          path: "/visualDiff/requiredBreakpoints",
          message: `"${name}" not defined in /visualDiff/breakpoints`,
        });
      }
    }
    for (const name of config.storybook?.viewports ?? []) {
      if (!known.has(name)) {
        issues.push({
          path: "/storybook/viewports",
          message: `"${name}" not defined in /visualDiff/breakpoints`,
        });
      }
    }
  }

  // 4. visualBaselines cross-field rules (RFC 0002)
  const vb = config.visualBaselines;
  if (vb) {
    if (vb.storage === "lfs" && vb.backend !== undefined && vb.backend !== "commit") {
      issues.push({
        path: "/visualBaselines/storage",
        message: `"lfs" applies to the commit backend only (backend is "${vb.backend}")`,
      });
    }
    const crossThreshold = config.e2e?.crossBrowserDiffThreshold;
    if (
      vb.threshold !== undefined &&
      crossThreshold !== undefined &&
      vb.threshold !== crossThreshold
    ) {
      issues.push({
        path: "/visualBaselines/threshold",
        message: `disagrees with /e2e/crossBrowserDiffThreshold (${vb.threshold} vs ${crossThreshold}) — a single cross-engine tolerance must apply`,
      });
    }
    const crossBrowsers = config.e2e?.crossBrowserBrowsers;
    if (vb.browsers && crossBrowsers) {
      const allowed = new Set(crossBrowsers);
      for (const b of vb.browsers) {
        if (!allowed.has(b)) {
          issues.push({
            path: "/visualBaselines/browsers",
            message: `"${b}" is not in /e2e/crossBrowserBrowsers — baselines would be captured for an engine the E2E matrix never exercises`,
          });
        }
      }
    }
  }

  // 5. qualityGate.mutationScore.threshold vs mutationTesting.scoreThreshold drift
  const gateThreshold = config.qualityGate?.mutationScore?.threshold;
  const runnerThreshold = config.mutationTesting?.scoreThreshold;
  if (
    gateThreshold !== undefined &&
    runnerThreshold !== undefined &&
    gateThreshold !== runnerThreshold
  ) {
    issues.push({
      path: "/qualityGate/mutationScore/threshold",
      message: `disagrees with /mutationTesting/scoreThreshold (${gateThreshold} vs ${runnerThreshold}) — gate and runner may behave inconsistently`,
    });
  }

  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let config;
  let schema;
  try {
    config = loadJson(args.config, "Config");
    schema = loadJson(args.schema, "Schema");
  } catch (e) {
    if (args.json) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error(`✗ ${e.message}`);
    process.exit(2);
  }

  // Dynamically import ajv. If missing, give a clear remediation hint.
  let Ajv2020;
  try {
    ({ default: Ajv2020 } = await import("ajv/dist/2020.js"));
  } catch {
    const msg = "ajv is not installed. Run `pnpm install` (or `pnpm add -D ajv`) and retry.";
    if (args.json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`✗ ${msg}`);
    process.exit(2);
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(config);

  const schemaErrors = (validate.errors ?? []).map(formatSchemaError);
  const structural = structuralChecks(config);

  const totalIssues = schemaErrors.length + structural.length;
  const pass = ok && structural.length === 0;

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: pass,
          configPath: args.config,
          schemaPath: args.schema,
          schemaErrors,
          structuralIssues: structural,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Validating ${args.config}`);
    console.log(`Against     ${args.schema}\n`);

    if (pass) {
      console.log(`✓ Config is valid (${Object.keys(config).length} top-level sections)`);
    } else {
      if (schemaErrors.length) {
        console.log(`✗ Schema errors (${schemaErrors.length}):`);
        for (const err of schemaErrors) {
          const extras = err.extras.length ? ` — ${err.extras.join("; ")}` : "";
          console.log(`  ${err.path}: ${err.message}${extras}`);
        }
      }
      if (structural.length) {
        console.log(`✗ Structural issues (${structural.length}):`);
        for (const err of structural) {
          console.log(`  ${err.path}: ${err.message}`);
        }
      }
      console.log(`\nFix ${totalIssues} issue(s) and re-run.`);
    }
  }

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ Unhandled error: ${e.stack ?? e.message}`);
  process.exit(2);
});
