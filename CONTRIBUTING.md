# Contributing to Aurelius

Welcome, and thank you for your interest in contributing to Aurelius. Named after the Roman Emperor Marcus Aurelius — a leader known for discipline, thoughtful decision-making, and principled action — this project strives to bring those same qualities to modern app development. Aurelius is a Claude Code-integrated multi-framework app development framework built and maintained by [Paul Mulligan](https://github.com/PMDevSolutions), and contributions from the community are what make it better.

Whether you are fixing a bug, adding a feature, improving documentation, or suggesting an idea, I appreciate your time and effort.

---

## Getting Started

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/aurelius.git
   cd aurelius
   ```

2. **Install pnpm** if you do not already have it. This project uses pnpm exclusively — npm and yarn are not supported.

   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

3. **Run the setup script** to initialize your local environment:

   ```bash
   ./scripts/setup-project.sh
   ```

---

## Development Setup

After cloning, install all dependencies:

```bash
pnpm install
```

The following scripts are used throughout development. Run them before submitting any pull request:

| Script | Purpose |
|--------|---------|
| `./scripts/lint-and-format.sh` | Run ESLint and Prettier across the codebase |
| `./scripts/run-tests.sh` | Run the full Vitest test suite with coverage |
| `./scripts/check-types.sh` | TypeScript type checking (strict mode) |
| `./scripts/check-accessibility.sh` | Accessibility linting (WCAG 2.1 AA) |
| `./scripts/verify-tokens.sh` | Verify design token usage (no hardcoded values) |
| `./scripts/check-security.sh` | Security audit for dependency vulnerabilities |

All checks must pass before a pull request will be reviewed.

---

## Branch Naming Conventions

Use the following prefixes when creating branches:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features or capabilities | `feat/vue-converter-improvements` |
| `fix/` | Bug fixes | `fix/token-drift-detection` |
| `docs/` | Documentation updates | `docs/update-pipeline-guide` |
| `chore/` | Maintenance, refactoring, tooling | `chore/upgrade-vitest-config` |

Branch names should be lowercase, use hyphens as separators, and be descriptive enough to understand the scope of the change at a glance.

---

## Pull Request Process

1. **Create a focused branch** from `main` using the naming conventions above.

2. **Make your changes.** Write tests for any new functionality and ensure existing tests continue to pass.

3. **Run all checks locally** before pushing:

   ```bash
   ./scripts/lint-and-format.sh
   ./scripts/run-tests.sh
   ./scripts/check-types.sh
   ```

4. **Push your branch** and open a pull request against `main`.

5. **Write a clear pull request title and description:**
   - The title should be concise and under 70 characters.
   - The description should explain what changed and why.
   - Reference any related issues (e.g., `Closes #42`).

6. **Use conventional commit messages.** Examples:

   ```
   feat: add dark mode support to svelte-converter
   fix: resolve token sync race condition
   docs: clarify setup instructions for Windows
   chore: update Playwright to v1.50
   ```

7. **All CI checks must pass.** Pull requests with failing tests, lint errors, or type errors will not be reviewed until resolved.

8. **Wait for review.** I review all external contributor PRs personally before merging. I may request changes — this is a normal and constructive part of the process. Please be responsive to feedback so we can get your contribution merged promptly.

---

## Release Process

Releases are cut from the **Release** GitHub Actions workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)), which drives [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) as configured in [`.versionrc.json`](.versionrc.json). The `version` in `package.json` and the published git tag are kept in sync automatically — do not edit `package.json`'s `version` field by hand.

`main` is protected by a ruleset (pull request + required status checks, no bypass for the Actions token), so the release happens in two stages around a pull request:

1. **Prepare.** Run the Release workflow from the Actions tab (`workflow_dispatch`) and pick a release type: `auto` derives the bump from conventional commits since the last tag; `patch`, `minor`, or `major` force it. The workflow bumps `package.json`, regenerates `CHANGELOG.md`, commits `chore(release): X.Y.Z` on a `release/vX.Y.Z` branch, and opens a PR titled `chore(release): vX.Y.Z` whose body is the new changelog section. Tick **dry run** to preview the bump without pushing anything.
2. **Publish.** Review and merge the release PR like any other. The push to `main` re-runs the workflow, which sees a `package.json` version with no matching tag, tags the merge commit `vX.Y.Z`, and creates the GitHub Release from that version's `CHANGELOG.md` section (via [`scripts/extract-release-notes.js`](scripts/extract-release-notes.js)). Re-running on a version that is already tagged is a no-op.

> **CI on the release PR.** Pull requests opened with the default `GITHUB_TOKEN` do not trigger `pull_request` workflows, so the required checks never start. Add a `RELEASE_TOKEN` repository secret (a fine-grained personal access token with *Contents* and *Pull requests* write access) and the workflow opens the PR as that user, which runs CI normally. Without it, close and reopen the release PR once to trigger the checks.

The same commands are available locally for previews and emergencies:

| Command | Use Case |
|---------|----------|
| `pnpm run release:dry` | Preview the bump and CHANGELOG entry without writing anything |
| `pnpm run release` | Auto-detect the bump (major/minor/patch) from conventional commits since the last tag |
| `pnpm run release:patch` | Force a patch bump |
| `pnpm run release:minor` | Force a minor bump |
| `pnpm run release:major` | Force a major bump |
| `pnpm run release:first` | First release on a fresh repo (no version bump) |

Each non-dry command bumps `package.json`, regenerates `CHANGELOG.md`, runs the `postchangelog` hook to produce `RELEASE_NOTES.md`, commits `chore(release): X.Y.Z`, and creates the `vX.Y.Z` tag. Pushing that commit to `main` directly requires a ruleset bypass, so only do this as a maintainer with bypass rights (`git push --follow-tags origin main`, then `gh release create vX.Y.Z --notes-file RELEASE_NOTES.md`). Never pass flags through `pnpm run release -- …`: pnpm forwards the `--` and commit-and-tag-version then ignores every flag after it, including `--dry-run`. Use the dedicated scripts above or `pnpm exec commit-and-tag-version <flags>`.

Because the bump is derived from commit history, **conventional commit messages on `main` are load-bearing**: `feat:` triggers a minor bump, `fix:` triggers a patch, and a `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` body footer triggers a major bump. See the [Pull Request Process](#pull-request-process) above for examples.

---

## Claude Code Agents

Aurelius includes 56 specialized Claude Code agents and 24 skills that automate significant portions of the development workflow — from design-to-code conversion to testing, accessibility, and deployment.

If you have Claude Code installed, these agents and skills are available to you automatically when working in this repository. They can assist with component development, test writing, visual QA, and much more.

For full documentation on available agents and how to use them:

- **Agents catalog:** [`.claude/CUSTOM-AGENTS-GUIDE.md`](.claude/CUSTOM-AGENTS-GUIDE.md)
- **Skills reference:** [`.claude/skills/README.md`](.claude/skills/README.md)

Contributors are encouraged to leverage these tools, but they are not required. All contributions are welcome regardless of whether you use Claude Code.

---

## Roadmap and Priorities

The project roadmap is maintained publicly on the GitHub project board. You can view upcoming features, planned improvements, and known issues there.

Community members are encouraged to vote on priorities and propose new ideas via GitHub Discussions. If you are considering a large contribution, please open a discussion first so I can align with you on scope and approach before significant work begins.

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). All contributors are expected to:

- Be respectful and constructive in all interactions.
- Provide clear, actionable feedback in code reviews.
- Assume good intent from other contributors.
- Keep discussions focused on the project and its goals.

Unacceptable behavior can be reported to **paul@pmds.info**. I reserve the right to remove content or restrict access for anyone who violates the Code of Conduct.

---

Thank you for contributing to Aurelius. Your work helps make multi-framework development more accessible, reliable, and efficient for everyone. If you have questions, feel free to open a [discussion](https://github.com/PMDevSolutions/Aurelius/discussions).
