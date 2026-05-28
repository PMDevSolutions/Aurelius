import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, writeFileSync } from "fs";
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

function run(args, env = {}) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args, "--root", root], {
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, ...env },
    });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

const HOOKED_AGENT_MD = `---
name: hooked
description: A hooked agent. <example>Context: a user: 'x' assistant: 'y'</example> <example>Context: b user: 'p' assistant: 'q'</example>
tools: Read
model: sonnet
---

## When to Use This Agent

In hook tests.
`;

function writeHookedPlugin() {
  const dir = join(pluginsRoot, "hooked");
  mkdirSync(join(dir, "hooks"), { recursive: true });
  writeFileSync(
    join(dir, "plugin.json"),
    JSON.stringify({
      name: "hooked",
      version: "1.0.0",
      description: "hooked agent",
      hooks: { preInstall: "hooks/pre-install.sh", postInstall: "hooks/post-install.sh" },
    }),
  );
  writeFileSync(join(dir, "agent.md"), HOOKED_AGENT_MD);
  writeFileSync(
    join(dir, "hooks", "pre-install.sh"),
    '#!/usr/bin/env bash\nif [ "${FAIL_PRE:-0}" = "1" ]; then echo pre-fail; exit 1; fi\nexit 0\n',
  );
  writeFileSync(
    join(dir, "hooks", "post-install.sh"),
    '#!/usr/bin/env bash\nif [ "${FAIL_POST:-0}" = "1" ]; then echo post-fail; exit 1; fi\nexit 0\n',
  );
}

describe("agent-registry.js", () => {
  it("lists available plugins", () => {
    const r = run(["list", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(
      JSON.parse(r.stdout)
        .plugins.map((p) => p.name)
        .sort(),
    ).toEqual(["depends-on-base", "valid-base"]);
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

  it("allows uninstall of a depended-on plugin with --force", () => {
    run(["install", "depends-on-base"]);
    const r = run(["uninstall", "valid-base", "--force", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, ".claude", "agents", "valid-base.md"))).toBe(false);
  });

  it("exits 1 when uninstalling a plugin that is not installed", () => {
    const r = run(["uninstall", "valid-base", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/not installed/i);
  });

  it("aborts install when the preInstall hook fails (exit 1, no agent copied)", () => {
    writeHookedPlugin();
    const r = run(["install", "hooked", "--json"], { FAIL_PRE: "1" });
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(root, ".claude", "agents", "hooked.md"))).toBe(false);
  });

  it("install succeeds when the postInstall hook fails (warn-only, exit 0)", () => {
    writeHookedPlugin();
    const r = run(["install", "hooked", "--json"], { FAIL_POST: "1" });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(root, ".claude", "agents", "hooked.md"))).toBe(true);
  });

  it("skips an already-installed plugin without re-running its preInstall hook", () => {
    writeHookedPlugin();
    expect(run(["install", "hooked"]).exitCode).toBe(0);
    const r = run(["install", "hooked", "--json"], { FAIL_PRE: "1" });
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).actions.every((a) => a.skipped)).toBe(true);
  });

  it("reports malformed installed.json as an IO error (exit 2)", () => {
    writeFileSync(join(pluginsRoot, "installed.json"), "{ broken json");
    const r = run(["install", "valid-base", "--json"]);
    expect(r.exitCode).toBe(2);
  });
});
