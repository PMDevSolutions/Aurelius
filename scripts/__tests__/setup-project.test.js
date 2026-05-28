import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
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

  it("exits non-zero on an unknown renderer", () => {
    const r = run(["my-app", "--renderer", "does-not-exist", "--dry-run"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/unknown renderer/i);
  });

  it("preserves the legacy --react path (no registry renderer)", () => {
    const r = run(["my-app", "--react", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Framework: react/);
    expect(r.stdout).toMatch(/template:\s+templates\/vite/);
  });
});
