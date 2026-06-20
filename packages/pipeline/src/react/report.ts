/**
 * Build the Markdown generation report: produced files, derived props, staged
 * assets, unmapped IR nodes, and accessibility follow-ups. Deterministic — no
 * timestamps or environment-dependent content.
 */
import type { ComponentPlan, Framework, StagedAsset, StyleMode } from "./model.js";

export interface ReportOptions {
  styleMode: StyleMode;
  framework: Framework;
  stories: boolean;
  source?: "idml" | "pdf";
}

export function buildReport(
  plans: ComponentPlan[],
  assets: StagedAsset[],
  options: ReportOptions,
): string {
  const lines: string[] = [];
  lines.push("# InDesign Pipeline — Generation Report", "");
  lines.push(`- Source: ${options.source ?? "unknown"}`);
  lines.push(`- Style mode: ${options.styleMode}`);
  lines.push(`- Framework: ${options.framework}`);
  lines.push(`- Components: ${plans.length}`, "");

  lines.push("## Components", "");
  for (const plan of plans) {
    const files = [`\`${plan.name}.tsx\``];
    if (options.styleMode === "css-modules") files.push(`\`${plan.name}.module.css\``);
    if (options.stories) files.push(`\`${plan.name}.stories.tsx\``);
    lines.push(`### ${plan.name}`);
    lines.push(`- From spread: \`${plan.sourceId}\``);
    lines.push(`- Files: ${files.join(", ")}`);
    lines.push(`- Props: ${plan.props.map((p) => p.name).join(", ") || "(none)"}`);
    lines.push(`- Elements: ${plan.elements.map((e) => e.tag).join(", ") || "(none)"}`);
    lines.push("");
  }

  const allUnmapped = plans.flatMap((p) => p.unmapped);
  const allA11y = plans.flatMap((p) => p.a11y);

  lines.push(`## Assets (${assets.length})`, "");
  if (assets.length === 0) lines.push("- (none)");
  else for (const asset of assets) lines.push(`- \`${asset.src}\` ← \`${asset.from}\``);
  lines.push("");

  lines.push(`## Unmapped IR nodes (${allUnmapped.length})`, "");
  if (allUnmapped.length === 0) lines.push("- (none)");
  else for (const item of allUnmapped) lines.push(`- ${item}`);
  lines.push("");

  lines.push(`## Accessibility TODOs (${allA11y.length})`, "");
  if (allA11y.length === 0) lines.push("- (none)");
  else for (const item of allA11y) lines.push(`- ${item}`);
  lines.push("");

  return lines.join("\n");
}
