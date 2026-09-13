import { join } from "node:path";
import type { CommandDescriptor } from "../../shared/product/manifest";
import type { RunSpec } from "../process/runner-types";
import type { CommandBuilder } from "../shell/command-builder";

/** Variables substituted into a command's `{name}` placeholders at run time. */
export type CommandVars = Readonly<Record<string, string>>;

const SOLE_PLACEHOLDER = /^\{(\w+)\}$/;

/**
 * Fill `{name}` placeholders in a template's parts from `vars` (missing → '').
 * A part that is exactly one placeholder whose value is empty is dropped, so
 * optional flags (`{dryRun}` → '--dry-run' | '') never produce a stray '' argument.
 */
export function fillTemplate(template: readonly string[] | undefined, vars: CommandVars): string[] {
  const out: string[] = [];
  for (const part of template ?? []) {
    const sole = SOLE_PLACEHOLDER.exec(part);
    if (sole) {
      const value = vars[sole[1]] ?? "";
      if (value !== "") out.push(value);
      continue;
    }
    out.push(part.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? ""));
  }
  return out;
}

/**
 * Interpret a manifest CommandDescriptor into a concrete RunSpec via the generic
 * CommandBuilder. This is the single place a step's declared command becomes a
 * process — there is no per-product branch. Script/module paths are resolved against
 * the active project root; `argsTemplate` placeholders are filled from `vars`.
 */
export async function buildCommandSpec(
  commands: CommandBuilder,
  repoRoot: string,
  descriptor: CommandDescriptor,
  vars: CommandVars = {},
): Promise<RunSpec> {
  switch (descriptor.exec) {
    case "bashScript":
      return commands.bashScript(
        join(repoRoot, descriptor.script),
        fillTemplate(descriptor.argsTemplate, vars),
        repoRoot,
      );
    case "bashCommand":
      return commands.bashCommand(descriptor.command, repoRoot);
    case "nodeBin":
      return commands.nodeBin(
        join(repoRoot, descriptor.script),
        fillTemplate(descriptor.argsTemplate, vars),
        repoRoot,
      );
    case "claude":
      return commands.claude(fillTemplate(descriptor.argsTemplate, vars), repoRoot);
  }
}
