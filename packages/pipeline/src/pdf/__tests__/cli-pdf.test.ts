import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../indesign/cli.js";
import { resolveSource } from "../../source.js";
import * as fx from "./pdf-fixtures.js";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pdf-cli-"));
  tempDirs.push(dir);
  return dir;
}
function writePdf(buffer: Uint8Array, name = "doc.pdf"): string {
  const path = join(tempDir(), name);
  writeFileSync(path, buffer);
  return path;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("CLI — PDF as a primary input", () => {
  it("parses a .pdf and prints a PDF IR report with fidelity warnings", async () => {
    const path = writePdf(await fx.textHeavyPdf());
    const result = await runCli([path]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("InDesign PDF → IR");
    expect(result.stdout).toContain("paragraph styles:");
    expect(result.stderr).toContain("warning(s)");
  });

  it("runs PDF → IR → tokens end-to-end with image extraction", async () => {
    const dir = tempDir();
    const path = join(dir, "brochure.pdf");
    writeFileSync(path, await fx.brochurePdf());
    const out = join(dir, "tokens");
    const assets = join(dir, "assets");

    const result = await runCli([path, "--emit-tokens", out, "--assets", assets]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Design Tokens");
    expect(existsSync(join(out, "tokens.ts"))).toBe(true);
    expect(existsSync(join(out, "tailwind.preset.ts"))).toBe(true);
    expect(readdirSync(assets).some((f) => f.endsWith(".png"))).toBe(true);
  });

  it("emits the PDF IR as JSON", async () => {
    const path = writePdf(await fx.textHeavyPdf());
    const result = await runCli([path, "--json"]);
    const doc = JSON.parse(result.stdout);
    expect(doc.meta.source).toBe("pdf");
    expect(doc.spreads).toHaveLength(1);
  });

  it("rejects an invalid --source-priority", async () => {
    const result = await runCli(["x.pdf", "--source-priority", "docx"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Invalid --source-priority");
  });
});

describe("resolveSource", () => {
  it("detects the source by extension", () => {
    expect(resolveSource("/docs/a.pdf").kind).toBe("pdf");
    expect(resolveSource("/docs/a.idml").kind).toBe("idml");
  });

  it("honors --source-priority when both siblings exist", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "doc.pdf"), new Uint8Array([1]));
    writeFileSync(join(dir, "doc.idml"), new Uint8Array([1]));
    expect(resolveSource(join(dir, "doc.idml"), "pdf").kind).toBe("pdf");
    expect(resolveSource(join(dir, "doc.pdf"), "idml").kind).toBe("idml");
    expect(resolveSource(join(dir, "doc.pdf"), "auto").kind).toBe("pdf");
  });
});
