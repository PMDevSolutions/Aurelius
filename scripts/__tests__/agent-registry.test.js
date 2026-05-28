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
    const stdout = execFileSync("node", [SCRIPT, ...args, "--root", root], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
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
});
