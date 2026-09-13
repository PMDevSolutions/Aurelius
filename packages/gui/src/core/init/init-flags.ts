import type { InitInput } from "../../shared/types/init";

/** The CLI "flags" shape consumed by scripts/init/default-resolver.mjs's resolveDefaults. */
export interface InitFlags {
  name: string;
  title?: string;
  apiKey?: string;
  accountId?: string;
  /** Set only in connect mode — the resolver derives siteMode 'connect' from it. */
  siteId?: string;
  /** Set only in create mode — conflicts with siteId (the resolver enforces this). */
  createSite: boolean;
  noGit: boolean;
}

/**
 * Map the wizard's InitInput to the exact flag shape `pnpm run init --yes` passes
 * to resolveDefaults, so the GUI and CLI share one resolution + apply path.
 * The GUI's explicit siteMode collapses into the CLI's --site-id / --create-site
 * flags (mutually exclusive; neither means 'skip').
 */
export function toInitFlags(input: InitInput): InitFlags {
  return {
    name: input.name,
    title: input.title.trim() || undefined,
    apiKey: input.apiKey.trim() || undefined,
    accountId: input.accountId.trim() || undefined,
    siteId: input.siteMode === "connect" ? input.siteId.trim() || undefined : undefined,
    createSite: input.siteMode === "create",
    noGit: !input.git,
  };
}
