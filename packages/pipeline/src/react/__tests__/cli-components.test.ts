import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSampleIdml } from "../../indesign/__tests__/idml-fixtures.js";
import { runCli } from "../../indesign/cli.js";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gen-cli-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function writeSample(): string {
  const dir = tempDir();
  const path = join(dir, "sample.idml");
  writeFileSync(path, buildSampleIdml());
  return path;
}

describe("CLI --emit-components", () => {
  it("writes components, stories, a barrel, and a report", async () => {
    const idml = writeSample();
    const out = join(tempDir(), "components");
    const result = await runCli([idml, "--emit-components", out]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("InDesign → React Components");
    const files = readdirSync(out);
    expect(files.some((f) => f.endsWith(".tsx") && !f.includes("stories"))).toBe(true);
    expect(files.some((f) => f.endsWith(".stories.tsx"))).toBe(true);
    expect(files).toContain("index.ts");
    expect(files).toContain("indesign-pipeline-report.md");
  });

  it("emits co-located CSS with --style css-modules", async () => {
    const idml = writeSample();
    const out = join(tempDir(), "components");
    const result = await runCli([idml, "--emit-components", out, "--style", "css-modules"]);

    expect(result.code).toBe(0);
    expect(readdirSync(out).some((f) => f.endsWith(".module.css"))).toBe(true);
  });

  it("rejects an invalid --style", async () => {
    const result = await runCli(["x.idml", "--emit-components", "y", "--style", "sass"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Invalid --style");
  });
});
