/**
 * React component generator.
 *
 * Turns an IR {@link Document} plus a {@link TokenMapResult} into a directory of
 * importable React artifacts: one typed `.tsx` per spread, optional Storybook
 * stories, a `.module.css` per component (css-modules mode), a barrel `index.ts`,
 * and a Markdown generation report. Deterministic — the same IR always produces
 * byte-identical output.
 */
import type { Document } from "../indesign/ir.js";
import type { TokenMapResult } from "../tokens/model.js";
import { emitComponentCss, emitComponentTsx, emitIndexTs, emitStoriesTsx } from "./emit.js";
import type { GeneratedFile, GenerateOptions, GenerationResult, StagedAsset } from "./model.js";
import { buildComponentPlans } from "./plan.js";
import { buildReport } from "./report.js";

export const REPORT_FILENAME = "indesign-pipeline-report.md";

/** Generate React artifacts from the IR and design tokens. */
export function generateComponents(
  document: Document,
  tokens: TokenMapResult,
  options: GenerateOptions = {},
): GenerationResult {
  const styleMode = options.styleMode ?? "tailwind";
  const framework = options.framework ?? "react";
  const assetPath = options.assetPath ?? "/indesign";
  const stories = options.stories ?? true;

  const plans = buildComponentPlans(document, tokens, { styleMode, framework, assetPath });
  const files: GeneratedFile[] = [];

  for (const plan of plans) {
    files.push({
      path: `${plan.name}.tsx`,
      contents: emitComponentTsx(plan, { styleMode, framework, assetPath }),
    });
    if (styleMode === "css-modules") {
      files.push({ path: `${plan.name}.module.css`, contents: emitComponentCss(plan) });
    }
    if (stories) {
      files.push({ path: `${plan.name}.stories.tsx`, contents: emitStoriesTsx(plan) });
    }
  }

  const componentNames = plans.map((p) => p.name);
  files.push({ path: "index.ts", contents: emitIndexTs(componentNames) });

  const assets = dedupeAssets(plans.flatMap((p) => p.assets));
  const unmapped = plans.flatMap((p) => p.unmapped);
  const a11y = plans.flatMap((p) => p.a11y);

  const report = buildReport(plans, assets, {
    styleMode,
    framework,
    stories,
    ...(document.meta.source ? { source: document.meta.source } : {}),
  });
  files.push({ path: REPORT_FILENAME, contents: report });

  return { files, componentNames, report, assets, unmapped, a11y };
}

function dedupeAssets(assets: StagedAsset[]): StagedAsset[] {
  const seen = new Set<string>();
  const out: StagedAsset[] = [];
  for (const asset of assets) {
    if (seen.has(asset.src)) continue;
    seen.add(asset.src);
    out.push(asset);
  }
  return out;
}
