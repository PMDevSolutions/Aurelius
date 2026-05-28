import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "validate-renderer.js");

let root, renderersRoot;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rend-validate-"));
  // Fake repo root: an agents dir with one converter agent, and a template dir.
  mkdirSync(join(root, ".claude", "agents"), { recursive: true });
  writeFileSync(join(root, ".claude", "agents", "figma-react-converter.md"), "# converter\n");
  mkdirSync(join(root, "templates", "nextjs"), { recursive: true });
  renderersRoot = join(root, "renderers");
  mkdirSync(renderersRoot, { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function validManifest(overrides = {}) {
  return {
    name: "nextjs",
    language: "react",
    converter: "figma-react-converter",
    detect: { configFiles: ["next.config.*"], dependencies: ["next"], priority: 10 },
    template: "templates/nextjs",
    component: { ext: ".tsx", dir: "components", pageRouting: "app-router" },
    test: { runner: "vitest", library: "@testing-library/react" },
    commands: { dev: "pnpm dev", build: "pnpm build", test: "pnpm vitest run" },
    ...overrides,
  };
}

function writeRenderer(name, manifest) {
  const dir = join(renderersRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "renderer.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

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

describe("validate-renderer.js", () => {
  it("passes a well-formed renderer", () => {
    const dir = writeRenderer("nextjs", validManifest());
    const r = run(["--dir", dir, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("fails when the converter points at a missing agent (exit 1)", () => {
    const dir = writeRenderer("nextjs", validManifest({ converter: "no-such-agent" }));
    const r = run(["--dir", dir, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
    expect(r.stdout).toMatch(/converter/i);
  });

  it("fails when language is not one of the four (exit 1)", () => {
    const dir = writeRenderer("nextjs", validManifest({ language: "angular" }));
    const r = run(["--dir", dir, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });

  it("fails when manifest name does not match the directory basename (exit 1)", () => {
    const dir = writeRenderer("nextjs", validManifest({ name: "wrong-name" }));
    const r = run(["--dir", dir, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/directory/i);
  });

  it("fails when the template path does not exist (exit 1)", () => {
    const dir = writeRenderer("nextjs", validManifest({ template: "templates/does-not-exist" }));
    const r = run(["--dir", dir, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/template/i);
  });

  it("validates every renderer with --all", () => {
    writeRenderer("nextjs", validManifest());
    writeRenderer("vite", validManifest({ name: "vite", template: "templates/nextjs" }));
    const r = run(["--all", "--renderers-root", renderersRoot, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).count).toBe(2);
  });

  it("exits 2 with no --dir or --all", () => {
    const r = run(["--json"]);
    expect(r.exitCode).toBe(2);
  });

  it("exits 2 when --dir is the last arg with no value", () => {
    // Call directly (no trailing --root) so --dir is genuinely the last arg.
    let exitCode = 0;
    let stderr = "";
    try {
      execFileSync("node", [SCRIPT, "--dir"], { encoding: "utf-8", timeout: 30000 });
    } catch (e) {
      exitCode = e.status;
      stderr = e.stderr || "";
    }
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/missing value/i);
  });
});
