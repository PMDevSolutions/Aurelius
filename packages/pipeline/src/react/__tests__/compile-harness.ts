/**
 * Shared test harness: type-check generated React files with strict `tsc` and
 * server-render a generated Tailwind component. Used by the generator unit
 * tests and the end-to-end smoke test.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "typescript";
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
export function compile(files: GeneratedFile[]): string[] {
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
export function render(tsxSource: string, componentName: string): string {
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
