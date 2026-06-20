import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatReport, runCli } from "../cli.js";
import { parseIdml } from "../parser.js";
import { buildIdml, buildSampleIdml, sampleFiles } from "./idml-fixtures.js";

const tempDirs: string[] = [];

function writeIdml(buffer: Uint8Array, name = "sample.idml"): string {
  const dir = mkdtempSync(join(tmpdir(), "idml-cli-"));
  tempDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, buffer);
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("runCli", () => {
  it("prints usage and exits 2 when no input is given", async () => {
    const result = await runCli([]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("no input file");
  });

  it("prints help on --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it("exits 1 with an error for a missing file", async () => {
    const result = await runCli([join(tmpdir(), "does-not-exist-xyz.idml")]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Error/);
  });

  it("prints a human-readable report with counts for a valid package", async () => {
    const path = writeIdml(buildSampleIdml());
    const result = await runCli([path]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("InDesign IDML → IR");
    expect(result.stdout).toContain("swatches:          6");
    expect(result.stdout).toContain("Warnings (0)");
  });

  it("surfaces collected parse warnings in the report", async () => {
    const files = sampleFiles();
    delete files["Links/hero.png"];
    const path = writeIdml(buildIdml(files));
    const result = await runCli([path]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("UNRESOLVED_LINK");
    expect(result.stderr).toContain("warning(s)");
  });

  it("emits valid JSON with --json", async () => {
    const path = writeIdml(buildSampleIdml());
    const result = await runCli([path, "--json"]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.dpi).toBe(96);
    expect(Array.isArray(parsed.warnings)).toBe(true);
    expect(parsed.swatches).toHaveLength(6);
  });

  it("rejects an invalid --dpi value", async () => {
    const result = await runCli(["x.idml", "--dpi", "abc"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Invalid --dpi");
  });
});

describe("formatReport", () => {
  it("renders frame type breakdown", () => {
    const { document } = parseIdml(buildSampleIdml());
    const report = formatReport(document);
    // Totals span spreads and master spreads: 1 text + 1 image + 1 master band.
    expect(report).toContain("frames:            3 (text: 1, image: 1, graphic: 1, group: 0)");
    expect(report).toContain("master spreads:    1");
  });
});
