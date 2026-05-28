import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "renderer-registry.js");
const RENDERERS_ROOT = join(__dirname, "fixtures", "renderers");

function run(args) {
  try {
    const stdout = execFileSync(
      "node",
      [SCRIPT, ...args, "--renderers-root", RENDERERS_ROOT],
      { encoding: "utf-8", timeout: 30000 },
    );
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

describe("renderer-registry.js", () => {
  it("lists available renderers sorted by name", () => {
    const r = run(["list", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(
      JSON.parse(r.stdout)
        .renderers.map((x) => x.name)
        .sort(),
    ).toEqual(["nextjs", "vite"]);
  });

  it("resolves a known renderer to its full manifest", () => {
    const r = run(["resolve", "nextjs", "--json"]);
    expect(r.exitCode).toBe(0);
    const manifest = JSON.parse(r.stdout);
    expect(manifest.name).toBe("nextjs");
    expect(manifest.language).toBe("react");
  });

  it("exits 2 on an unknown renderer", () => {
    const r = run(["resolve", "does-not-exist", "--json"]);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toMatch(/unknown renderer/i);
  });
});
