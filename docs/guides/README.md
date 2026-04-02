# Framework Guides

Deep-dive documentation for Aurelius framework systems. These guides go beyond the [Quickstart](../onboarding/quickstart.md) and explain how each system works under the hood.

## Core Pipeline Systems (P0)

| Guide | What You Will Learn |
|-------|-------------------|
| [Design Token System](design-tokens.md) | Token structure, lockfile format, validation, sync strategy, drift detection |
| [Visual QA Deep Dive](visual-qa.md) | How visual-diff.js works, sub-pixel detection, typography analysis, threshold tuning |
| [Pipeline Caching & Performance](caching.md) | Incremental builds, cache invalidation, profiling, when to use --force |

## Development Guides (P1)

| Guide | What You Will Learn |
|-------|-------------------|
| [Hook System](hooks.md) | How hooks fire, execution order, creating custom hooks |
| [Error Recovery](error-recovery.md) | What to do when a pipeline phase fails, how to resume, common failure modes |
| [Agent Creation](agent-creation.md) | How to create a custom agent, required YAML frontmatter, tool declarations |

## Framework-Specific Guides (P2)

| Guide | What You Will Learn |
|-------|-------------------|
| [Vue Converter Workflow](vue-converter.md) | Vue 3 pipeline specifics, Composition API patterns |
| [Svelte Converter Workflow](svelte-converter.md) | SvelteKit pipeline specifics, store patterns |
| [React Native Converter Workflow](react-native-converter.md) | Expo pipeline specifics, NativeWind setup |
| [Chrome Extension Pipeline](chrome-extension.md) | Manifest v3, service worker testing, extension E2E |
| [PWA Pipeline](pwa.md) | Service worker lifecycle, offline testing, manifest validation |
