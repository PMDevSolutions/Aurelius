import type { PrereqGuidance } from "../../shared/types/prerequisites";

/**
 * Curated remediation copy keyed by canonical tool key. Used to enrich failing
 * prerequisites with actionable guidance, independent of the exact hint text the
 * bash script happens to print. Single place to maintain install instructions.
 */
export const PREREQ_GUIDANCE: Record<string, PrereqGuidance> = {
  git: { text: "Install Git 2.30 or newer.", url: "https://git-scm.com/downloads" },
  node: { text: "Install Node.js 20 or newer (nvm/fnm work fine).", url: "https://nodejs.org/" },
  pnpm: {
    text: "Install pnpm 9: corepack enable && corepack prepare pnpm@9.15.0 --activate",
    url: "https://pnpm.io/installation",
  },
  claude: {
    text: "Install Claude Code: npm install -g @anthropic-ai/claude-code",
    url: "https://claude.ai/code",
  },
  gh: { text: "Install the GitHub CLI, then run `gh auth login`.", url: "https://cli.github.com/" },
  jq: { text: "jq is optional — hooks and plan-lint use it.", url: "https://jqlang.github.io/jq/" },
  wix: {
    text: "The Wix CLI is optional — only global.css/Velo code pushes need it: npm install -g @wix/cli",
    url: "https://dev.wix.com/docs/build-apps/develop-your-app/frameworks/wix-cli/get-started",
  },
  playwright: {
    text: "Install the Playwright Chromium browser: pnpm playwright:install",
    url: "https://playwright.dev/docs/browsers",
  },
  env: {
    text: "Copy .env.example to .env and add WIX_API_KEY + WIX_ACCOUNT_ID (dry-run works without them).",
    url: "https://manage.wix.com/account/api-keys",
  },
  ram: { text: "Free up memory — at least 4 GB of RAM is required." },
  disk: { text: "Free up disk space — at least 5 GB free is required." },
  os: { text: "Use a supported OS: Windows, macOS, or Linux." },
};

export function guidanceFor(key: string | undefined): PrereqGuidance | undefined {
  return key ? PREREQ_GUIDANCE[key] : undefined;
}
