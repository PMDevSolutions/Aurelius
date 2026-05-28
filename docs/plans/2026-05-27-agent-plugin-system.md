# Agent Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Markdown + Node tooling layer that lets users author, validate, dependency-resolve, install, and test custom Claude Code agents as versioned "plugins."

**Architecture:** A plugin is a directory under `.claude/agent-plugins/<name>/` containing `plugin.json` (manifest), `agent.md` (the prompt), optional `hooks/`, and `tests/`. Four Node CLIs (validate, registry, create, test) share one library module. Install copies `agent.md` into `.claude/agents/<name>.md` (where Claude Code reads it) and records state in `installed.json`. All scripts follow repo conventions: ESM, `.sh` wrappers, `--json`, exit `0/1/2`.

**Tech Stack:** Node ESM, `ajv` (JSON Schema 2020, already a devDep), `semver` (to add), Vitest (`scripts/__tests__/`). Bash wrapper scripts.

**Design reference:** `docs/plans/2026-05-27-agent-plugin-system-design.md`

**Conventions to match (read these first):**
- `scripts/validate-pipeline-config.js` — arg parsing, ajv usage, error formatting, exit codes, Kahn cycle detection.
- `scripts/__tests__/check-doc-counts.test.js` — integration test style (`execFileSync`, recompute expectations from disk).
- `scripts/__tests__/vitest.config.js` — `fileParallelism: false`, 30s timeout.

**Run a single test file:** `pnpm vitest run scripts/__tests__/<file>`

---

### Task 0: Add `semver` dependency

**Files:**
- Modify: `package.json` (devDependencies)

**Step 1: Add the dependency**

Run: `pnpm add -D semver`
Expected: `semver` appears in `package.json` devDependencies; `pnpm-lock.yaml` updated.

**Step 2: Verify it imports**

Run: `node -e "import('semver').then(m=>console.log(typeof m.default.satisfies))"`
Expected: prints `function`

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add semver for agent plugin dependency resolution"
```

---

### Task 1: Shared library — frontmatter & manifest parsing

**Files:**
- Create: `scripts/agent-plugin-lib.js`
- Test: `scripts/__tests__/agent-plugin-lib.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { parseFrontmatter, countExamples } from "../agent-plugin-lib.js";

describe("parseFrontmatter", () => {
  it("splits frontmatter from body", () => {
    const md = "---\nname: foo\ndescription: A test agent\ntools: Read, Write\n---\nBody here";
    const { frontmatter, body, hasFrontmatter } = parseFrontmatter(md);
    expect(hasFrontmatter).toBe(true);
    expect(frontmatter.name).toBe("foo");
    expect(frontmatter.description).toBe("A test agent");
    expect(frontmatter.tools).toBe("Read, Write");
    expect(body.trim()).toBe("Body here");
  });

  it("returns hasFrontmatter false when absent", () => {
    const { frontmatter, hasFrontmatter } = parseFrontmatter("no frontmatter");
    expect(hasFrontmatter).toBe(false);
    expect(frontmatter).toEqual({});
  });
});

describe("countExamples", () => {
  it("counts <example> blocks", () => {
    expect(countExamples("a <example>x</example> b <example>y</example>")).toBe(2);
    expect(countExamples("none")).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js`
Expected: FAIL — cannot resolve `../agent-plugin-lib.js`.

**Step 3: Write minimal implementation**

```js
#!/usr/bin/env node
/**
 * agent-plugin-lib.js — shared helpers for the agent-plugin tooling
 * (validate / registry / create / test). Pure, side-effect-free functions
 * over plugin files so each CLI stays thin and testable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import semver from "semver";

/** Parse simple single-line `key: value` YAML frontmatter from a Markdown string. */
export function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content, hasFrontmatter: false };
  const frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (km) frontmatter[km[1]] = km[2].trim();
  }
  return { frontmatter, body: m[2], hasFrontmatter: true };
}

/** Count `<example>` blocks in an agent description. */
export function countExamples(description = "") {
  return (description.match(/<example>/g) || []).length;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js`
Expected: PASS (5 assertions).

**Step 5: Commit**

```bash
git add scripts/agent-plugin-lib.js scripts/__tests__/agent-plugin-lib.test.js
git commit -m "feat(plugins): add frontmatter + example parsing helpers"
```

---

### Task 2: Shared library — catalog & semver

**Files:**
- Modify: `scripts/agent-plugin-lib.js`
- Test: `scripts/__tests__/agent-plugin-lib.test.js`
- Test fixtures: create under a temp dir inside the test (use `mkdtempSync`).

**Step 1: Add failing tests**

Append to the test file:

```js
import { buildCatalog, loadManifest, satisfiesRange } from "../agent-plugin-lib.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function makePlugin(root, name, version, deps = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plugin.json"), JSON.stringify({
    name, version, description: `${name} agent`,
    dependencies: { agents: deps },
  }));
  return dir;
}

describe("buildCatalog + satisfiesRange", () => {
  it("indexes plugins by name with version and deps", () => {
    const root = mkdtempSync(join(tmpdir(), "plg-"));
    try {
      makePlugin(root, "alpha", "1.0.0");
      makePlugin(root, "beta", "2.1.0", { alpha: "^1.0.0" });
      const catalog = buildCatalog(root);
      expect(Object.keys(catalog).sort()).toEqual(["alpha", "beta"]);
      expect(catalog.beta.version).toBe("2.1.0");
      expect(catalog.beta.deps).toEqual({ alpha: "^1.0.0" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns empty catalog for a missing root", () => {
    expect(buildCatalog(join(tmpdir(), "does-not-exist-xyz"))).toEqual({});
  });

  it("satisfiesRange wraps semver", () => {
    expect(satisfiesRange("1.2.0", "^1.0.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.0.0")).toBe(false);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js`
Expected: FAIL — `buildCatalog`/`loadManifest`/`satisfiesRange` not exported.

**Step 3: Implement**

Append to `scripts/agent-plugin-lib.js`:

```js
/** Read and parse a plugin's plugin.json. Throws if absent. */
export function loadManifest(pluginDir) {
  const p = join(pluginDir, "plugin.json");
  if (!existsSync(p)) throw new Error(`No plugin.json in ${pluginDir}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

/** Build a catalog { name -> { version, dir, manifest, deps } } from a plugins root. */
export function buildCatalog(pluginsRoot) {
  const catalog = {};
  if (!existsSync(pluginsRoot)) return catalog;
  for (const entry of readdirSync(pluginsRoot)) {
    const dir = join(pluginsRoot, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "plugin.json"))) continue;
    const manifest = loadManifest(dir);
    catalog[manifest.name] = {
      version: manifest.version,
      dir,
      manifest,
      deps: manifest.dependencies?.agents ?? {},
    };
  }
  return catalog;
}

/** True if `version` satisfies the semver `range`. */
export function satisfiesRange(version, range) {
  return semver.satisfies(version, range, { includePrerelease: true });
}
```

**Step 4: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/agent-plugin-lib.js scripts/__tests__/agent-plugin-lib.test.js
git commit -m "feat(plugins): add catalog builder and semver range check"
```

---

### Task 3: Shared library — dependency resolution

**Files:**
- Modify: `scripts/agent-plugin-lib.js`
- Test: `scripts/__tests__/agent-plugin-lib.test.js`

**Step 1: Add failing tests**

```js
import { resolveDependencies } from "../agent-plugin-lib.js";

describe("resolveDependencies", () => {
  const catalog = {
    a: { version: "1.0.0", deps: {} },
    b: { version: "1.0.0", deps: { a: "^1.0.0" } },
    c: { version: "1.0.0", deps: { b: "^1.0.0", a: "^1.0.0" } },
  };

  it("orders dependencies before dependents", () => {
    const { order, errors } = resolveDependencies(catalog, "c");
    expect(errors).toEqual([]);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
    expect(order[order.length - 1]).toBe("c");
  });

  it("flags a missing dependency", () => {
    const { errors } = resolveDependencies({ x: { version: "1.0.0", deps: { y: "^1.0.0" } } }, "x");
    expect(errors.some((e) => e.code === "missing")).toBe(true);
  });

  it("flags a version mismatch", () => {
    const c = { p: { version: "1.0.0", deps: { q: "^2.0.0" } }, q: { version: "1.0.0", deps: {} } };
    const { errors } = resolveDependencies(c, "p");
    expect(errors.some((e) => e.code === "version")).toBe(true);
  });

  it("detects a cycle", () => {
    const c = { m: { version: "1.0.0", deps: { n: "^1.0.0" } }, n: { version: "1.0.0", deps: { m: "^1.0.0" } } };
    const { errors } = resolveDependencies(c, "m");
    expect(errors.some((e) => e.code === "cycle")).toBe(true);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js`
Expected: FAIL — `resolveDependencies` not exported.

**Step 3: Implement**

Append to `scripts/agent-plugin-lib.js`:

```js
/**
 * Resolve the transitive agent-dependency graph rooted at `rootName`.
 * Returns { order, errors, involved }. `order` lists deps before dependents
 * (topological). `errors` collects every problem: missing deps, semver
 * mismatches, and cycles. Errors do not short-circuit — all are reported.
 */
export function resolveDependencies(catalog, rootName) {
  const errors = [];
  const involved = new Set();
  const edges = {}; // name -> [dependency names]

  function visit(name, chain) {
    if (!catalog[name]) {
      const by = chain.length ? ` (required by ${chain.join(" -> ")})` : "";
      errors.push({ code: "missing", message: `"${name}" not found in catalog${by}` });
      return;
    }
    if (involved.has(name)) return;
    involved.add(name);
    edges[name] = [];
    for (const [dep, range] of Object.entries(catalog[name].deps || {})) {
      edges[name].push(dep);
      if (!catalog[dep]) {
        errors.push({ code: "missing", message: `"${dep}" not found (required by ${[...chain, name].join(" -> ")})` });
        continue;
      }
      if (!satisfiesRange(catalog[dep].version, range)) {
        errors.push({ code: "version", message: `"${dep}@${catalog[dep].version}" does not satisfy "${range}" (required by ${name})` });
      }
      visit(dep, [...chain, name]);
    }
  }
  visit(rootName, []);

  // Kahn topological sort over involved nodes (edge n -> d means n depends on d).
  const indeg = {};
  for (const n of involved) indeg[n] = (edges[n] || []).filter((d) => involved.has(d)).length;
  const queue = [...involved].filter((n) => indeg[n] === 0);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of involved) {
      if ((edges[m] || []).includes(n)) {
        indeg[m]--;
        if (indeg[m] === 0) queue.push(m);
      }
    }
  }
  if (order.length !== involved.size) {
    const cyclic = [...involved].filter((n) => !order.includes(n));
    errors.push({ code: "cycle", message: `dependency cycle involving: ${cyclic.join(", ")}` });
  }
  return { order, errors, involved: [...involved] };
}
```

**Step 4: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js`
Expected: PASS (all describe blocks).

**Step 5: Commit**

```bash
git add scripts/agent-plugin-lib.js scripts/__tests__/agent-plugin-lib.test.js
git commit -m "feat(plugins): add transitive dependency resolver with cycle detection"
```

---

### Task 4: Manifest JSON Schema

**Files:**
- Create: `.claude/agent-plugin.schema.json`
- Test: `scripts/__tests__/agent-plugin-schema.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaPath = join(root, ".claude", "agent-plugin.schema.json");

let validate;
beforeAll(async () => {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
});

const base = { name: "demo-agent", version: "1.0.0", description: "A demo agent" };

describe("agent-plugin.schema.json", () => {
  it("accepts a minimal valid manifest", () => {
    expect(validate(base)).toBe(true);
  });
  it("rejects a missing name", () => {
    const { name, ...noName } = base;
    expect(validate(noName)).toBe(false);
  });
  it("rejects a non-kebab name", () => {
    expect(validate({ ...base, name: "Demo_Agent" })).toBe(false);
  });
  it("rejects an unknown hook key", () => {
    expect(validate({ ...base, hooks: { onClick: "x.sh" } })).toBe(false);
  });
  it("rejects unknown top-level keys", () => {
    expect(validate({ ...base, bogus: true })).toBe(false);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-schema.test.js`
Expected: FAIL — schema file not found.

**Step 3: Create the schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aurelius.dev/agent-plugin.schema.json",
  "title": "Agent Plugin Manifest",
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "version", "description"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "kebab-case; must match directory and agent.md frontmatter name"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"
    },
    "description": { "type": "string", "minLength": 1 },
    "author": { "type": "string" },
    "license": { "type": "string" },
    "agent": { "type": "string", "default": "agent.md" },
    "dependencies": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "agents": {
          "type": "object",
          "additionalProperties": { "type": "string", "minLength": 1 }
        },
        "skills": { "type": "array", "items": { "type": "string" } },
        "tools": { "type": "array", "items": { "type": "string" } }
      }
    },
    "hooks": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "preInstall": { "type": "string" },
        "postInstall": { "type": "string" },
        "preUninstall": { "type": "string" },
        "postUninstall": { "type": "string" }
      }
    },
    "tests": { "type": "string" }
  }
}
```

**Step 4: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-schema.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add .claude/agent-plugin.schema.json scripts/__tests__/agent-plugin-schema.test.js
git commit -m "feat(plugins): add agent plugin manifest JSON schema"
```

---

### Task 5: Test fixtures

Create on-disk fixture plugins used by the integration tests in Tasks 6–9.

**Files:**
- Create: `scripts/__tests__/fixtures/agent-plugins/valid-base/plugin.json`
- Create: `scripts/__tests__/fixtures/agent-plugins/valid-base/agent.md`
- Create: `scripts/__tests__/fixtures/agent-plugins/valid-base/tests/plugin.test.json`
- Create: `scripts/__tests__/fixtures/agent-plugins/depends-on-base/plugin.json`
- Create: `scripts/__tests__/fixtures/agent-plugins/depends-on-base/agent.md`
- Create: `scripts/__tests__/fixtures/agent-plugins/missing-dep/plugin.json`
- Create: `scripts/__tests__/fixtures/agent-plugins/missing-dep/agent.md`
- Create: `scripts/__tests__/fixtures/agent-plugins/name-mismatch/plugin.json`
- Create: `scripts/__tests__/fixtures/agent-plugins/name-mismatch/agent.md`

**Step 1: valid-base/plugin.json**

```json
{
  "name": "valid-base",
  "version": "1.0.0",
  "description": "A valid base agent plugin for tests",
  "agent": "agent.md",
  "tests": "tests/plugin.test.json"
}
```

**Step 2: valid-base/agent.md**

```markdown
---
name: valid-base
description: Use this agent to test the plugin system. <example>Context: a test user: 'do x' assistant: 'doing x'</example> <example>Context: another user: 'do y' assistant: 'doing y'</example>
tools: Read, Write
model: sonnet
---

You are a test agent.

## When to Use This Agent

Use this agent only in tests.
```

**Step 3: valid-base/tests/plugin.test.json**

```json
{
  "assert": [
    "manifest.valid",
    "frontmatter.has(name,description,tools)",
    "frontmatter.model in (opus,sonnet,haiku)",
    "deps.resolve",
    "hooks.executable",
    "prompt.section('When to Use This Agent')",
    "description.examples >= 2"
  ]
}
```

**Step 4: depends-on-base** — `plugin.json` (depends on valid-base) and a minimal `agent.md`:

```json
{
  "name": "depends-on-base",
  "version": "1.0.0",
  "description": "Depends on valid-base",
  "dependencies": { "agents": { "valid-base": "^1.0.0" } }
}
```

```markdown
---
name: depends-on-base
description: Dependent agent. <example>Context: t user: 'a' assistant: 'b'</example> <example>Context: u user: 'c' assistant: 'd'</example>
tools: Read
model: sonnet
---

## When to Use This Agent

Use after valid-base.
```

**Step 5: missing-dep** — depends on a non-existent plugin:

```json
{
  "name": "missing-dep",
  "version": "1.0.0",
  "description": "Depends on a plugin that does not exist",
  "dependencies": { "agents": { "ghost": "^1.0.0" } }
}
```

```markdown
---
name: missing-dep
description: Bad deps. <example>Context: t user: 'a' assistant: 'b'</example> <example>Context: u user: 'c' assistant: 'd'</example>
tools: Read
---

## When to Use This Agent

Never — it has a missing dependency.
```

**Step 6: name-mismatch** — `plugin.json` name differs from `agent.md` frontmatter name:

```json
{
  "name": "name-mismatch",
  "version": "1.0.0",
  "description": "Frontmatter name will not match"
}
```

```markdown
---
name: totally-different
description: Mismatch. <example>Context: t user: 'a' assistant: 'b'</example> <example>Context: u user: 'c' assistant: 'd'</example>
tools: Read
---

## When to Use This Agent

Used to test the three-way name consistency check.
```

**Step 7: Commit**

```bash
git add scripts/__tests__/fixtures/agent-plugins
git commit -m "test(plugins): add agent plugin fixtures"
```

---

### Task 6: `validate-agent-plugin.js`

Schema validation + structural checks for a single plugin (or `--all`).

**Files:**
- Create: `scripts/validate-agent-plugin.js`
- Create: `scripts/validate-agent-plugin.sh`
- Test: `scripts/__tests__/validate-agent-plugin.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "validate-agent-plugin.js");
const FIX = join(__dirname, "fixtures", "agent-plugins");

function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8", timeout: 30000 });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

describe("validate-agent-plugin.js", () => {
  it("passes a valid plugin (exit 0)", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("fails a name mismatch (exit 1) with a clear message", () => {
    const r = run(["--dir", join(FIX, "name-mismatch"), "--json"]);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out.issues)).toMatch(/name/i);
  });

  it("exits 2 on a missing directory", () => {
    const r = run(["--dir", join(FIX, "nope"), "--json"]);
    expect(r.exitCode).toBe(2);
  });

  it("shows usage on --help (exit 0)", () => {
    const r = run(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/validate-agent-plugin.test.js`
Expected: FAIL — script not found.

**Step 3: Implement `scripts/validate-agent-plugin.js`**

```js
#!/usr/bin/env node
/**
 * validate-agent-plugin.js — Validate an agent plugin's manifest (against the
 * JSON Schema) plus structural checks the schema cannot express:
 *   - manifest.name matches directory name AND agent.md frontmatter name
 *   - declared hook scripts exist
 *   - the agent file exists
 *   - skill deps exist under .claude/skills/, tool deps exist as repo files
 *   - agent.md frontmatter has name/description/tools; model/permissionMode valid
 *
 * Usage:
 *   node scripts/validate-agent-plugin.js --dir <plugin-dir> [--json]
 *   node scripts/validate-agent-plugin.js --all [--json]
 *
 * Exit codes: 0 valid · 1 invalid · 2 usage/IO error
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { parseFrontmatter, loadManifest, buildCatalog, resolveDependencies, countExamples } from "./agent-plugin-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const PLUGINS_ROOT = join(repoRoot, ".claude", "agent-plugins");
const SCHEMA = join(repoRoot, ".claude", "agent-plugin.schema.json");
const SKILLS_ROOT = join(repoRoot, ".claude", "skills");
const VALID_MODELS = ["opus", "sonnet", "haiku"];
const VALID_PERM = ["default", "acceptEdits", "bypassPermissions", "plan"];

function parseArgs(argv) {
  const out = { dir: null, all: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = resolve(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else { console.error(`Unknown argument: ${a}`); printHelp(); process.exit(2); }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/validate-agent-plugin.js (--dir <plugin-dir> | --all) [--json]

Options:
  --dir <path>   Validate a single plugin directory
  --all          Validate every plugin under .claude/agent-plugins/
  --json         Machine-readable output
  -h, --help     Show this message`);
}

async function compileSchema() {
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const schema = JSON.parse(readFileSync(SCHEMA, "utf-8"));
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

function validatePlugin(dir, validate, catalog) {
  const issues = [];
  const manifest = loadManifest(dir); // may throw -> caller treats as IO error

  if (!validate(manifest)) {
    for (const e of validate.errors ?? []) {
      issues.push({ path: e.instancePath || "(root)", message: e.message });
    }
  }

  // name: dir vs manifest vs frontmatter
  const dirName = basename(dir);
  if (manifest.name && manifest.name !== dirName) {
    issues.push({ path: "name", message: `manifest name "${manifest.name}" != directory "${dirName}"` });
  }

  const agentFile = join(dir, manifest.agent || "agent.md");
  if (!existsSync(agentFile)) {
    issues.push({ path: "agent", message: `agent file not found: ${manifest.agent || "agent.md"}` });
  } else {
    const { frontmatter, hasFrontmatter } = parseFrontmatter(readFileSync(agentFile, "utf-8"));
    if (!hasFrontmatter) {
      issues.push({ path: "agent", message: "agent file has no frontmatter" });
    } else {
      if (manifest.name && frontmatter.name && frontmatter.name !== manifest.name) {
        issues.push({ path: "agent.frontmatter.name", message: `frontmatter name "${frontmatter.name}" != manifest name "${manifest.name}"` });
      }
      for (const f of ["name", "description", "tools"]) {
        if (!frontmatter[f]) issues.push({ path: `agent.frontmatter.${f}`, message: `missing "${f}"` });
      }
      if (frontmatter.model && !VALID_MODELS.includes(frontmatter.model)) {
        issues.push({ path: "agent.frontmatter.model", message: `invalid model "${frontmatter.model}"` });
      }
      if (frontmatter.permissionMode && !VALID_PERM.includes(frontmatter.permissionMode)) {
        issues.push({ path: "agent.frontmatter.permissionMode", message: `invalid permissionMode "${frontmatter.permissionMode}"` });
      }
    }
  }

  // hooks exist
  for (const [hook, rel] of Object.entries(manifest.hooks ?? {})) {
    if (!existsSync(join(dir, rel))) issues.push({ path: `hooks.${hook}`, message: `hook script not found: ${rel}` });
  }

  // skills exist
  for (const skill of manifest.dependencies?.skills ?? []) {
    if (!existsSync(join(SKILLS_ROOT, skill))) issues.push({ path: "dependencies.skills", message: `skill not found: ${skill}` });
  }
  // tools exist (repo-relative)
  for (const tool of manifest.dependencies?.tools ?? []) {
    if (!existsSync(join(repoRoot, tool))) issues.push({ path: "dependencies.tools", message: `tool not found: ${tool}` });
  }

  // agent deps resolve (against the catalog)
  if (catalog[manifest.name]) {
    const { errors } = resolveDependencies(catalog, manifest.name);
    for (const e of errors) issues.push({ path: "dependencies.agents", message: e.message });
  }

  return { name: manifest.name ?? dirName, dir, ok: issues.length === 0, issues };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir && !args.all) { printHelp(); process.exit(2); }

  let validate, catalog;
  try {
    validate = await compileSchema();
    catalog = buildCatalog(PLUGINS_ROOT);
  } catch (e) {
    if (args.json) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error(`✗ ${e.message}`);
    process.exit(2);
  }

  let dirs;
  if (args.all) {
    dirs = existsSync(PLUGINS_ROOT)
      ? readdirSync(PLUGINS_ROOT).map((d) => join(PLUGINS_ROOT, d)).filter((d) => statSync(d).isDirectory() && existsSync(join(d, "plugin.json")))
      : [];
  } else {
    if (!existsSync(join(args.dir, "plugin.json"))) {
      const msg = `No plugin.json found in ${args.dir}`;
      if (args.json) console.log(JSON.stringify({ ok: false, error: msg }));
      else console.error(`✗ ${msg}`);
      process.exit(2);
    }
    dirs = [args.dir];
    // Include the standalone dir in the catalog so its deps resolve.
    const m = loadManifest(args.dir);
    catalog[m.name] = { version: m.version, dir: args.dir, manifest: m, deps: m.dependencies?.agents ?? {} };
  }

  const results = [];
  for (const d of dirs) {
    try {
      results.push(validatePlugin(d, validate, catalog));
    } catch (e) {
      results.push({ name: basename(d), dir: d, ok: false, issues: [{ path: "(io)", message: e.message }] });
    }
  }

  const ok = results.every((r) => r.ok);
  if (args.json) {
    console.log(JSON.stringify({ ok, results, issues: results.flatMap((r) => r.issues) }, null, 2));
  } else {
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

main().catch((e) => { console.error(`✗ Unhandled error: ${e.stack ?? e.message}`); process.exit(2); });
```

**Step 4: Create `scripts/validate-agent-plugin.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/validate-agent-plugin.js" "$@"
```

**Step 5: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/validate-agent-plugin.test.js`
Expected: PASS. Also spot-check: `node scripts/validate-agent-plugin.js --dir scripts/__tests__/fixtures/agent-plugins/missing-dep` should print a `dependencies.agents` missing issue and exit 1.

**Step 6: Commit**

```bash
git add scripts/validate-agent-plugin.js scripts/validate-agent-plugin.sh scripts/__tests__/validate-agent-plugin.test.js
git commit -m "feat(plugins): add manifest + structural validator"
```

---

### Task 7: `agent-registry.js`

List, resolve (dry-run), install, uninstall — with the management-lifecycle hook runner.

**Files:**
- Create: `scripts/agent-registry.js`
- Create: `scripts/agent-registry.sh`
- Test: `scripts/__tests__/agent-registry.test.js`

**Step 1: Write the failing test**

The test copies fixtures into a temp repo layout (`.claude/agent-plugins/` + `.claude/agents/`) and drives install/uninstall via `--root` so the real repo is never touched.

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "agent-registry.js");
const FIX = join(__dirname, "fixtures", "agent-plugins");

let root, pluginsRoot;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "registry-"));
  pluginsRoot = join(root, ".claude", "agent-plugins");
  mkdirSync(join(root, ".claude", "agents"), { recursive: true });
  mkdirSync(pluginsRoot, { recursive: true });
  cpSync(join(FIX, "valid-base"), join(pluginsRoot, "valid-base"), { recursive: true });
  cpSync(join(FIX, "depends-on-base"), join(pluginsRoot, "depends-on-base"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args, "--root", root], { encoding: "utf-8", timeout: 30000 });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

describe("agent-registry.js", () => {
  it("lists available plugins", () => {
    const r = run(["list", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).plugins.map((p) => p.name).sort()).toEqual(["depends-on-base", "valid-base"]);
  });

  it("resolves install order with deps first", () => {
    const r = run(["resolve", "depends-on-base", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).order).toEqual(["valid-base", "depends-on-base"]);
  });

  it("installs a plugin and its deps into .claude/agents", () => {
    const r = run(["install", "depends-on-base", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, ".claude", "agents", "valid-base.md"))).toBe(true);
    expect(existsSync(join(root, ".claude", "agents", "depends-on-base.md"))).toBe(true);
    expect(existsSync(join(pluginsRoot, "installed.json"))).toBe(true);
  });

  it("refuses to uninstall a depended-on plugin without --force", () => {
    run(["install", "depends-on-base"]);
    const r = run(["uninstall", "valid-base", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/depend/i);
  });

  it("uninstalls cleanly when no dependents", () => {
    run(["install", "depends-on-base"]);
    const r = run(["uninstall", "depends-on-base", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, ".claude", "agents", "depends-on-base.md"))).toBe(false);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/agent-registry.test.js`
Expected: FAIL — script not found.

**Step 3: Implement `scripts/agent-registry.js`**

```js
#!/usr/bin/env node
/**
 * agent-registry.js — Resolve, install, and uninstall agent plugins.
 *
 * Install copies a plugin's agent.md into .claude/agents/<name>.md and records
 * state in .claude/agent-plugins/installed.json. Management-lifecycle hooks
 * (pre/postInstall, pre/postUninstall) run at the matching points; a failing
 * pre* hook aborts, a failing post* hook only warns.
 *
 * Usage:
 *   node scripts/agent-registry.js list [--json]
 *   node scripts/agent-registry.js resolve <name> [--json]
 *   node scripts/agent-registry.js install <name> [--json]
 *   node scripts/agent-registry.js uninstall <name> [--force] [--json]
 *   (--root <dir> overrides repo root; used by tests)
 *
 * Exit codes: 0 ok · 1 resolution/operation failure · 2 usage/IO error
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, createHash } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createHash as hash } from "crypto";
import { buildCatalog, resolveDependencies, loadManifest } from "./agent-plugin-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { cmd: null, name: null, json: false, force: false, root: resolve(__dirname, "..") };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--force") out.force = true;
    else if (a === "--root") out.root = resolve(argv[++i]);
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else if (a.startsWith("--")) { console.error(`Unknown argument: ${a}`); printHelp(); process.exit(2); }
    else positional.push(a);
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
  return existsSync(p.installedFile) ? JSON.parse(readFileSync(p.installedFile, "utf-8")) : {};
}
function saveInstalled(p, state) {
  mkdirSync(dirname(p.installedFile), { recursive: true });
  writeFileSync(p.installedFile, JSON.stringify(state, null, 2) + "\n");
}
function sourceHash(file) {
  return hash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
}

function runHook(catalog, name, hook, fail) {
  const entry = catalog[name];
  const rel = entry?.manifest?.hooks?.[hook];
  if (!rel) return { ran: false };
  const script = join(entry.dir, rel);
  try {
    execFileSync("bash", [script], {
      stdio: "inherit",
      env: { ...process.env, PLUGIN_NAME: name, PLUGIN_DIR: entry.dir, PLUGIN_VERSION: entry.version },
    });
    return { ran: true, ok: true };
  } catch (e) {
    if (fail) throw new Error(`${hook} hook failed for "${name}": ${e.message}`);
    console.warn(`⚠ ${hook} hook for "${name}" failed (continuing): ${e.message}`);
    return { ran: true, ok: false };
  }
}

function emit(json, payload, human) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else human();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.cmd) { printHelp(); process.exit(2); }
  const p = paths(args.root);
  const catalog = buildCatalog(p.pluginsRoot);

  if (args.cmd === "list") {
    const installed = loadInstalled(p);
    const plugins = Object.values(catalog).map((c) => ({
      name: c.manifest.name, version: c.version, installed: Boolean(installed[c.manifest.name]),
    }));
    emit(args.json, { plugins }, () => {
      if (!plugins.length) console.log("No plugins found.");
      for (const pl of plugins) console.log(`${pl.installed ? "●" : "○"} ${pl.name}@${pl.version}`);
    });
    process.exit(0);
  }

  if (!args.name) { console.error("This command requires a plugin name."); process.exit(2); }
  if (!catalog[args.name]) { 
    emit(args.json, { ok: false, error: `Unknown plugin "${args.name}"` }, () => console.error(`✗ Unknown plugin "${args.name}"`));
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
      emit(args.json, { ok: true, order }, () => console.log(`Install order: ${order.join(" -> ")}`));
      process.exit(0);
    }

    // install
    const installed = loadInstalled(p);
    mkdirSync(p.agentsDir, { recursive: true });
    const actions = [];
    for (const name of order) {
      const entry = catalog[name];
      const agentSrc = join(entry.dir, entry.manifest.agent || "agent.md");
      const dest = join(p.agentsDir, `${name}.md`);
      if (installed[name]?.version === entry.version && existsSync(dest)) { actions.push({ name, skipped: true }); continue; }
      runHook(catalog, name, "preInstall", true);
      copyFileSync(agentSrc, dest);
      runHook(catalog, name, "postInstall", false);
      installed[name] = { version: entry.version, sourceHash: sourceHash(agentSrc), installedAt: new Date().toISOString() };
      actions.push({ name, installed: true });
    }
    saveInstalled(p, installed);
    emit(args.json, { ok: true, order, actions }, () => {
      for (const a of actions) console.log(a.skipped ? `= ${a.name} (already installed)` : `+ ${a.name}`);
    });
    process.exit(0);
  }

  if (args.cmd === "uninstall") {
    const installed = loadInstalled(p);
    if (!installed[args.name]) {
      emit(args.json, { ok: false, error: `"${args.name}" is not installed` }, () => console.error(`✗ "${args.name}" is not installed`));
      process.exit(1);
    }
    // Block if an installed plugin depends on this one.
    const dependents = Object.keys(installed).filter((n) => n !== args.name && catalog[n] && Object.keys(catalog[n].deps || {}).includes(args.name));
    if (dependents.length && !args.force) {
      emit(args.json, { ok: false, error: "has dependents", dependents }, () => {
        console.error(`✗ "${args.name}" is required by: ${dependents.join(", ")}. Use --force to override.`);
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
}

main();
```

> **Note for implementer:** remove the unused `createHash` import from `fs` (it lives in `crypto`). The `import { createHash as hash } from "crypto"` line is the one to keep. Drop `createHash` from the `fs` import list.

**Step 4: Create `scripts/agent-registry.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/agent-registry.js" "$@"
```

**Step 5: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/agent-registry.test.js`
Expected: PASS (all 5 cases).

**Step 6: Commit**

```bash
git add scripts/agent-registry.js scripts/agent-registry.sh scripts/__tests__/agent-registry.test.js
git commit -m "feat(plugins): add registry with dependency resolution, install/uninstall, lifecycle hooks"
```

---

### Task 8: `create-agent-plugin.js` (scaffolding CLI)

**Files:**
- Create: `scripts/create-agent-plugin.js`
- Create: `scripts/create-agent-plugin.sh`
- Test: `scripts/__tests__/create-agent-plugin.test.js`

**Step 1: Write the failing test** (non-interactive mode via flags + `--root` temp dir)

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "create-agent-plugin.js");

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "create-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args, "--root", root], { encoding: "utf-8", timeout: 30000 });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

describe("create-agent-plugin.js", () => {
  it("scaffolds a plugin from flags", () => {
    const r = run(["my-agent", "--description", "Does things", "--model", "opus", "--tools", "Read,Write", "--json"]);
    expect(r.exitCode).toBe(0);
    const dir = join(root, ".claude", "agent-plugins", "my-agent");
    expect(existsSync(join(dir, "plugin.json"))).toBe(true);
    expect(existsSync(join(dir, "agent.md"))).toBe(true);
    expect(existsSync(join(dir, "tests", "plugin.test.json"))).toBe(true);
    const fm = readFileSync(join(dir, "agent.md"), "utf-8");
    expect(fm).toContain("name: my-agent");
    expect(fm).toContain("model: opus");
  });

  it("rejects a non-kebab name (exit 2)", () => {
    expect(run(["Bad_Name", "--description", "x"]).exitCode).toBe(2);
  });

  it("refuses to overwrite without --force (exit 1)", () => {
    run(["dup", "--description", "x"]);
    expect(run(["dup", "--description", "x"]).exitCode).toBe(1);
  });

  it("scaffolds the new plugin so it passes validation", () => {
    run(["clean-agent", "--description", "A clean agent for the test"]);
    const validator = join(__dirname, "..", "validate-agent-plugin.js");
    const dir = join(root, ".claude", "agent-plugins", "clean-agent");
    const out = execFileSync("node", [validator, "--dir", dir, "--json"], { encoding: "utf-8" });
    expect(JSON.parse(out).ok).toBe(true);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/create-agent-plugin.test.js`
Expected: FAIL — script not found.

**Step 3: Implement `scripts/create-agent-plugin.js`**

```js
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
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const VALID_MODELS = ["opus", "sonnet", "haiku"];

function parseArgs(argv) {
  const out = { name: null, description: null, model: "sonnet", tools: "Read, Write", withHooks: false, force: false, json: false, root: resolve(__dirname, "..") };
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
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else if (a.startsWith("--")) { console.error(`Unknown argument: ${a}`); printHelp(); process.exit(2); }
    else positional.push(a);
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
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

function manifest(name, description, withHooks) {
  const m = { name, version: "0.1.0", description, agent: "agent.md", tests: "tests/plugin.test.json" };
  if (withHooks) m.hooks = { preInstall: "hooks/pre-install.sh", postInstall: "hooks/post-install.sh" };
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

const TESTS = JSON.stringify({
  assert: [
    "manifest.valid",
    "frontmatter.has(name,description,tools)",
    "frontmatter.model in (opus,sonnet,haiku)",
    "deps.resolve",
    "hooks.executable",
    "prompt.section('When to Use This Agent')",
    "description.examples >= 2",
  ],
}, null, 2) + "\n";

const HOOK_STUB = `#!/usr/bin/env bash
set -u
trap 'exit 0' ERR
# PLUGIN_NAME, PLUGIN_DIR, PLUGIN_VERSION are available in the environment.
echo "hook for \${PLUGIN_NAME}"
exit 0
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let name = args.name;
  if (!name && !args.json) name = await ask("Plugin name (kebab-case): ");
  if (!name) { console.error("A plugin name is required."); process.exit(2); }
  if (!NAME_RE.test(name)) { console.error(`✗ Invalid name "${name}". Use kebab-case: ^[a-z][a-z0-9-]*$`); process.exit(2); }

  let description = args.description;
  if (!description && !args.json) description = await ask("Description: ");
  if (!description) description = `The ${name} agent`;

  if (!VALID_MODELS.includes(args.model)) { console.error(`✗ Invalid model "${args.model}"`); process.exit(2); }

  const dir = join(args.root, ".claude", "agent-plugins", name);
  if (existsSync(dir) && !args.force) {
    if (args.json) console.log(JSON.stringify({ ok: false, error: "exists" }));
    else console.error(`✗ Plugin "${name}" already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "plugin.json"), manifest(name, description, args.withHooks));
  writeFileSync(join(dir, "agent.md"), agentMd(name, description, args.model, args.tools));
  writeFileSync(join(dir, "tests", "plugin.test.json"), TESTS);
  if (args.withHooks) {
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(join(dir, "hooks", "pre-install.sh"), HOOK_STUB);
    writeFileSync(join(dir, "hooks", "post-install.sh"), HOOK_STUB);
  }

  if (args.json) console.log(JSON.stringify({ ok: true, name, dir }, null, 2));
  else console.log(`✓ Created plugin "${name}" at ${dir}`);
  process.exit(0);
}

main().catch((e) => { console.error(`✗ ${e.stack ?? e.message}`); process.exit(2); });
```

**Step 4: Create `scripts/create-agent-plugin.sh`** (same wrapper pattern as Task 6 Step 4, pointing at `create-agent-plugin.js`).

**Step 5: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/create-agent-plugin.test.js`
Expected: PASS.

**Step 6: Commit**

```bash
git add scripts/create-agent-plugin.js scripts/create-agent-plugin.sh scripts/__tests__/create-agent-plugin.test.js
git commit -m "feat(plugins): add scaffolding CLI for new agent plugins"
```

---

### Task 9: `test-agent-plugin.js` (assertion runner)

**Files:**
- Create: `scripts/test-agent-plugin.js`
- Create: `scripts/test-agent-plugin.sh`
- Test: `scripts/__tests__/test-agent-plugin.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "test-agent-plugin.js");
const FIX = join(__dirname, "fixtures", "agent-plugins");

function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8", timeout: 30000 });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

describe("test-agent-plugin.js", () => {
  it("passes all assertions for a valid plugin", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--json"]);
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.results.every((a) => a.pass)).toBe(true);
  });

  it("fails when an assertion is not met (name-mismatch)", () => {
    // name-mismatch has no tests/plugin.test.json; pass an inline default set instead.
    const r = run(["--dir", join(FIX, "name-mismatch"), "--json"]);
    expect([1, 2]).toContain(r.exitCode);
  });

  it("errors on an unknown assertion string (exit 2)", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--assert", "bogus.thing", "--json"]);
    expect(r.exitCode).toBe(2);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/__tests__/test-agent-plugin.test.js`
Expected: FAIL — script not found.

**Step 3: Implement `scripts/test-agent-plugin.js`**

```js
#!/usr/bin/env node
/**
 * test-agent-plugin.js — Run a plugin's static/structural assertions from
 * tests/plugin.test.json (or an inline --assert). Each assertion is a pure,
 * deterministic predicate over the plugin's files — no Claude invocation.
 *
 * Usage:
 *   node scripts/test-agent-plugin.js --dir <plugin-dir> [--json]
 *   node scripts/test-agent-plugin.js --all [--json]
 *   node scripts/test-agent-plugin.js --dir <d> --assert "manifest.valid" [--assert ...]
 *
 * Exit codes: 0 all pass · 1 a failure · 2 usage/IO/unknown-assertion error
 */
import { readFileSync, existsSync, readdirSync, statSync, accessSync, constants } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { parseFrontmatter, loadManifest, buildCatalog, resolveDependencies, countExamples } from "./agent-plugin-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const PLUGINS_ROOT = join(repoRoot, ".claude", "agent-plugins");
const VALIDATOR = join(__dirname, "validate-agent-plugin.js");

function parseArgs(argv) {
  const out = { dir: null, all: false, json: false, asserts: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = resolve(argv[++i]);
    else if (a === "--all") out.all = true;
    else if (a === "--json") out.json = true;
    else if (a === "--assert") out.asserts.push(argv[++i]);
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else { console.error(`Unknown argument: ${a}`); printHelp(); process.exit(2); }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/test-agent-plugin.js (--dir <plugin-dir> | --all) [--assert "..."] [--json]`);
}

// --- Assertion predicates. Each returns { pass, detail }. ---
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
      return { pass: false, detail: "validate-agent-plugin reported issues" };
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
      try { accessSync(p, constants.R_OK); } catch { return { pass: false, detail: `unreadable hook ${rel}` }; }
    }
    return { pass: true };
  },
  "description.examples >= 2": (ctx) => {
    const n = countExamples(ctx.agent.frontmatter.description || "");
    return { pass: n >= 2, detail: `found ${n} example(s)` };
  },
};

// Parametrised assertion families.
function evalAssertion(str, ctx) {
  if (PREDICATES[str]) return PREDICATES[str](ctx);

  let m = str.match(/^frontmatter\.has\(([^)]*)\)$/);
  if (m) {
    const fields = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const missing = fields.filter((f) => !ctx.agent.frontmatter[f]);
    return { pass: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : "" };
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
    return { pass: re.test(ctx.agent.body), detail: re.test(ctx.agent.body) ? "" : `no section "${heading}"` };
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
  if (!args.dir && !args.all) { printHelp(); process.exit(2); }
  const catalog = buildCatalog(PLUGINS_ROOT);

  let dirs;
  if (args.all) {
    dirs = existsSync(PLUGINS_ROOT)
      ? readdirSync(PLUGINS_ROOT).map((d) => join(PLUGINS_ROOT, d)).filter((d) => statSync(d).isDirectory() && existsSync(join(d, "plugin.json")))
      : [];
  } else {
    if (!existsSync(join(args.dir, "plugin.json"))) { console.error(`✗ No plugin.json in ${args.dir}`); process.exit(2); }
    dirs = [args.dir];
    const m = loadManifest(args.dir);
    if (!catalog[m.name]) catalog[m.name] = { version: m.version, dir: args.dir, manifest: m, deps: m.dependencies?.agents ?? {} };
  }

  const reports = [];
  for (const d of dirs) {
    try { reports.push(runPlugin(d, catalog, args.asserts)); }
    catch (e) { reports.push({ name: basename(d), ok: false, error: e.message, results: [] }); }
  }

  const anyUnknown = reports.some((r) => r.unknown);
  const ok = reports.every((r) => r.ok);

  if (args.json) {
    console.log(JSON.stringify({ ok, results: reports.flatMap((r) => r.results), reports }, null, 2));
  } else {
    for (const r of reports) {
      if (r.error) { console.log(`✗ ${r.name}: ${r.error}`); continue; }
      console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
      for (const a of r.results) console.log(`    ${a.pass ? "✓" : "✗"} ${a.assert}${a.detail ? ` — ${a.detail}` : ""}`);
    }
  }
  if (anyUnknown) process.exit(2);
  process.exit(ok ? 0 : 1);
}

main();
```

**Step 4: Create `scripts/test-agent-plugin.sh`** (wrapper pattern, pointing at `test-agent-plugin.js`).

**Step 5: Run to verify pass**

Run: `pnpm vitest run scripts/__tests__/test-agent-plugin.test.js`
Expected: PASS.

**Step 6: Commit**

```bash
git add scripts/test-agent-plugin.js scripts/test-agent-plugin.sh scripts/__tests__/test-agent-plugin.test.js
git commit -m "feat(plugins): add static assertion test runner"
```

---

### Task 10: Full suite + end-to-end smoke

**Step 1: Run the whole new test set**

Run: `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js scripts/__tests__/agent-plugin-schema.test.js scripts/__tests__/validate-agent-plugin.test.js scripts/__tests__/agent-registry.test.js scripts/__tests__/create-agent-plugin.test.js scripts/__tests__/test-agent-plugin.test.js`
Expected: all PASS.

**Step 2: Manual end-to-end against a temp root**

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.claude/agents"
node scripts/create-agent-plugin.js demo-agent --description "A demo agent" --root "$TMP"
node scripts/validate-agent-plugin.js --dir "$TMP/.claude/agent-plugins/demo-agent"
node scripts/test-agent-plugin.js --dir "$TMP/.claude/agent-plugins/demo-agent"
node scripts/agent-registry.js install demo-agent --root "$TMP"
test -f "$TMP/.claude/agents/demo-agent.md" && echo "INSTALL OK"
node scripts/agent-registry.js uninstall demo-agent --root "$TMP"
rm -rf "$TMP"
```
Expected: create/validate/test/install/uninstall all succeed; "INSTALL OK" prints.

No commit (verification only).

---

### Task 11: Documentation

**Files:**
- Create: `docs/guides/agent-plugins.md`
- Modify: `scripts/README.md`
- Modify: `CLAUDE.md` (Development Scripts section + the script count in the footer line)

**Step 1: Write `docs/guides/agent-plugins.md`** — cover: what a plugin is, directory layout, `plugin.json` field reference (link the schema), the four CLIs with examples, the management-lifecycle hooks and their env vars, the assertion catalog, and the dependency model (agents versioned; skills/tools existence-checked).

**Step 2: Update `scripts/README.md`** — add entries for `create-agent-plugin`, `agent-registry`, `validate-agent-plugin`, `test-agent-plugin`, `agent-plugin-lib`.

**Step 3: Update `CLAUDE.md`** — add a "Quick Command Reference" block:

```bash
node scripts/create-agent-plugin.js <name> [--description ...] [--model ...] [--tools ...] [--with-hooks]
node scripts/validate-agent-plugin.js --dir <plugin-dir> | --all
node scripts/agent-registry.js list | resolve <name> | install <name> | uninstall <name>
node scripts/test-agent-plugin.js --dir <plugin-dir> | --all
```

Update the footer line's script count (recount `scripts/*.{js,sh}` after this work). Note: agent/skill counts are unchanged — these are tooling scripts, so `check-doc-counts.sh` is unaffected.

**Step 4: Verify doc counts still pass**

Run: `bash scripts/check-doc-counts.sh`
Expected: exit 0 (agent/skill counts unaffected).

**Step 5: Commit**

```bash
git add docs/guides/agent-plugins.md scripts/README.md CLAUDE.md
git commit -m "docs(plugins): document the agent plugin system"
```

---

### Task 12: Wire into `verify-all.sh` (optional but recommended)

**Files:**
- Modify: `scripts/verify-all.sh`
- Test: `scripts/__tests__/verify-all.test.js` (extend if it enumerates checks)

**Step 1:** Add a check that runs `node scripts/validate-agent-plugin.js --all` and `node scripts/test-agent-plugin.js --all`, but **only if** `.claude/agent-plugins/` exists and is non-empty (so the check is a no-op/pass on repos with no plugins).

**Step 2:** Run: `bash scripts/verify-all.sh` — expected: passes, new check reported (or skipped when no plugins).

**Step 3: Commit**

```bash
git add scripts/verify-all.sh scripts/__tests__/verify-all.test.js
git commit -m "ci(plugins): include plugin validation + tests in verify-all"
```

---

## Final verification checklist

- [ ] `pnpm vitest run scripts/__tests__/agent-plugin-lib.test.js scripts/__tests__/agent-plugin-schema.test.js scripts/__tests__/validate-agent-plugin.test.js scripts/__tests__/agent-registry.test.js scripts/__tests__/create-agent-plugin.test.js scripts/__tests__/test-agent-plugin.test.js` — all pass
- [ ] Manual end-to-end (Task 10 Step 2) succeeds
- [ ] `bash scripts/check-doc-counts.sh` — exit 0
- [ ] `bash scripts/verify-all.sh` — exit 0
- [ ] No real `.claude/agents/` files were modified by tests (all used temp roots)
- [ ] `git status` clean except intended files
