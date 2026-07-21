# Scripts Reference

**Last Updated:** 2026-07-21

All scripts live in `scripts/` and are designed to run from the project root.
The marketing utilities are dependency-free Node (ESM); shell scripts target
bash 3.2+ (macOS-safe).

## Editorial QA Utilities

### Brand Voice Lint (`brand-voice-lint.js`)
- **Purpose**: Mechanical enforcement of `brand-guidelines.json` — banned words, prohibited claims, product naming, preferred terms, required disclaimers
- **Usage**: `node scripts/brand-voice-lint.js content/ [--json]`
- **Self-test**: `node scripts/brand-voice-lint.js --self-test` (validates the lockfile itself)
- **Exit codes**: 0 clean (warnings allowed) · 1 errors · 2 no/invalid lockfile

### Readability Score (`readability-score.js`)
- **Purpose**: Flesch Reading Ease, sentence length, and passive-voice heuristics vs per-asset-type targets from `pipeline.config.json → readability.targets`
- **Usage**: `node scripts/readability-score.js content/ [--check] [--type blog-post] [--json]`
- **Exit codes**: 0 ok · 1 below target with `--check` · 2 usage error

### SEO Check (`seo-check.js`)
- **Purpose**: On-page checks for Markdown — title/meta lengths, keyword placement, H1 rules, heading hierarchy, internal links, cited sources (`pipeline.config.json → seoChecklist`)
- **Usage**: `node scripts/seo-check.js content/ [--json]`
- **Exit codes**: 0 no failures (warnings allowed) · 1 failures · 2 usage error

### Content Calendar Validator (`validate-content-calendar.js`)
- **Purpose**: Structural validation of `content-calendar.json` — date ordering, approval lead times, dependencies, cadence caps, stale entries
- **Usage**: `node scripts/validate-content-calendar.js [--file path] [--json]`
- **Exit codes**: 0 valid · 1 errors · 2 missing/invalid file

## Framework Verification

### Verify All (`verify-all.sh`)
- **Purpose**: Run every local quality check with a summary table. Backs `/verify-all`.
- **Checks**: `brand-voice`, `readability`, `seo`, `calendar`, `pipeline-config`, `doc-counts`, `agent-plugins` — conditional checks skip gracefully when their subject is absent
- **Usage**: `./scripts/verify-all.sh [--skip a,b] [--include a,b] [--list] [--json] [--ci]`

### Pipeline Config Validator (`validate-pipeline-config.js` / `.sh`)
- **Purpose**: Validate `.claude/pipeline.config.json` against its JSON Schema plus structural checks (orchestration graph cycles/references)
- **Usage**: `node scripts/validate-pipeline-config.js [--config path] [--schema path] [--json]`

### Doc Count Check (`check-doc-counts.sh`)
- **Purpose**: Recount `.claude/agents/` and `.claude/skills/` and fail on any documented count that disagrees (runs in CI and pre-commit; CHANGELOG/plans/rfcs excluded as historical)
- **Usage**: `./scripts/check-doc-counts.sh [--json]`

## Agent Plugin Toolchain

### Create / Validate / Test / Registry
- `node scripts/create-agent-plugin.js <name> [--description …] [--model …] [--tools …] [--with-hooks]`
- `node scripts/validate-agent-plugin.js --dir <plugin-dir>` (or `--all`)
- `node scripts/test-agent-plugin.js --dir <plugin-dir>` (or `--all`)
- `node scripts/agent-registry.js (list | resolve <name> | install <name> | uninstall <name>)`
- `./scripts/verify-agent-plugins.sh` — CI wrapper across all installed plugins
- `scripts/agent-plugin-lib.js` — shared library; `scripts/fix-agent-frontmatter.py` — one-shot frontmatter normalizer

## Release Tooling

### Release Notes (`extract-release-notes.js`)
- **Purpose**: Extract the current version's section from CHANGELOG.md for GitHub Releases
- **Usage**: `node scripts/extract-release-notes.js` (used by `.github/workflows/release.yml`)

## Shared Library (`scripts/lib/`)

- `common.sh` — project-root resolution, output helpers (`say_*`), tempfile tracking, portable `common_now_ms`, CSV helpers, agent-plugin detection
- `colors.sh` — terminal color variables

## Tests

`scripts/__tests__/` (Vitest): `pnpm test`

- Orchestrator behavior (`verify-all.test.js`) via stub check scripts
- Hook contracts (`hooks.test.js`): every hook exits 0; firing conditions
- Agent plugin toolchain and doc-count checker suites
