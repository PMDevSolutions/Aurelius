#!/usr/bin/env node
/**
 * create-agent-plugin.js — Scaffold a new agent plugin under
 * .claude/agent-plugins/<name>/ with a manifest, agent.md skeleton (in the
 * house style), and default test assertions. Non-interactive when a name and
 * --description are supplied; otherwise prompts for missing fields.
 *
 * Usage:
 *   node scripts/create-agent-plugin.js <name> [--description "..."] \
 *     [--model opus|sonnet|haiku] [--tools "Read,Write"] [--with-hooks] [--force] [--json]
 *   (--root <dir> overrides repo root; used by tests)
 *
 * Exit codes: 0 created · 1 exists (no --force) · 2 usage/IO error
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const VALID_MODELS = ["opus", "sonnet", "haiku"];

function parseArgs(argv) {
  const out = {
    name: null,
    description: null,
    model: "sonnet",
    tools: "Read, Write",
    withHooks: false,
    force: false,
    json: false,
    root: resolve(__dirname, ".."),
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--description") out.description = argv[++i];
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--tools") out.tools = argv[++i];
    else if (a === "--with-hooks") out.withHooks = true;
    else if (a === "--force") out.force = true;
    else if (a === "--json") out.json = true;
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
  out.name = positional[0] ?? null;
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/create-agent-plugin.js <name> [options]

Options:
  --description "..."   Agent description
  --model <m>           opus | sonnet | haiku (default: sonnet)
  --tools "A,B"         Comma-separated tool list (default: "Read, Write")
  --with-hooks          Scaffold hooks/ stubs
  --force               Overwrite an existing plugin
  --json                Machine-readable output
  -h, --help            Show this message`);
}

function ask(question) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on("close", () => res(""));
    rl.question(question, (a) => {
      rl.close();
      res(a.trim());
    });
  });
}

function manifest(name, description, withHooks) {
  const m = {
    name,
    version: "0.1.0",
    description,
    agent: "agent.md",
    tests: "tests/plugin.test.json",
  };
  if (withHooks)
    m.hooks = { preInstall: "hooks/pre-install.sh", postInstall: "hooks/post-install.sh" };
  return JSON.stringify(m, null, 2) + "\n";
}

function agentMd(name, description, model, tools) {
  return `---
name: ${name}
description: ${description} <example>Context: a relevant situation user: 'a representative request' assistant: 'how this agent responds'</example> <example>Context: a second situation user: 'another request' assistant: 'the response'</example>
tools: ${tools}
model: ${model}
---

You are a ${name} specialist. Describe the agent's core expertise here.

Your core expertise areas:
- **Area 1**: specific capabilities
- **Area 2**: specific capabilities

## When to Use This Agent

Use this agent for:
- Use case 1
- Use case 2
`;
}

const TESTS =
  JSON.stringify(
    {
      assert: [
        "manifest.valid",
        "frontmatter.has(name,description,tools)",
        "frontmatter.model in (opus,sonnet,haiku)",
        "deps.resolve",
        "hooks.executable",
        "prompt.section('When to Use This Agent')",
        "description.examples >= 2",
      ],
    },
    null,
    2,
  ) + "\n";

const HOOK_STUB = `#!/usr/bin/env bash
set -u
trap 'exit 0' ERR
# PLUGIN_NAME, PLUGIN_DIR, PLUGIN_VERSION are available in the environment.
echo "hook for \${PLUGIN_NAME}"
exit 0
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY);

  let name = args.name;
  if (!name && !args.json && interactive) name = await ask("Plugin name (kebab-case): ");
  if (!name) {
    console.error("A plugin name is required.");
    process.exit(2);
  }
  if (!NAME_RE.test(name)) {
    console.error(`✗ Invalid name "${name}". Use kebab-case: ^[a-z][a-z0-9-]*$`);
    process.exit(2);
  }

  let description = args.description;
  if (!description && !args.json && interactive) description = await ask("Description: ");
  if (!description) description = `The ${name} agent`;

  if (!VALID_MODELS.includes(args.model)) {
    console.error(`✗ Invalid model "${args.model}"`);
    process.exit(2);
  }

  const tools = args.tools
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

  const dir = join(args.root, ".claude", "agent-plugins", name);
  const preExisting = existsSync(dir);
  if (preExisting && !args.force) {
    if (args.json) console.log(JSON.stringify({ ok: false, error: "exists" }));
    else console.error(`✗ Plugin "${name}" already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  try {
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "plugin.json"), manifest(name, description, args.withHooks));
    writeFileSync(join(dir, "agent.md"), agentMd(name, description, args.model, tools));
    writeFileSync(join(dir, "tests", "plugin.test.json"), TESTS);
    if (args.withHooks) {
      mkdirSync(join(dir, "hooks"), { recursive: true });
      writeFileSync(join(dir, "hooks", "pre-install.sh"), HOOK_STUB);
      writeFileSync(join(dir, "hooks", "post-install.sh"), HOOK_STUB);
    }
  } catch (e) {
    if (!preExisting) rmSync(dir, { recursive: true, force: true });
    throw e;
  }

  if (args.json) console.log(JSON.stringify({ ok: true, name, dir }, null, 2));
  else console.log(`✓ Created plugin "${name}" at ${dir}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${e.stack ?? e.message}`);
  process.exit(2);
});
