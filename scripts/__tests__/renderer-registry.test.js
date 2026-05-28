import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "renderer-registry.js");
const RENDERERS_ROOT = join(__dirname, "fixtures", "renderers");
const PROJ = (name) => join(__dirname, "fixtures", "projects", name);

function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args, "--renderers-root", RENDERERS_ROOT], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return { stdout, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.status };
  }
}

/** Run without auto-appending --renderers-root, for arg-parsing edge cases. */
function runRaw(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 30000,
    });
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

  it("detects nextjs from a next.config.ts project", () => {
    const r = run(["detect", PROJ("nextjs-proj"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).renderer).toBe("nextjs");
  });

  it("detects vite from a vite.config.ts project", () => {
    const r = run(["detect", PROJ("vite-proj"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).renderer).toBe("vite");
  });

  it("resolves an ambiguous project to the higher-priority renderer (nextjs)", () => {
    const r = run(["detect", PROJ("ambiguous-proj"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).renderer).toBe("nextjs");
  });

  it("detects nothing in an empty project (renderer null, exit 0)", () => {
    const r = run(["detect", PROJ("empty-proj"), "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).renderer).toBeNull();
  });

  it("exits 2 when --renderers-root is the last arg with no value", () => {
    const r = runRaw(["resolve", "nextjs", "--renderers-root"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/missing value/i);
  });

  it("breaks priority ties by name ascending (deterministic detect)", () => {
    // Two renderers at equal priority, both matching the same config file.
    // The alphabetically-first name must win regardless of scan order.
    const tmpRoot = mkdtempSync(join(tmpdir(), "rend-tie-"));
    try {
      const renderersRoot = join(tmpRoot, "renderers");
      const mk = (name) => {
        const dir = join(renderersRoot, name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, "renderer.json"),
          JSON.stringify({
            name,
            language: "react",
            detect: { configFiles: ["shared.config.*"], dependencies: [], priority: 5 },
          }),
        );
      };
      // Create in non-alphabetical order to prove sorting, not insertion order.
      mk("zeta");
      mk("alpha");

      const proj = join(tmpRoot, "proj");
      mkdirSync(proj, { recursive: true });
      writeFileSync(join(proj, "shared.config.ts"), "");

      const stdout = execFileSync(
        "node",
        [SCRIPT, "detect", proj, "--json", "--renderers-root", renderersRoot],
        { encoding: "utf-8", timeout: 30000 },
      );
      expect(JSON.parse(stdout).renderer).toBe("alpha");
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
