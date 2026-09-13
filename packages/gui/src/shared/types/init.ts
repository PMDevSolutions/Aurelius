/**
 * Setup-wizard model. The GUI collects an InitInput and the engine runs
 * `scripts/setup-project.sh <name> --renderer <renderer> [--dry-run]` — the same
 * script a terminal user runs, so the GUI and CLI share one scaffolding path.
 */
export interface InitInput {
  /** Project directory name (lowercase letters, digits, hyphens). */
  name: string;
  /** Renderer id from renderers/ (nextjs | vite | astro | sveltekit | expo). */
  renderer: string;
  /** Print the resolved plan without creating anything (--dry-run). */
  preview: boolean;
}

export interface InitResult {
  ok: boolean;
  projectName: string;
  renderer: string;
  preview: boolean;
  error?: string;
}
