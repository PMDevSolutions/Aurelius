import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import { buildIdml, buildSampleIdml, sampleFiles } from "./idml-fixtures.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "idml-tok-"));
  tempDirs.push(dir);
  return dir;
}

function writeIdml(buffer: Uint8Array): string {
  const dir = tempDir();
  const path = join(dir, "sample.idml");
  writeFileSync(path, buffer);
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const UNMAPPED_FONTS = `<?xml version="1.0"?>
<idPkg:Fonts xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <FontFamily Self="ff-x" Name="Bricolage Grotesque">
    <Font Self="f-x" FontFamily="Bricolage Grotesque" Name="Bricolage Grotesque Regular" Status="Installed" FontStyleName="Regular" />
  </FontFamily>
</idPkg:Fonts>`;

describe("runCli --emit-tokens", () => {
  it("writes all four token artifacts and prints a report", async () => {
    const idml = writeIdml(buildSampleIdml());
    const out = tempDir();
    const result = await runCli([idml, "--emit-tokens", out]);

    expect(result.code).toBe(0);
    expect(existsSync(join(out, "tokens.ts"))).toBe(true);
    expect(existsSync(join(out, "tokens.css"))).toBe(true);
    expect(existsSync(join(out, "tailwind.preset.ts"))).toBe(true);
    expect(existsSync(join(out, "design-tokens.json"))).toBe(true);

    expect(result.stdout).toContain("InDesign IDML → Design Tokens");
    expect(result.stdout).toContain("colors:");
    expect(readFileSync(join(out, "tokens.ts"), "utf-8")).toContain("as const");
  });

  it("skips the Tailwind preset with --no-tailwind", async () => {
    const idml = writeIdml(buildSampleIdml());
    const out = tempDir();
    const result = await runCli([idml, "--emit-tokens", out, "--no-tailwind"]);

    expect(result.code).toBe(0);
    expect(existsSync(join(out, "tokens.ts"))).toBe(true);
    expect(existsSync(join(out, "tailwind.preset.ts"))).toBe(false);
  });

  it("surfaces font fallback warnings in the report", async () => {
    const files = sampleFiles();
    files["Resources/Fonts.xml"] = UNMAPPED_FONTS;
    const idml = writeIdml(buildIdml(files));
    const out = tempDir();
    const result = await runCli([idml, "--emit-tokens", out]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("FONT_FALLBACK");
    expect(result.stdout).toContain("Bricolage Grotesque");
    expect(result.stdout).toContain("[fallback]");
    expect(result.stderr).toContain("warning(s)");
  });
});
