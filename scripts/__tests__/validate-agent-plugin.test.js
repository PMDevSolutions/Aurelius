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
