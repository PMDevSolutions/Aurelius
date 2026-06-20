import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildSampleIdml } from "../../indesign/__tests__/idml-fixtures.js";
import { parseIdml } from "../../indesign/parser.js";
import {
  buildTailwindPreset,
  emitAll,
  emitStyleDictionaryJson,
  emitTailwindPreset,
  emitTokensCss,
  emitTokensTs,
} from "../emit.js";
import { mapDocumentToTokens } from "../mapper.js";
import { safeValidateDesignTokens } from "../schema.js";

const { document } = parseIdml(buildSampleIdml());
const { tokens } = mapDocumentToTokens(document);

/** Type-check a standalone TS source string with strict tsc; returns error messages. */
function typeCheckErrors(source: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "tok-tsc-"));
  const file = join(dir, "tokens.ts");
  writeFileSync(file, source);
  try {
    const program = ts.createProgram([file], {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    });
    return ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("emitTokensTs", () => {
  it("emits a self-contained tokens.ts that type-checks under strict tsc", () => {
    const source = emitTokensTs(tokens);
    expect(source).toContain("as const");
    expect(typeCheckErrors(source)).toEqual([]);
  });

  it("can target a published DesignTokens type via satisfies", () => {
    const source = emitTokensTs(tokens, { typeImport: "@aurelius/pipeline/tokens" });
    expect(source).toContain('import type { DesignTokens } from "@aurelius/pipeline/tokens";');
    expect(source).toContain("satisfies DesignTokens");
  });

  it("produces an object that validates against the published schema", () => {
    expect(safeValidateDesignTokens(tokens).success).toBe(true);
  });
});

describe("emitTokensCss", () => {
  it("emits CSS custom properties under :root", () => {
    const css = emitTokensCss(tokens);
    expect(css).toContain(":root {");
    expect(css).toContain("--color-black: #000000;");
    expect(css).toContain("--font-size-heading: 32px;");
  });
});

describe("Tailwind preset", () => {
  it("exposes every token under theme.extend", () => {
    const preset = buildTailwindPreset(tokens);
    for (const key of Object.keys(tokens.colors)) {
      expect(preset.theme.extend.colors[key]).toBe(tokens.colors[key]);
    }
    for (const key of Object.keys(tokens.fontSizes)) {
      expect(preset.theme.extend.fontSize[key]).toBe(tokens.fontSizes[key]);
    }
    for (const key of Object.keys(tokens.fontFamilies)) {
      expect(preset.theme.extend.fontFamily[key]).toBeDefined();
    }
  });

  it("merges into a fixture config, exposing every token alongside existing theme keys", () => {
    const preset = buildTailwindPreset(tokens);
    const baseColors: Record<string, string> = { brand: "#abcdef" };
    // Mirror Tailwind's preset merge (later presets extend earlier theme.extend).
    const mergedColors: Record<string, string> = { ...baseColors, ...preset.theme.extend.colors };

    expect(mergedColors.brand).toBe("#abcdef");
    for (const [key, value] of Object.entries(tokens.colors)) {
      expect(mergedColors[key]).toBe(value);
    }
    for (const key of Object.keys(tokens.spacing)) {
      expect(preset.theme.extend.spacing[key]).toBeDefined();
    }
  });

  it("emits a preset module string", () => {
    const source = emitTailwindPreset(tokens);
    expect(source).toContain("export default preset;");
  });
});

describe("emitStyleDictionaryJson", () => {
  it("emits a Style Dictionary compatible tree", () => {
    const sd = JSON.parse(emitStyleDictionaryJson(tokens));
    expect(sd.color.black.value).toBe("#000000");
    expect(sd.size.font.heading.value).toBe("32px");
    expect(sd.font.family["minion-pro"].value).toContain("Minion Pro");
  });
});

describe("emitAll", () => {
  it("produces all four artifacts by default", () => {
    expect(Object.keys(emitAll(tokens)).sort()).toEqual([
      "design-tokens.json",
      "tailwind.preset.ts",
      "tokens.css",
      "tokens.ts",
    ]);
  });

  it("omits the Tailwind preset when disabled", () => {
    expect(emitAll(tokens, { tailwind: false })["tailwind.preset.ts"]).toBeUndefined();
  });
});
