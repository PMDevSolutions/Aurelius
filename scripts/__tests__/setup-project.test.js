import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "setup-project.sh");
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * Tests for setup-project.sh
 *
 * These exercise the non-destructive paths only: --help and --dry-run. The
 * --dry-run path resolves the renderer (validating it against the registry and
 * reading manifest.template) and prints the scaffold plan without invoking any
 * `pnpm create` / network calls, which keeps the test hermetic and fast.
 */
function run(args = []) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 60000,
      cwd: PROJECT_ROOT,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || "", stderr: err.stderr || "", exitCode: err.status };
  }
}

describe("setup-project.sh", () => {
  it("--help documents --renderer and lists registry renderers", () => {
    const r = run(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/--renderer <name>/);
    // The renderer list is sourced from the registry.
    expect(r.stdout).toMatch(/Available renderers:.*astro/);
    expect(r.stdout).toMatch(/Available renderers:.*nextjs/);
  });

  it("--renderer astro resolves to the astro template via the registry", () => {
    const r = run(["my-app", "--renderer", "astro", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Renderer: astro/);
    expect(r.stdout).toMatch(/template:\s+templates\/astro/);
    // Dry-run must not create anything.
    expect(r.stdout).toMatch(/\[dry-run\] No project created/);
  });

  it("--next alias maps to the nextjs renderer", () => {
    const r = run(["my-app", "--next", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Renderer: nextjs/);
    expect(r.stdout).toMatch(/template:\s+templates\/nextjs/);
  });

  it("--svelte alias maps to the sveltekit renderer", () => {
    const r = run(["my-app", "--svelte", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Renderer: sveltekit/);
    expect(r.stdout).toMatch(/template:\s+templates\/sveltekit/);
  });

  it("--astro alias maps to the astro renderer", () => {
    const r = run(["my-app", "--astro", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Renderer: astro/);
    expect(r.stdout).toMatch(/template:\s+templates\/astro/);
  });

  it("exits non-zero on an unknown renderer", () => {
    const r = run(["my-app", "--renderer", "does-not-exist", "--dry-run"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/unknown renderer/i);
  });

  describe.each(["--vite", "--react"])("%s tooling", (flag) => {
    const tooling = () => {
      const r = run(["my-app", flag, "--dry-run"]);
      expect(r.exitCode).toBe(0);
      return r.stdout.match(/tooling:\s+(.*)/)[1].split(" ");
    };
    const names = (deps) => deps.map((dep) => dep.replace(/(?<=.)@.*$/, ""));
    const versionOf = (deps, name) =>
      deps
        .find((dep) => dep.startsWith(`${name}@`))
        ?.split("@")
        .pop();

    it("installs every package the shared ESLint config imports", () => {
      const config = readFileSync(join(PROJECT_ROOT, "templates/shared/eslint.config.js"), "utf-8");
      const imports = [...config.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      expect(imports.length).toBeGreaterThan(0);
      expect(names(tooling())).toEqual(expect.arrayContaining(["eslint", ...imports]));
    });

    it("installs every plugin the shared Prettier config lists", () => {
      const config = readFileSync(
        join(PROJECT_ROOT, "templates/shared/prettier.config.js"),
        "utf-8",
      );
      const plugins = [...config.match(/plugins: \[(.*)\]/)[1].matchAll(/"([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(plugins.length).toBeGreaterThan(0);
      expect(names(tooling())).toEqual(expect.arrayContaining(["prettier", ...plugins]));
    });

    it("pins vitest and its coverage provider to the same version", () => {
      const deps = tooling();
      expect(versionOf(deps, "vitest")).toBeTruthy();
      expect(versionOf(deps, "@vitest/coverage-v8")).toBe(versionOf(deps, "vitest"));
    });

    it("keeps ESLint on a major the a11y and React plugins accept", () => {
      expect(versionOf(tooling(), "eslint")).toBe("^9");
    });
  });

  it("gives the Vite app the files its vitest config and own pnpm root need", () => {
    const vite = join(PROJECT_ROOT, "templates/vite");
    const vitest = readFileSync(join(vite, "vitest.config.ts.tpl"), "utf-8");
    expect(vitest).toContain("./src/test/setup.ts");
    expect(vitest).not.toContain("__dirname");
    expect(readFileSync(join(vite, "src/test/setup.ts"), "utf-8")).toContain("jest-dom");
    expect(readFileSync(join(vite, "src/App.test.tsx"), "utf-8")).toContain("App");
    expect(readFileSync(join(vite, "pnpm-workspace.yaml"), "utf-8")).not.toMatch(/^packages:/m);
  });

  it("preserves the legacy --react path (no registry renderer)", () => {
    const r = run(["my-app", "--react", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Framework: react/);
    expect(r.stdout).toMatch(/template:\s+templates\/vite/);
  });
});
