import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildSampleIdml } from "../../indesign/__tests__/idml-fixtures.js";
import { parseIdml } from "../../indesign/parser.js";
import { mapDocumentToTokens } from "../../tokens/mapper.js";
import { imageHeavyPdf, textHeavyPdf } from "../../pdf/__tests__/pdf-fixtures.js";
import { parsePdf } from "../../pdf/parser.js";
import { generateComponents } from "../generator.js";
import type { GeneratedFile } from "../model.js";

const SHIMS = `
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module "@storybook/react" {
  export interface Meta<T = unknown> { component?: T; title?: string }
  export type StoryObj<T = unknown> = { args?: Record<string, unknown> };
}
declare module "next/image" {
  import type { ComponentType } from "react";
  const Image: ComponentType<{ src: string; alt: string; width?: number; height?: number; className?: string }>;
  export default Image;
}
`;

/** Type-check generated .ts/.tsx files with strict tsc + React JSX; return errors. */
function compile(files: GeneratedFile[]): string[] {
  // Place the temp dir under node_modules so `react`/`react/jsx-runtime` resolve.
  const dir = mkdtempSync(join(process.cwd(), "node_modules", ".gen-tsc-"));
  try {
    const roots: string[] = [];
    for (const file of files) {
      if (!/\.(ts|tsx)$/.test(file.path)) continue;
      const target = join(dir, file.path);
      writeFileSync(target, file.contents);
      roots.push(target);
    }
    const shim = join(dir, "shims.d.ts");
    writeFileSync(shim, SHIMS);
    roots.push(shim);

    const program = ts.createProgram(roots, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true,
    });
    return ts
      .getPreEmitDiagnostics(program)
      .map(
        (d) =>
          `${d.file?.fileName.split(/[/\\]/).pop() ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Transpile a Tailwind component to CJS, evaluate it, and server-render it. */
function render(tsxSource: string, componentName: string): string {
  const js = ts.transpileModule(tsxSource, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const nodeRequire = createRequire(import.meta.url);
  const shimRequire = (id: string): unknown => {
    if (id === "react") return nodeRequire("react");
    if (id === "react/jsx-runtime") return nodeRequire("react/jsx-runtime");
    throw new Error(`unexpected import: ${id}`);
  };
  const mod = { exports: {} as Record<string, unknown> };
  new Function("require", "exports", "module", js)(shimRequire, mod.exports, mod);

  const React = nodeRequire("react") as typeof import("react");
  const { renderToStaticMarkup } = nodeRequire(
    "react-dom/server",
  ) as typeof import("react-dom/server");
  const Component = (mod.exports[componentName] ?? mod.exports.default) as React.ComponentType;
  return renderToStaticMarkup(React.createElement(Component));
}

function idmlSample() {
  const { document } = parseIdml(buildSampleIdml());
  return { document, tokens: mapDocumentToTokens(document) };
}

describe("generateComponents — Tailwind", () => {
  it("generates components that type-check under strict tsc with React JSX", () => {
    const { document, tokens } = idmlSample();
    const result = generateComponents(document, tokens, { styleMode: "tailwind" });
    expect(compile(result.files)).toEqual([]);
  });

  it("renders the generated component to static markup without runtime errors", () => {
    const { document, tokens } = idmlSample();
    const result = generateComponents(document, tokens, { styleMode: "tailwind" });
    const component = result.files.find((f) => f.path === `${result.componentNames[0]}.tsx`)!;
    const html = render(component.contents, result.componentNames[0]!);
    expect(html).toContain("<h1");
    expect(html).toContain("Welcome to Aurelius");
    expect(html).toContain("<img");
  });

  it("emits a barrel and a story per component, with extracted content as default args", () => {
    const { document, tokens } = idmlSample();
    const result = generateComponents(document, tokens);
    const name = result.componentNames[0]!;
    expect(result.files.some((f) => f.path === "index.ts")).toBe(true);
    const story = result.files.find((f) => f.path === `${name}.stories.tsx`)!;
    expect(story.contents).toContain("export const Default");
    expect(story.contents).toContain('"Welcome to Aurelius\\nPrint to React, beautifully."');
  });
});

describe("generateComponents — CSS Modules", () => {
  it("generates components + co-located CSS that type-check", () => {
    const { document, tokens } = idmlSample();
    const result = generateComponents(document, tokens, { styleMode: "css-modules" });
    const css = result.files.find((f) => f.path.endsWith(".module.css"));
    expect(css).toBeDefined();
    expect(css!.contents).toContain("var(--font-size-heading)");
    expect(compile(result.files)).toEqual([]);
  });
});

describe("generateComponents — Next.js", () => {
  it("uses next/image and still type-checks", () => {
    const { document, tokens } = idmlSample();
    const result = generateComponents(document, tokens, { framework: "next" });
    const tsx = result.files.find((f) => f.path.endsWith(".tsx") && !f.path.includes("stories"))!;
    expect(tsx.contents).toContain('import Image from "next/image"');
    expect(tsx.contents).toContain("<Image");
    expect(compile(result.files)).toEqual([]);
  });
});

describe("generation report", () => {
  it("enumerates files, assets, unmapped nodes, and accessibility TODOs", () => {
    const { document, tokens } = idmlSample();
    const { report } = generateComponents(document, tokens);
    expect(report).toContain("# InDesign Pipeline — Generation Report");
    expect(report).toContain("## Components");
    expect(report).toContain("`Links/hero.png`");
    expect(report).toContain("## Accessibility TODOs (1)");
    expect(report).toContain("missing alt text");
  });
});

describe("deterministic JSX snapshots", () => {
  it("text-heavy spread", async () => {
    const { document } = await parsePdf(await textHeavyPdf());
    const tokens = mapDocumentToTokens(document);
    const result = generateComponents(document, tokens, { styleMode: "tailwind" });
    const tsx = result.files.find((f) => f.path.endsWith(".tsx") && !f.path.includes("stories"))!;
    expect(tsx.contents).toMatchSnapshot();
  });

  it("image-heavy spread", async () => {
    const { document } = await parsePdf(await imageHeavyPdf());
    const tokens = mapDocumentToTokens(document);
    const result = generateComponents(document, tokens, { styleMode: "tailwind" });
    const tsx = result.files.find((f) => f.path.endsWith(".tsx") && !f.path.includes("stories"))!;
    expect(tsx.contents).toMatchSnapshot();
  });
});
