#!/usr/bin/env node
/**
 * renderer-registry.js — List, resolve, and detect framework renderers.
 *
 * A renderer is a directory under the renderers root containing a
 * renderer.json manifest (see renderers/renderer.schema.json). This CLI is a
 * deterministic query surface over those manifests; it never mutates state.
 *
 * Usage:
 *   node scripts/renderer-registry.js list [--json]
 *   node scripts/renderer-registry.js resolve <name> [--json]
 *   node scripts/renderer-registry.js detect <projectDir> [--json]
 *   (--renderers-root <dir> overrides the renderers root; used by tests)
 *
 * Exit codes: 0 ok · 1 invalid/validation failure · 2 usage/unknown-name/IO error
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { loadCatalog, globToRegExp } from "./renderer-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RENDERERS_ROOT = resolve(__dirname, "..", "renderers");

/** Require a value for a flag that expects one; exit 2 if it's the last arg. */
function requireValue(flag, value) {
  if (value === undefined) {
    console.error(`Missing value for ${flag}`);
    printHelp();
    process.exit(2);
  }
  return value;
}

function parseArgs(argv) {
  const out = { cmd: null, arg: null, json: false, renderersRoot: DEFAULT_RENDERERS_ROOT };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--renderers-root") out.renderersRoot = resolve(requireValue(a, argv[++i]));
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("--")) {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(2);
    } else positional.push(a);
  }
  out.cmd = positional[0] ?? null;
  out.arg = positional[1] ?? null;
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/renderer-registry.js <command> [arg] [options]

Commands:
  list                   List available renderers
  resolve <name>         Print a renderer's full manifest
  detect <projectDir>    Detect which renderer matches a project

Options:
  --json                 Machine-readable output
  --renderers-root <dir> Override the renderers root (default: ./renderers)
  -h, --help             Show this message`);
}

function emit(json, payload, human) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else human();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.cmd) {
    printHelp();
    process.exit(2);
  }

  const catalog = loadCatalog(args.renderersRoot);

  if (args.cmd === "list") {
    const renderers = Object.values(catalog)
      .map((c) => ({ name: c.manifest.name, language: c.manifest.language }))
      .sort((a, b) => a.name.localeCompare(b.name));
    emit(args.json, { renderers }, () => {
      if (!renderers.length) console.log("No renderers found.");
      for (const r of renderers) console.log(`${r.name} (${r.language})`);
    });
    process.exit(0);
  }

  if (args.cmd === "resolve") {
    if (!args.arg) {
      console.error("This command requires a renderer name.");
      process.exit(2);
    }
    const entry = catalog[args.arg];
    if (!entry) {
      emit(args.json, { ok: false, error: `Unknown renderer "${args.arg}"` }, () =>
        console.error(`✗ Unknown renderer "${args.arg}"`),
      );
      process.exit(2);
    }
    emit(args.json, entry.manifest, () => console.log(JSON.stringify(entry.manifest, null, 2)));
    process.exit(0);
  }

  if (args.cmd === "detect") {
    if (!args.arg) {
      console.error("This command requires a project directory.");
      process.exit(2);
    }
    const projectDir = resolve(args.arg);
    const match = detect(catalog, projectDir);
    if (match) {
      emit(args.json, { renderer: match.name, language: match.language }, () =>
        console.log(`${match.name} (${match.language})`),
      );
    } else {
      emit(args.json, { renderer: null }, () => console.log("No renderer detected."));
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${args.cmd}`);
  printHelp();
  process.exit(2);
}

/** Find the first matching renderer, highest detect.priority first. A renderer
 *  matches if any configFiles glob matches a file basename in projectDir, or
 *  any dependencies entry appears in the project's package.json deps/devDeps.
 *  Ties on priority are broken by name ascending so results are deterministic
 *  across platforms and filesystem ordering. */
function detect(catalog, projectDir) {
  const ranked = Object.values(catalog).sort((a, b) => {
    const byPriority = (b.manifest.detect?.priority ?? 0) - (a.manifest.detect?.priority ?? 0);
    if (byPriority !== 0) return byPriority;
    return a.manifest.name.localeCompare(b.manifest.name);
  });

  let files = [];
  try {
    files = readdirSync(projectDir);
  } catch {
    files = [];
  }

  let pkgDeps = {};
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      pkgDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    } catch {
      pkgDeps = {};
    }
  }

  for (const { manifest } of ranked) {
    const det = manifest.detect ?? {};
    const configFiles = det.configFiles ?? [];
    const dependencies = det.dependencies ?? [];

    const fileMatch = configFiles.some((glob) => {
      const re = globToRegExp(basename(glob));
      return files.some((f) => re.test(f));
    });
    const depMatch = dependencies.some((d) => d in pkgDeps);

    if (fileMatch || depMatch) {
      return { name: manifest.name, language: manifest.language };
    }
  }
  return null;
}

main();
