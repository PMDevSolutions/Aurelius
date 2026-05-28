#!/usr/bin/env node
/**
 * agent-registry.js — Resolve, install, and uninstall agent plugins.
 *
 * Install copies a plugin's agent.md into <root>/.claude/agents/<name>.md and
 * records state in <root>/.claude/agent-plugins/installed.json. Management-
 * lifecycle hooks (pre/postInstall, pre/postUninstall) run at the matching
 * points; a failing pre* hook aborts, a failing post* hook only warns.
 *
 * Usage:
 *   node scripts/agent-registry.js list [--json]
 *   node scripts/agent-registry.js resolve <name> [--json]
 *   node scripts/agent-registry.js install <name> [--json]
 *   node scripts/agent-registry.js uninstall <name> [--force] [--json]
 *   (--root <dir> overrides repo root; used by tests)
 *
 * Hooks run via `bash`; ensure bash is on PATH (Git Bash/WSL on Windows).
 *
 * Exit codes: 0 ok · 1 resolution/operation failure · 2 usage/IO error
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { buildCatalog, resolveDependencies } from "./agent-plugin-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(__dirname, "validate-agent-plugin.js");

function parseArgs(argv) {
  const out = { cmd: null, name: null, json: false, force: false, root: resolve(__dirname, "..") };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--force") out.force = true;
    else if (a === "--root") out.root = resolve(argv[++i]);
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
  out.name = positional[1] ?? null;
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/agent-registry.js <command> [name] [options]

Commands:
  list                 List available plugins
  resolve <name>       Print install order (dry run)
  install <name>       Install a plugin and its dependencies
  uninstall <name>     Remove an installed plugin

Options:
  --force              Allow uninstall of a depended-on plugin
  --json               Machine-readable output
  --root <dir>         Override repo root (default: repo containing this script)
  -h, --help           Show this message`);
}

const paths = (root) => ({
  pluginsRoot: join(root, ".claude", "agent-plugins"),
  agentsDir: join(root, ".claude", "agents"),
  installedFile: join(root, ".claude", "agent-plugins", "installed.json"),
});

function loadInstalled(p) {
  if (!existsSync(p.installedFile)) return {};
  try {
    return JSON.parse(readFileSync(p.installedFile, "utf-8"));
  } catch (e) {
    const err = new Error(`Failed to parse installed.json (${p.installedFile}): ${e.message}`, {
      cause: e,
    });
    err.code = "IO";
    throw err;
  }
}
function saveInstalled(p, state) {
  mkdirSync(dirname(p.installedFile), { recursive: true });
  writeFileSync(p.installedFile, JSON.stringify(state, null, 2) + "\n");
}
function sourceHash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
}

// Validate a plugin dir via the validator CLI. Returns { ok, detail }.
function validatePluginDir(dir) {
  try {
    execFileSync("node", [VALIDATOR, "--dir", dir, "--json"], { encoding: "utf-8" });
    return { ok: true };
  } catch (e) {
    let detail = "validation failed";
    try {
      const out = JSON.parse(e.stdout || "{}");
      const first = out.issues?.[0];
      if (first) detail = `${out.issues.length} issue(s): ${first.path}: ${first.message}`;
    } catch {
      /* keep the generic detail */
    }
    return { ok: false, detail };
  }
}

function runHook(catalog, name, hook, fail) {
  const entry = catalog[name];
  const rel = entry?.manifest?.hooks?.[hook];
  if (!rel) return { ran: false };
  const script = join(entry.dir, rel);
  try {
    execFileSync("bash", [script], {
      stdio: "inherit",
      env: {
        ...process.env,
        PLUGIN_NAME: name,
        PLUGIN_DIR: entry.dir,
        PLUGIN_VERSION: entry.version,
      },
    });
    return { ran: true, ok: true };
  } catch (e) {
    const detail =
      e.code === "ENOENT" ? "bash not found on PATH (required to run hooks)" : e.message;
    if (fail) throw new Error(`${hook} hook failed for "${name}": ${detail}`, { cause: e });
    console.warn(`⚠ ${hook} hook for "${name}" failed (continuing): ${detail}`);
    return { ran: true, ok: false };
  }
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
  const p = paths(args.root);

  try {
    const catalog = buildCatalog(p.pluginsRoot);

    if (args.cmd === "list") {
      const installed = loadInstalled(p);
      const plugins = Object.values(catalog).map((c) => ({
        name: c.manifest.name,
        version: c.version,
        installed: Boolean(installed[c.manifest.name]),
      }));
      emit(args.json, { plugins }, () => {
        if (!plugins.length) console.log("No plugins found.");
        for (const pl of plugins)
          console.log(`${pl.installed ? "●" : "○"} ${pl.name}@${pl.version}`);
      });
      process.exit(0);
    }

    if (!args.name) {
      console.error("This command requires a plugin name.");
      process.exit(2);
    }
    if (!catalog[args.name]) {
      emit(args.json, { ok: false, error: `Unknown plugin "${args.name}"` }, () =>
        console.error(`✗ Unknown plugin "${args.name}"`),
      );
      process.exit(2);
    }

    if (args.cmd === "resolve" || args.cmd === "install") {
      const { order, errors } = resolveDependencies(catalog, args.name);
      if (errors.length) {
        emit(args.json, { ok: false, order, errors }, () => {
          console.error(`✗ Cannot resolve "${args.name}":`);
          for (const e of errors) console.error(`    [${e.code}] ${e.message}`);
        });
        process.exit(1);
      }
      if (args.cmd === "resolve") {
        emit(args.json, { ok: true, order }, () =>
          console.log(`Install order: ${order.join(" -> ")}`),
        );
        process.exit(0);
      }

      // Validate every plugin before copying anything, so a broken agent
      // never lands in .claude/agents/ and the install stays all-or-nothing.
      for (const name of order) {
        const v = validatePluginDir(catalog[name].dir);
        if (!v.ok) {
          emit(
            args.json,
            { ok: false, error: `"${name}" failed validation`, detail: v.detail },
            () => console.error(`✗ "${name}" failed validation: ${v.detail}`),
          );
          process.exit(1);
        }
      }

      // install
      const installed = loadInstalled(p);
      mkdirSync(p.agentsDir, { recursive: true });
      const actions = [];
      for (const name of order) {
        const entry = catalog[name];
        const agentSrc = join(entry.dir, entry.manifest.agent || "agent.md");
        const dest = join(p.agentsDir, `${name}.md`);
        if (installed[name]?.version === entry.version && existsSync(dest)) {
          actions.push({ name, skipped: true });
          continue;
        }
        runHook(catalog, name, "preInstall", true); // may throw; prior plugins are already persisted
        copyFileSync(agentSrc, dest);
        runHook(catalog, name, "postInstall", false);
        installed[name] = {
          version: entry.version,
          sourceHash: sourceHash(agentSrc),
          installedAt: new Date().toISOString(),
        };
        saveInstalled(p, installed); // persist incrementally so disk and record can't desync on abort
        actions.push({ name, installed: true });
      }
      emit(args.json, { ok: true, order, actions }, () => {
        for (const a of actions)
          console.log(a.skipped ? `= ${a.name} (already installed)` : `+ ${a.name}`);
      });
      process.exit(0);
    }

    if (args.cmd === "uninstall") {
      const installed = loadInstalled(p);
      if (!installed[args.name]) {
        emit(args.json, { ok: false, error: `"${args.name}" is not installed` }, () =>
          console.error(`✗ "${args.name}" is not installed`),
        );
        process.exit(1);
      }
      const dependents = Object.keys(installed).filter(
        (n) =>
          n !== args.name && catalog[n] && Object.keys(catalog[n].deps || {}).includes(args.name),
      );
      if (dependents.length && !args.force) {
        emit(args.json, { ok: false, error: "has dependents", dependents }, () => {
          console.error(
            `✗ "${args.name}" is required by: ${dependents.join(", ")}. Use --force to override.`,
          );
        });
        process.exit(1);
      }
      runHook(catalog, args.name, "preUninstall", true);
      const dest = join(p.agentsDir, `${args.name}.md`);
      if (existsSync(dest)) rmSync(dest);
      runHook(catalog, args.name, "postUninstall", false);
      delete installed[args.name];
      saveInstalled(p, installed);
      emit(args.json, { ok: true, removed: args.name }, () => console.log(`- ${args.name}`));
      process.exit(0);
    }

    console.error(`Unknown command: ${args.cmd}`);
    printHelp();
    process.exit(2);
  } catch (e) {
    const code = e.code === "IO" ? 2 : 1;
    if (args.json) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error(`✗ ${e.message}`);
    process.exit(code);
  }
}

main();
