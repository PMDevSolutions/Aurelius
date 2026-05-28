import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
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

const AGENT_MD = `---
name: NAME
description: A test agent. <example>Context: a user: 'x' assistant: 'y'</example> <example>Context: b user: 'p' assistant: 'q'</example>
tools: Read, Write
model: sonnet
---

You are a test agent.

## When to Use This Agent

Only in tests.
`;

function writePlugin(root, name, manifest, { agentName = name } = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "plugin.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  writeFileSync(join(dir, "agent.md"), AGENT_MD.replace("NAME", agentName));
  return dir;
}

describe("validate-agent-plugin.js", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "vap-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("passes a valid plugin (exit 0)", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("fails a name mismatch (exit 1) and points at the frontmatter name", () => {
    const r = run(["--dir", join(FIX, "name-mismatch"), "--json"]);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => i.path === "agent.frontmatter.name")).toBe(true);
  });

  it("resolves sibling agent deps in --dir mode (depends-on-base passes)", () => {
    const r = run(["--dir", join(FIX, "depends-on-base"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("reports a missing agent dependency (exit 1)", () => {
    const r = run(["--dir", join(FIX, "missing-dep"), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(JSON.parse(r.stdout).issues)).toMatch(/ghost/);
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

  it("rejects --dir and --all together (exit 2)", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--all"]);
    expect(r.exitCode).toBe(2);
  });

  it("reports malformed plugin.json as an issue, not a crash", () => {
    writePlugin(tmp, "broken", "{ not valid json");
    const r = run(["--dir", join(tmp, "broken"), "--json"]);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout); // must still be valid JSON
    expect(out.ok).toBe(false);
  });

  it("surfaces the offending property on a schema violation", () => {
    writePlugin(tmp, "extra-key", {
      name: "extra-key",
      version: "1.0.0",
      description: "x",
      bogusKey: true,
    });
    const r = run(["--dir", join(tmp, "extra-key"), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(JSON.parse(r.stdout).issues)).toMatch(/bogusKey/);
  });

  it("flags a missing declared hook", () => {
    writePlugin(tmp, "bad-hook", {
      name: "bad-hook",
      version: "1.0.0",
      description: "x",
      hooks: { preInstall: "hooks/nope.sh" },
    });
    const r = run(["--dir", join(tmp, "bad-hook"), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).issues.some((i) => i.path === "hooks.preInstall")).toBe(true);
  });

  it("flags a missing skill dependency", () => {
    writePlugin(tmp, "bad-skill", {
      name: "bad-skill",
      version: "1.0.0",
      description: "x",
      dependencies: { skills: ["definitely-not-a-real-skill"] },
    });
    const r = run(["--dir", join(tmp, "bad-skill"), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(JSON.parse(r.stdout).issues)).toMatch(/skill not found/);
  });

  it("validates every plugin under --plugins-root and fails if any is invalid", () => {
    writePlugin(tmp, "good-one", { name: "good-one", version: "1.0.0", description: "ok" });
    writePlugin(tmp, "bad-one", {
      name: "bad-one",
      version: "1.0.0",
      description: "x",
      bogusKey: 1,
    });
    const r = run(["--all", "--plugins-root", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.count).toBe(2);
    expect(out.results.find((x) => x.name === "good-one").ok).toBe(true);
    expect(out.results.find((x) => x.name === "bad-one").ok).toBe(false);
  });
});
