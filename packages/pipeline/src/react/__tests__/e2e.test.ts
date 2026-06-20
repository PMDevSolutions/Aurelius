/**
 * End-to-end smoke test: run the full `aurelius pipeline indesign` flow against
 * the committed fixture and assert the generated React project builds (strict
 * tsc) and renders (Storybook smoke ≈ server-render) without errors.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPipelineCli } from "../../pipeline-cli.js";
import type { GeneratedFile } from "../model.js";
import { compile, render } from "./compile-harness.js";

const FIXTURE = fileURLToPath(
  new URL("../../../../../tests/fixtures/indesign/sample.idml", import.meta.url),
);

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "idml-e2e-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function readGeneratedTs(dir: string): GeneratedFile[] {
  return readdirSync(dir)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => ({ path: name, contents: readFileSync(join(dir, name), "utf-8") }));
}

describe("aurelius pipeline indesign — end to end", () => {
  it("has a committed IDML fixture", () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });

  it("generates a React project that builds and renders from the committed fixture", async () => {
    const out = join(tempDir(), "indesign");
    const result = await runPipelineCli(["pipeline", "indesign", FIXTURE, "--output", out]);
    expect(result.code).toBe(0);

    // Project tree: components + stories + barrel + token files + reports.
    const files = readdirSync(out);
    expect(files.some((f) => f.endsWith(".tsx") && !f.includes("stories"))).toBe(true);
    expect(files).toContain("index.ts");
    expect(files).toContain("indesign-pipeline-report.md");
    expect(files).toContain("indesign-pipeline-report.json");
    expect(existsSync(join(out, "tokens", "tokens.ts"))).toBe(true);

    // "Builds": the generated TypeScript type-checks under strict React JSX.
    expect(compile(readGeneratedTs(out))).toEqual([]);

    // "Storybook smoke": the component server-renders without runtime errors.
    const component = readdirSync(out).find((f) => f.endsWith(".tsx") && !f.includes("stories"))!;
    const name = component.replace(/\.tsx$/, "");
    const html = render(readFileSync(join(out, component), "utf-8"), name);
    expect(html).toContain("<section");
    expect(html.length).toBeGreaterThan(0);
  });

  it("prints documented usage for --help", async () => {
    const result = await runPipelineCli(["pipeline", "indesign", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("aurelius pipeline indesign");
    expect(result.stdout).toContain("--target");
    expect(result.stdout).toContain("--styling");
  });

  it("emits a machine-readable JSON report with --json", async () => {
    const out = join(tempDir(), "indesign");
    const result = await runPipelineCli([
      "pipeline",
      "indesign",
      FIXTURE,
      "--output",
      out,
      "--json",
    ]);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.source).toBe("idml");
    expect(Array.isArray(report.components)).toBe(true);
    expect(report.components.length).toBeGreaterThan(0);
  });

  it("supports css-modules via --styling", async () => {
    const out = join(tempDir(), "indesign");
    const result = await runPipelineCli([
      "pipeline",
      "indesign",
      FIXTURE,
      "--output",
      out,
      "--styling",
      "css-modules",
    ]);
    expect(result.code).toBe(0);
    expect(readdirSync(out).some((f) => f.endsWith(".module.css"))).toBe(true);
  });
});
