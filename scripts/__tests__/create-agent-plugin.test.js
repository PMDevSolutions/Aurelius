import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "create-agent-plugin.js");
const VALIDATOR = join(__dirname, "..", "validate-agent-plugin.js");

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "create-"));
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

function validate(name) {
  const dir = join(root, ".claude", "agent-plugins", name);
  const out = execFileSync("node", [VALIDATOR, "--dir", dir, "--json"], { encoding: "utf-8" });
  return JSON.parse(out);
}

describe("create-agent-plugin.js", () => {
  it("scaffolds a plugin from flags (tools normalized to comma-space)", () => {
    const r = run([
      "my-agent",
      "--description",
      "Does things",
      "--model",
      "opus",
      "--tools",
      "Read,Write",
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const dir = join(root, ".claude", "agent-plugins", "my-agent");
    expect(existsSync(join(dir, "plugin.json"))).toBe(true);
    expect(existsSync(join(dir, "agent.md"))).toBe(true);
    expect(existsSync(join(dir, "tests", "plugin.test.json"))).toBe(true);
    const fm = readFileSync(join(dir, "agent.md"), "utf-8");
    expect(fm).toContain("name: my-agent");
    expect(fm).toContain("model: opus");
    expect(fm).toContain("tools: Read, Write");
  });

  it("rejects a non-kebab name (exit 2)", () => {
    expect(run(["Bad_Name", "--description", "x"]).exitCode).toBe(2);
  });

  it("rejects an invalid model (exit 2)", () => {
    expect(run(["ok-name", "--description", "x", "--model", "gpt"]).exitCode).toBe(2);
  });

  it("exits 2 (does not hang) when no name is given in non-interactive mode", () => {
    expect(run(["--description", "x"]).exitCode).toBe(2);
  });

  it("refuses to overwrite without --force (exit 1)", () => {
    run(["dup", "--description", "x"]);
    expect(run(["dup", "--description", "x"]).exitCode).toBe(1);
  });

  it("overwrites an existing plugin with --force (exit 0)", () => {
    run(["dup", "--description", "first"]);
    const r = run(["dup", "--description", "second", "--force", "--json"]);
    expect(r.exitCode).toBe(0);
    const fm = readFileSync(join(root, ".claude", "agent-plugins", "dup", "agent.md"), "utf-8");
    expect(fm).toContain("second");
  });

  it("scaffolds hook stubs and a hooks manifest block with --with-hooks", () => {
    const r = run(["hooked-agent", "--description", "Has hooks", "--with-hooks", "--json"]);
    expect(r.exitCode).toBe(0);
    const dir = join(root, ".claude", "agent-plugins", "hooked-agent");
    expect(existsSync(join(dir, "hooks", "pre-install.sh"))).toBe(true);
    expect(existsSync(join(dir, "hooks", "post-install.sh"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf-8"));
    expect(manifest.hooks.preInstall).toBe("hooks/pre-install.sh");
  });

  it("scaffolds a plugin that passes validation", () => {
    run(["clean-agent", "--description", "A clean agent for the test"]);
    expect(validate("clean-agent").ok).toBe(true);
  });

  it("keeps a --with-hooks plugin valid", () => {
    run(["hooked-valid", "--description", "Hooked and valid", "--with-hooks"]);
    expect(validate("hooked-valid").ok).toBe(true);
  });
});
