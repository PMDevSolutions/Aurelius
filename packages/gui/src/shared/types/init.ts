/**
 * Setup-wizard model. The GUI collects an InitInput, which main maps to the CLI
 * "flags" shape and feeds to the existing resolveDefaults()/apply() in scripts/init/
 * — sharing one code path with `pnpm run init`.
 */

/** How the wizard handles the target Wix site (mirrors scripts/init's site modes). */
export type SiteMode = "skip" | "create" | "connect";

export interface InitInput {
  /** Project slug. */
  name: string;
  /** Human-readable site title; empty → derived from the slug. */
  title: string;
  /** Account-level Wix API key (optional — dry-run works without one). */
  apiKey: string;
  /** Wix account GUID (optional). */
  accountId: string;
  /** skip: record next steps · create: provision a Studio site · connect: use an existing one. */
  siteMode: SiteMode;
  /** Existing site GUID; required when siteMode === 'connect'. */
  siteId: string;
  /** Initialize a git repo (maps to the inverse of --no-git). */
  git: boolean;
}

export interface InitResult {
  ok: boolean;
  projectName: string;
  siteTitle: string;
  siteMode: SiteMode;
  /** The connected site id, when siteMode === 'connect'. */
  siteId?: string;
  error?: string;
}
