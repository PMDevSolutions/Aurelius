import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "create-agent-plugin.js");

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

describe("create-agent-plugin.js", () => {
  it("scaffolds a plugin from flags", () => {
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
