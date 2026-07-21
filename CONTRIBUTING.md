# Contributing to Maecenas

Welcome, and thank you for your interest in contributing to Maecenas. Named after Gaius Cilnius Maecenas — Augustus's counselor and patron of Virgil and Horace, Rome's first great communications strategist — this project strives to bring discipline, enforceable standards, and principled automation to modern marketing work. Maecenas is a Claude Code-integrated marketing framework built and maintained by [Paul Mulligan](https://github.com/PMDevSolutions), and contributions from the community are what make it better.

Whether you are fixing a bug, adding a feature, improving documentation, or suggesting an idea, I appreciate your time and effort.

---

## Getting Started

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/Marketing.git
   cd Marketing
   ```

2. **Install pnpm** if you do not already have it. This project uses pnpm exclusively — npm and yarn are not supported.

   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

3. **Install dependencies:**

   ```bash
   pnpm install
   ```

---

## Development Setup

The following checks are used throughout development. Run them before submitting any pull request:

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run the Vitest suite for the framework scripts |
| `./scripts/verify-all.sh` | Run every local quality check with a summary |
| `./scripts/validate-pipeline-config.sh` | Validate pipeline.config.json against its JSON Schema |
| `./scripts/check-doc-counts.sh` | Verify documented agent/skill counts match disk |

All checks must pass before a pull request will be reviewed.

---

## Branch Naming Conventions

Use the following prefixes when creating branches:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features or capabilities | `feat/webinar-asset-type` |
| `fix/` | Bug fixes | `fix/calendar-lead-time-check` |
| `docs/` | Documentation updates | `docs/update-pipeline-guide` |
| `chore/` | Maintenance, refactoring, tooling | `chore/upgrade-vitest-config` |

Branch names should be lowercase, use hyphens as separators, and be descriptive enough to understand the scope of the change at a glance.

---

## Pull Request Process

1. **Create a focused branch** from `main` using the naming conventions above.

2. **Make your changes.** Write tests for any new functionality and ensure existing tests continue to pass.

3. **Run all checks locally** before pushing:

   ```bash
   pnpm test
   ./scripts/verify-all.sh
   ```

4. **Push your branch** and open a pull request against `main`.

5. **Write a clear pull request title and description:**
   - The title should be concise and under 70 characters.
   - The description should explain what changed and why.
   - Reference any related issues (e.g., `Closes #42`).

6. **Use conventional commit messages.** Examples:

   ```
   feat: add webinar asset type to the pipeline
   fix: resolve calendar cadence-cap false positive
   docs: clarify setup instructions for Windows
   chore: update vitest to v4.2
   ```

7. **All CI checks must pass.** Pull requests with failing tests, lint errors, or type errors will not be reviewed until resolved.

8. **Wait for review.** I review all external contributor PRs personally before merging. I may request changes — this is a normal and constructive part of the process. Please be responsive to feedback so we can get your contribution merged promptly.

---

## Release Process

Releases are cut by the maintainer using [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version), configured in [`.versionrc.json`](.versionrc.json). The `version` in `package.json` and the published git tag are kept in sync automatically — do not edit `package.json`'s `version` field by hand.

| Command | Use Case |
|---------|----------|
| `pnpm run release` | Auto-detect the bump (major/minor/patch) from conventional commits since the last tag |
| `pnpm run release:patch` | Force a patch bump |
| `pnpm run release:minor` | Force a minor bump |
| `pnpm run release:major` | Force a major bump |
| `pnpm run release:dry` | Preview the bump and CHANGELOG entry without writing anything |
| `pnpm run release:first` | First release on a fresh repo (no version bump) |

Each non-dry release command:

1. Bumps `package.json` to the next version.
2. Regenerates `CHANGELOG.md` from conventional commits since the previous tag.
3. Runs the `postchangelog` hook ([`scripts/extract-release-notes.js`](scripts/extract-release-notes.js)) to produce `RELEASE_NOTES.md` for the GitHub Release body.
4. Commits the bump as `chore(release): vX.Y.Z`.
5. Creates a git tag prefixed with `v` (e.g. `v1.2.0`).

After the command finishes, push the commit and tag together:

```bash
git push --follow-tags origin main
```

Because the bump is derived from commit history, **conventional commit messages on `main` are load-bearing**: `feat:` triggers a minor bump, `fix:` triggers a patch, and a `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` body footer triggers a major bump. See the [Pull Request Process](#pull-request-process) above for examples.

---

## Claude Code Agents

Maecenas includes 42 specialized Claude Code agents and 13 skills that automate significant portions of the marketing workflow — from campaign strategy and drafting to editorial QA, approvals, and reporting.

If you have Claude Code installed, these agents and skills are available to you automatically when working in this repository. They can assist with campaign briefs, content drafting, brand compliance, analytics reports, and much more.

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

Thank you for contributing to Maecenas. Your work helps make principled, brand-safe marketing automation more accessible and reliable for everyone. If you have questions, feel free to open a [discussion](https://github.com/PMDevSolutions/Marketing/discussions).
