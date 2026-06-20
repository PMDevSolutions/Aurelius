import { describe, expect, it } from "vitest";
import { buildSampleIdml } from "../../indesign/__tests__/idml-fixtures.js";
import { parseIdml } from "../../indesign/parser.js";
import { mapDocumentToTokens } from "../../tokens/mapper.js";
import { imageHeavyPdf, textHeavyPdf } from "../../pdf/__tests__/pdf-fixtures.js";
import { parsePdf } from "../../pdf/parser.js";
import { generateComponents } from "../generator.js";
import { compile, render } from "./compile-harness.js";

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
