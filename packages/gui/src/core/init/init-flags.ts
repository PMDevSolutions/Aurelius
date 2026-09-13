import type { InitInput } from "../../shared/types/init";

/** Runtime vars for the wizard step's argsTemplate (`{name}`, `{renderer}`, `{dryRun}`). */
export interface SetupVars extends Record<string, string> {
  name: string;
  renderer: string;
  /** '--dry-run' when previewing, '' otherwise (an empty placeholder-only arg is dropped). */
  dryRun: "--dry-run" | "";
}

/** Same rule scripts/create-app.js enforces for app names. */
const NAME_RULE = /^[a-z0-9-]+$/;

export function toSetupVars(input: InitInput): SetupVars {
  return {
    name: input.name.trim(),
    renderer: input.renderer,
    dryRun: input.preview ? "--dry-run" : "",
  };
}

/** Validate before any task is created; returns a user-facing message or null when valid. */
export function validateInitInput(
  input: InitInput,
  frameworks: readonly { readonly id: string }[],
): string | null {
  const name = input.name.trim();
  if (!name) return "Enter a project name.";
  if (!NAME_RULE.test(name))
    return "Project name must be lowercase letters, numbers, and hyphens only.";
  if (!frameworks.some((f) => f.id === input.renderer)) return "Choose a framework.";
  return null;
}
