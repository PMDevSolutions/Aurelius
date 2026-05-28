import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "fs";
import { tmpdir } from "os";
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

function writePlugin(
  root,
  name,
  { examples = 2, section = true, tools = "Read, Write", model = "sonnet" } = {},
) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "plugin.json"),
    JSON.stringify({ name, version: "1.0.0", description: `${name} agent` }),
  );
  const exBlocks = Array.from(
    { length: examples },
    (_, i) => `<example>Context: c${i} user: 'a' assistant: 'b'</example>`,
  ).join(" ");
  const body = section ? "\n## When to Use This Agent\n\nHere.\n" : "\nNo section here.\n";
  writeFileSync(
    join(dir, "agent.md"),
    `---\nname: ${name}\ndescription: Desc. ${exBlocks}\ntools: ${tools}\nmodel: ${model}\n---\n${body}`,
  );
  return dir;
}

describe("test-agent-plugin.js", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tap-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("passes all assertions for a valid plugin", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--json"]);
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.results.every((a) => a.pass)).toBe(true);
  });

  it("fails (exit 1) when the tests file is missing", () => {
    const r = run(["--dir", join(FIX, "name-mismatch"), "--json"]);
    expect(r.exitCode).toBe(1);
  });

  it("errors (exit 2) on an unknown assertion", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--assert", "bogus.thing", "--json"]);
    expect(r.exitCode).toBe(2);
  });

  it("passes an inline --assert that holds", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--assert", "manifest.valid", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("fails prompt.section when the heading is absent", () => {
    writePlugin(tmp, "no-section", { section: false });
    const r = run([
      "--dir",
      join(tmp, "no-section"),
      "--assert",
      "prompt.section('When to Use This Agent')",
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).results[0].pass).toBe(false);
  });

  it("fails description.examples >= 2 with only one example", () => {
    writePlugin(tmp, "one-example", { examples: 1 });
    const r = run([
      "--dir",
      join(tmp, "one-example"),
      "--assert",
      "description.examples >= 2",
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
  });

  it("fails frontmatter.has when a field is missing", () => {
    const dir = join(tmp, "no-tools");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plugin.json"),
      JSON.stringify({ name: "no-tools", version: "1.0.0", description: "x" }),
    );
    writeFileSync(
      join(dir, "agent.md"),
      "---\nname: no-tools\ndescription: D. <example>a</example> <example>b</example>\nmodel: sonnet\n---\n\n## When to Use This Agent\n\nx\n",
    );
    const r = run(["--dir", dir, "--assert", "frontmatter.has(name,description,tools)", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(JSON.parse(r.stdout).results)).toMatch(/tools/);
  });

  it("rejects --dir and --all together (exit 2)", () => {
    const r = run(["--dir", join(FIX, "valid-base"), "--all"]);
    expect(r.exitCode).toBe(2);
  });

  it("tests every plugin under --plugins-root", () => {
    cpSync(join(FIX, "valid-base"), join(tmp, "valid-base"), { recursive: true });
    const r = run(["--all", "--plugins-root", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("passes frontmatter.<field> in (...) when the value is allowed", () => {
    const r = run([
      "--dir",
      join(FIX, "valid-base"),
      "--assert",
      "frontmatter.model in (opus,sonnet,haiku)",
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
  });

  it("fails frontmatter.<field> in (...) when the value is not allowed", () => {
    const r = run([
      "--dir",
      join(FIX, "valid-base"),
      "--assert",
      "frontmatter.model in (opus,haiku)",
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
  });

  it("passes frontmatter.<field> in (...) when the field is unset", () => {
    const r = run([
      "--dir",
      join(FIX, "valid-base"),
      "--assert",
      "frontmatter.permissionMode in (default,plan)",
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
  });

  it("fails deps.resolve for a missing dependency", () => {
    const r = run(["--dir", join(FIX, "missing-dep"), "--assert", "deps.resolve", "--json"]);
    expect(r.exitCode).toBe(1);
  });

  it("fails hooks.executable when a declared hook is absent", () => {
    const dir = join(tmp, "bad-hook");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plugin.json"),
      JSON.stringify({
        name: "bad-hook",
        version: "1.0.0",
        description: "x",
        hooks: { preInstall: "hooks/nope.sh" },
      }),
    );
    writeFileSync(
      join(dir, "agent.md"),
      "---\nname: bad-hook\ndescription: D. <example>a</example> <example>b</example>\ntools: Read\nmodel: sonnet\n---\n\n## When to Use This Agent\n\nx\n",
    );
    const r = run(["--dir", dir, "--assert", "hooks.executable", "--json"]);
    expect(r.exitCode).toBe(1);
  });

  it("forces exit 2 under --all when one plugin has an unknown assertion", () => {
    cpSync(join(FIX, "valid-base"), join(tmp, "valid-base"), { recursive: true });
    const weird = join(tmp, "weird");
    mkdirSync(join(weird, "tests"), { recursive: true });
    writeFileSync(
      join(weird, "plugin.json"),
      JSON.stringify({ name: "weird", version: "1.0.0", description: "x" }),
    );
    writeFileSync(
      join(weird, "agent.md"),
      "---\nname: weird\ndescription: D. <example>a</example> <example>b</example>\ntools: Read\nmodel: sonnet\n---\n\n## When to Use This Agent\n\nx\n",
    );
    writeFileSync(
      join(weird, "tests", "plugin.test.json"),
      JSON.stringify({ assert: ["bogus.assertion"] }),
    );
    const r = run(["--all", "--plugins-root", tmp, "--json"]);
    expect(r.exitCode).toBe(2);
  });
});
