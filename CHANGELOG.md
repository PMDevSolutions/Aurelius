# Changelog

All notable changes to the Aurelius framework will be documented in this file.

This changelog is automatically generated from [Conventional Commits](https://www.conventionalcommits.org/).

## [2.0.0](https://github.com/PMDevSolutions/Aurelius/compare/v1.1.0...v2.0.0) (2026-08-15)


### Features

* **agents:** add astro-converter (hybrid .astro + react islands) ([a419577](https://github.com/PMDevSolutions/Aurelius/commit/a419577f1926ba561f3eb667e7a32426884dbb56))
* **astro:** add --astro flag and wire the Astro starter into the pipeline ([6de51e8](https://github.com/PMDevSolutions/Aurelius/commit/6de51e8c69ca0a7c8fc2efc6387dab2c5e8d1fe2)), closes [#78](https://github.com/PMDevSolutions/Aurelius/issues/78) [#78](https://github.com/PMDevSolutions/Aurelius/issues/78)
* **build-spec:** add renderer field, deprecate framework.type ([5695aca](https://github.com/PMDevSolutions/Aurelius/commit/5695acabcdd27fb583f5d4c0fe04bb0be0ecc394))
* **config:** add visualBaselines section for cross-browser baseline storage (RFC 0002) ([e23f2ca](https://github.com/PMDevSolutions/Aurelius/commit/e23f2ca349b3b7b2585d77e018e4fe11c85432f2))
* **conversation:** add /build-from-conversation pipeline ([bf1cfc0](https://github.com/PMDevSolutions/Aurelius/commit/bf1cfc086bfe68328b6df09b4846244d939e5c90)), closes [#33](https://github.com/PMDevSolutions/Aurelius/issues/33)
* **design-system:** add token re-import + round-trip and document consumers ([167278f](https://github.com/PMDevSolutions/Aurelius/commit/167278f39e3b81a4e566655907a224bc69edc0b7)), closes [#3](https://github.com/PMDevSolutions/Aurelius/issues/3) [#4](https://github.com/PMDevSolutions/Aurelius/issues/4) [#82](https://github.com/PMDevSolutions/Aurelius/issues/82)
* **pipeline:** add InDesign IDML parser and intermediate representation ([9cfd6c9](https://github.com/PMDevSolutions/Aurelius/commit/9cfd6c9a8e55020e313e0634509876d24f8774a2)), closes [#62](https://github.com/PMDevSolutions/Aurelius/issues/62) [#63](https://github.com/PMDevSolutions/Aurelius/issues/63) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62)
* **pipeline:** add InDesign React component generator ([355fb56](https://github.com/PMDevSolutions/Aurelius/commit/355fb56f58cf13c4a3b637644164682bd0450c2e)), closes [#66](https://github.com/PMDevSolutions/Aurelius/issues/66) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62) [#66](https://github.com/PMDevSolutions/Aurelius/issues/66) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62)
* **pipeline:** add InDesign style and design-token mapper ([dfaf538](https://github.com/PMDevSolutions/Aurelius/commit/dfaf5380775a3366872ccf872c079e513c4192d2)), closes [#65](https://github.com/PMDevSolutions/Aurelius/issues/65) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62) [#65](https://github.com/PMDevSolutions/Aurelius/issues/65) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62)
* **pipeline:** add PDF as a first-class InDesign input ([51141f1](https://github.com/PMDevSolutions/Aurelius/commit/51141f1851aa9ccf2adc885bcf041935776c2311)), closes [#64](https://github.com/PMDevSolutions/Aurelius/issues/64) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62) [#64](https://github.com/PMDevSolutions/Aurelius/issues/64) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62)
* **pipeline:** ship InDesign pipeline agent, skill, CLI, and docs ([c1a9d09](https://github.com/PMDevSolutions/Aurelius/commit/c1a9d098e3247742d40a87a6415ca49ff6a18903)), closes [#67](https://github.com/PMDevSolutions/Aurelius/issues/67) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62) [#67](https://github.com/PMDevSolutions/Aurelius/issues/67) [#62](https://github.com/PMDevSolutions/Aurelius/issues/62)
* **plugins:** add agent plugin manifest JSON schema ([f97f9d6](https://github.com/PMDevSolutions/Aurelius/commit/f97f9d6f873f211a920dcf602e10c3b1867d7fa9))
* **plugins:** add catalog builder and semver range check ([f2caeac](https://github.com/PMDevSolutions/Aurelius/commit/f2caeac040f7b1b7a16891108deca46b62e87dc7))
* **plugins:** add frontmatter + example parsing helpers ([717b054](https://github.com/PMDevSolutions/Aurelius/commit/717b054ceefb9b0b23e6d5b379725a25a5756fb7))
* **plugins:** add manifest + structural validator ([b9cfded](https://github.com/PMDevSolutions/Aurelius/commit/b9cfdeda2058577259a3d73c0c2ed2781a6c4b0f))
* **plugins:** add registry with dependency resolution, install/uninstall, lifecycle hooks ([6be51d3](https://github.com/PMDevSolutions/Aurelius/commit/6be51d39689ae9c44fbd2f2dc9eaaf5cff9e14aa))
* **plugins:** add scaffolding CLI for new agent plugins ([ea49fda](https://github.com/PMDevSolutions/Aurelius/commit/ea49fda04cbdb9b71018345735e8364d4d55a68f))
* **plugins:** add static assertion test runner ([1aa904d](https://github.com/PMDevSolutions/Aurelius/commit/1aa904db1e5ff7e6911464cc283d726e916c3416))
* **plugins:** add transitive dependency resolver with cycle detection ([ef96341](https://github.com/PMDevSolutions/Aurelius/commit/ef963413d6f315ca3258629e693fc33dda2799d7))
* **renderers:** add renderer manifest JSON schema ([66816c6](https://github.com/PMDevSolutions/Aurelius/commit/66816c67e56d403586c25782f4b1487761001afd))
* **renderers:** add renderer-registry detect with priority precedence ([5bb6254](https://github.com/PMDevSolutions/Aurelius/commit/5bb6254d53cee0a46408444de1b57884bab36c41))
* **renderers:** add renderer-registry list command ([6f62069](https://github.com/PMDevSolutions/Aurelius/commit/6f620697fe27de54e98e3c2b87a657196424d9b4))
* **renderers:** add renderer-registry resolve command ([67441d9](https://github.com/PMDevSolutions/Aurelius/commit/67441d9cdf163c8d4b2deb5fdd9c9fe5df79cdd1))
* **renderers:** add validate-renderer (schema + cross-reference checks) ([4519a23](https://github.com/PMDevSolutions/Aurelius/commit/4519a23d76edd839a58e5198517a4bdf559359e0))
* **renderers:** author astro manifest ([ec85dcf](https://github.com/PMDevSolutions/Aurelius/commit/ec85dcfef485fccc0a444e47814cae533f67d472))
* **renderers:** author nextjs/vite/sveltekit/expo manifests ([a286cf0](https://github.com/PMDevSolutions/Aurelius/commit/a286cf07b04a3a14c4199c3bade035c5671f5a0f))
* **scripts:** add baseline provenance manifest lib (record/sync/verify) ([4f3aba1](https://github.com/PMDevSolutions/Aurelius/commit/4f3aba121ed1353173976c42e6a30c65ff181e27))
* **scripts:** add cross-browser-baseline capture/compare with provenance verification ([7da6ead](https://github.com/PMDevSolutions/Aurelius/commit/7da6eadccb023e243fa61511ea5e3cfda88e511b))
* **scripts:** ci-artifact and service baseline backends behind the adapter contract ([8eb139b](https://github.com/PMDevSolutions/Aurelius/commit/8eb139b3bcb60398344b563254313667f7a399fc))
* **scripts:** git-lfs storage automation for large baseline sets ([cb95e5f](https://github.com/PMDevSolutions/Aurelius/commit/cb95e5f70ed399b870a8dbda8a304901d3e6fc82))
* **scripts:** pinned Playwright container capture for cross-browser baselines ([16fd000](https://github.com/PMDevSolutions/Aurelius/commit/16fd0003d22ea5b1ddc47c9a40bc7f6c4730088e))
* **setup:** add --renderer flag backed by the registry ([bdc590f](https://github.com/PMDevSolutions/Aurelius/commit/bdc590fdd5a1e6fecfc642d213dbcbb134e9d711))
* **skills:** add storybook-story-generation skill ([cad7cbc](https://github.com/PMDevSolutions/Aurelius/commit/cad7cbc9a0e287f35ef33b4f854820fb3a3ded9c)), closes [#81](https://github.com/PMDevSolutions/Aurelius/issues/81)
* **templates:** add astro starter (react islands + tailwind + container-api tests) ([3bb4e2a](https://github.com/PMDevSolutions/Aurelius/commit/3bb4e2ae3926c15ae132623ed4fd08261f82b575))


### Bug Fixes

* **deps:** bump fast-xml-parser to v5.9.3 to clear XMLBuilder injection advisory ([c30bc8c](https://github.com/PMDevSolutions/Aurelius/commit/c30bc8c5c13dd55b4f5ba5abf0748518008d4c1a)), closes [#108](https://github.com/PMDevSolutions/Aurelius/issues/108) [#108](https://github.com/PMDevSolutions/Aurelius/issues/108)
* **pipeline:** make Phase 7 cross-browser phase perform the comparison it advertises ([c7332f1](https://github.com/PMDevSolutions/Aurelius/commit/c7332f113e0e14c5a6324f6a13fbd158f501d8bc))
* **plugins:** guard scaffolder against non-interactive hang, normalize tools, roll back writes ([739b541](https://github.com/PMDevSolutions/Aurelius/commit/739b5411c039e5c044cb97ae002a4dc14f94158e))
* **plugins:** harden frontmatter list parsing and null-safe example count ([3c794ca](https://github.com/PMDevSolutions/Aurelius/commit/3c794cabfd41e826514630c2b5391bc46cc5e839))
* **plugins:** harden validator IO handling, sibling dep resolution, and schema error detail ([4352a72](https://github.com/PMDevSolutions/Aurelius/commit/4352a72d24c4f6760f093747d7062218df49475c))
* **plugins:** persist install state incrementally, guard installed.json, cover hook paths ([83b50de](https://github.com/PMDevSolutions/Aurelius/commit/83b50de922bbf1f57c789f7df245c4b131102edd))
* **plugins:** track plugin sources in git and validate before install ([a30f43f](https://github.com/PMDevSolutions/Aurelius/commit/a30f43f4ebeb544cacacf4f3aa2735bb0d951488))
* **scripts:** report visual mismatch as a true percentage ([cdddd21](https://github.com/PMDevSolutions/Aurelius/commit/cdddd21d23709db00a01d8c36ff4651bdd5388a2))
* **templates,renderers:** add user-event dep to astro, document fixture annotations ([9e2b5a6](https://github.com/PMDevSolutions/Aurelius/commit/9e2b5a68a36742285760db17b8ebadfd325ec7ba))
* **templates:** migrate Astro starter to v6.4.8 + Tailwind 4 to clear SSRF/XSS advisories ([e9e4559](https://github.com/PMDevSolutions/Aurelius/commit/e9e45599e0afc628e6b911060e0e21f6581f5141)), closes [#107](https://github.com/PMDevSolutions/Aurelius/issues/107)


### Refactoring

* **intake:** detect framework via renderer-registry, not hardcoded sniffing ([a4582f6](https://github.com/PMDevSolutions/Aurelius/commit/a4582f6d6e6c60da23ba90c0c0895cac39976afb))
* **orchestration:** exclude phases via manifest.phases.exclude ([11654c9](https://github.com/PMDevSolutions/Aurelius/commit/11654c993013e5ad457d73647e5d4a4785f0d289))
* **pipeline:** dispatch Phase-4 converter via renderer manifest ([6085286](https://github.com/PMDevSolutions/Aurelius/commit/6085286e900b386082d13cd0b931e3fa7bdbc762))
* **pipeline:** phase 4.5 skip note reads renderer not outputTarget ([577bef7](https://github.com/PMDevSolutions/Aurelius/commit/577bef7c92ac8da22a51e0f86ddb0fdbe68e94fe))
* **plugins:** share plugin-dir scan, surface validator detail in runner ([b75f3a8](https://github.com/PMDevSolutions/Aurelius/commit/b75f3a80e1e616ad67a5aa5f14a67b44be420795))
* **renderers:** extract renderer-lib, guard trailing flags, stable detect tie-break ([b7d6160](https://github.com/PMDevSolutions/Aurelius/commit/b7d6160762cd90ada8fd69f5fcd0cb73005eb2a2))
* **tdd:** select test runner/library from manifest.test ([51f67d2](https://github.com/PMDevSolutions/Aurelius/commit/51f67d2309273c03cdd3f8580ca93974f40bfcab))
* **tokens:** derive token config target from renderer manifest ([7346767](https://github.com/PMDevSolutions/Aurelius/commit/7346767868eadcd2e257888e98da95a18e3e56c0))

## [1.1.0](https://github.com/PMDevSolutions/Aurelius/compare/v1.0.0...v1.1.0) (2026-05-25)


### Features

* add /export-design-system command for publishable component libraries ([c228dea](https://github.com/PMDevSolutions/Aurelius/commit/c228dea0bac9a321b3f0eae24a720fc977ab1d4e)), closes [#19](https://github.com/PMDevSolutions/Aurelius/issues/19)
* add 4 agents for expanded multi-framework coverage ([a26db71](https://github.com/PMDevSolutions/Aurelius/commit/a26db71e25ce9c376179a7bc8a4dd20a143f59d5)), closes [#10](https://github.com/PMDevSolutions/Aurelius/issues/10)
* add AST-based Storybook story generator with prop controls, variants, and MDX docs ([4ae0e97](https://github.com/PMDevSolutions/Aurelius/commit/4ae0e978bf62a3cfe0a985e34bfd0bb69e365b5d))
* add baseline and regression screenshot directories ([6b868c7](https://github.com/PMDevSolutions/Aurelius/commit/6b868c7222da887dc49f37d9ce7af882318d6497))
* add capture-baselines.sh for visual regression baseline management ([538142e](https://github.com/PMDevSolutions/Aurelius/commit/538142e0d366b6735da9cdd1c7b1453d5fc10e88))
* add cross-browser CSS reset and audit script ([042e4ab](https://github.com/PMDevSolutions/Aurelius/commit/042e4ab629bf5c557d0f82f4268c065cda4d502e))
* add cross-browser Playwright test matrix for web apps and PWAs ([8518579](https://github.com/PMDevSolutions/Aurelius/commit/8518579fa14270db71c5266ab64f4b87bc7eb868))
* add generateMdx and maxVariantsPerProp to storybook pipeline config ([5d3d9e0](https://github.com/PMDevSolutions/Aurelius/commit/5d3d9e05835c725816e658245e16440ec8d84fdb))
* add mutation-score quality gate subtask to orchestration config ([490e990](https://github.com/PMDevSolutions/Aurelius/commit/490e9904cf79151951b2f1b723a1452f6bca69cf))
* add MV3 compatibility tests and Firefox WebExtension support ([657d4d5](https://github.com/PMDevSolutions/Aurelius/commit/657d4d5207e7f4d0e8e52c2a95f89f5d838e3bfe))
* add orchestration config for parallel pipeline execution ([937ed04](https://github.com/PMDevSolutions/Aurelius/commit/937ed043952d533c0ef9ac14e638c62fc8fe5173))
* add parallel-orchestration skill for concurrent pipeline execution ([51f9011](https://github.com/PMDevSolutions/Aurelius/commit/51f901151a6c9eef517cd0d3ad4ae6649e909019))
* add PWA E2E templates with service worker lifecycle tests ([dccb75e](https://github.com/PMDevSolutions/Aurelius/commit/dccb75e29d44cd8ba4d999cd1ba9e5e264330d1a))
* add regression test reminder hook ([67995e3](https://github.com/PMDevSolutions/Aurelius/commit/67995e3ee799cdf0491df34511fe3cb048b57cfd))
* add regression-test.sh for visual regression comparison ([cb5ecb0](https://github.com/PMDevSolutions/Aurelius/commit/cb5ecb03682e235d6e3f455ebfc079182cb0b99b))
* add regressionTesting config to pipeline.config.json ([6cb6209](https://github.com/PMDevSolutions/Aurelius/commit/6cb6209c6c32d9fa5a5437c974c7be74909a74c8))
* add release automation with semantic versioning and changelog generation ([10566a4](https://github.com/PMDevSolutions/Aurelius/commit/10566a4f353f5889bf3f96d9529a074ff503166b))
* add responsive layout drift analyzer to visual-diff ([6d08d5f](https://github.com/PMDevSolutions/Aurelius/commit/6d08d5f18172c9ef33b0b51f184dfc261e6e11e0))
* add run-mutation-tests.sh script for Stryker ([d557a51](https://github.com/PMDevSolutions/Aurelius/commit/d557a51f1ebe382b0aaa528059c25d0875b30d4f))
* add Stryker config template for generated projects ([066a1f1](https://github.com/PMDevSolutions/Aurelius/commit/066a1f148e011ab85c0d4eac97635c6598ddac53))
* add Stryker configuration for Vitest runner ([a43eff4](https://github.com/PMDevSolutions/Aurelius/commit/a43eff4e69f42c516dba334531d1ff8f77a083cd))
* add Stryker mutation testing dependencies ([3e1ecb7](https://github.com/PMDevSolutions/Aurelius/commit/3e1ecb715e88729aa4a73561250a89a5dcaf4bef))
* add sub-pixel rendering classifier to visual-diff ([135b186](https://github.com/PMDevSolutions/Aurelius/commit/135b1862d33f7d0744e4fbdcbfcd73057b846efc))
* add ts-morph dependency for Storybook story generation ([889fef6](https://github.com/PMDevSolutions/Aurelius/commit/889fef650d9a4c7965a898ee71ff6ad93ed4d330))
* add typography analyzer for font weight and fallback detection ([f472b95](https://github.com/PMDevSolutions/Aurelius/commit/f472b95f5bf9f4c6bb504a2402404f7cf9705697))
* **canva:** improve pipeline reliability for complex multi-layer designs ([31bc035](https://github.com/PMDevSolutions/Aurelius/commit/31bc035946f678a95a77ca03e7336ae69fb08ba5))
* **ci:** add comprehensive CI/CD workflow for automated pipeline validation ([2d64235](https://github.com/PMDevSolutions/Aurelius/commit/2d6423561cf2f36809333c3520cf366bd69dcffd)), closes [#49](https://github.com/PMDevSolutions/Aurelius/issues/49)
* **commands:** add /verify-all and /ci slash commands ([6244577](https://github.com/PMDevSolutions/Aurelius/commit/624457753b0901ef39b2b5704a67154d3c907aa2)), closes [#50](https://github.com/PMDevSolutions/Aurelius/issues/50)
* **config:** add JSON Schema validation for pipeline.config.json ([9c93b99](https://github.com/PMDevSolutions/Aurelius/commit/9c93b993a9c75220c8d33301c69482e420e1fa19)), closes [#45](https://github.com/PMDevSolutions/Aurelius/issues/45)
* integrate parallel orchestration into build-from-canva pipeline ([9e64d93](https://github.com/PMDevSolutions/Aurelius/commit/9e64d9346cebab4bc5789843df206fa93f2367a8))
* integrate parallel orchestration into build-from-figma pipeline ([982e571](https://github.com/PMDevSolutions/Aurelius/commit/982e571f1202cea3f3f917d654966364e62a3cb9))
* integrate parallel orchestration into build-from-screenshot pipeline ([218b2d9](https://github.com/PMDevSolutions/Aurelius/commit/218b2d9603a69008fd4ee804bd16884a1a7085b1))
* **pipeline:** add incremental builds, caching, profiling and metrics dashboard ([010f8ed](https://github.com/PMDevSolutions/Aurelius/commit/010f8ed7612894956e8b2e8268c78d2d07867ce5))
* **security:** add comprehensive security audit and dependency hardening ([ecd4610](https://github.com/PMDevSolutions/Aurelius/commit/ecd461057cf695dd537cde8961380c1322994a55))
* surface sub-pixel, typography, and layout analyses in output ([f0244b2](https://github.com/PMDevSolutions/Aurelius/commit/f0244b2164e60a91eae4486eadbd6866bb99a1c1))
* **templates:** complete all framework starter templates ([dbee577](https://github.com/PMDevSolutions/Aurelius/commit/dbee5771e18781076c66458f94db0f1f0033b0d9)), closes [#42](https://github.com/PMDevSolutions/Aurelius/issues/42)


### Bug Fixes

* Add a new `token-verification` job to ` ([e053a6e](https://github.com/PMDevSolutions/Aurelius/commit/e053a6ecca5acab21eb517f1f0fca322e04ed115)), closes [#27](https://github.com/PMDevSolutions/Aurelius/issues/27)
* address code review findings ([76768f9](https://github.com/PMDevSolutions/Aurelius/commit/76768f9ba7db5f028df13105716695a7cc2d8314))
* address code review findings for mutation testing integration ([130df17](https://github.com/PMDevSolutions/Aurelius/commit/130df17c1672f19e4f462054492f086eb5ebc0cd))
* address code review findings for regression-test.sh ([4f26dd4](https://github.com/PMDevSolutions/Aurelius/commit/4f26dd41bd981494d5d5d7a45fe8ad0881f7f6e0))
* address code review findings for Tasks 2-3 ([8dadc7d](https://github.com/PMDevSolutions/Aurelius/commit/8dadc7daa80df8a7892f5511df530b6504034a76))
* align regression-test.sh with visual-diff.js JSON output format ([cccf91c](https://github.com/PMDevSolutions/Aurelius/commit/cccf91c8768c3a14c42d40af46f948ff5ebec27b))
* **ci:** add eslint and prettier devDependencies to fix Lint & Format CI check ([bf28c45](https://github.com/PMDevSolutions/Aurelius/commit/bf28c45c5dc3bb14db36f22e37ef676195bcce4c))
* **ci:** resolve lint, format, and test parallelism failures in CI ([28ad04b](https://github.com/PMDevSolutions/Aurelius/commit/28ad04b68efe30eed089909f4f353d966429fce8))
* **deps:** patch vite and qs security vulnerabilities ([80b359f](https://github.com/PMDevSolutions/Aurelius/commit/80b359f7acd0ba2d27823afed0085f15eb63b456))
* escape quotes in generated stories and sanitize variant identifiers ([8aae658](https://github.com/PMDevSolutions/Aurelius/commit/8aae65818b329a7f1a04a75b66e016cf8eec3806))
* **lint:** attach cause when re-throwing config parse errors ([09aa1fa](https://github.com/PMDevSolutions/Aurelius/commit/09aa1fa707aa0bb1e3c438c70872ece50993deaf))
* make run-mutation-tests.sh executable, normalize JSON skip output ([453e33b](https://github.com/PMDevSolutions/Aurelius/commit/453e33bc3519013918d2a343fc7ecc8b353544cc))
* **scripts:** exclude generated RELEASE_NOTES.md from doc-count guard ([53a37a2](https://github.com/PMDevSolutions/Aurelius/commit/53a37a2645cf38ed229617c41d23222b200ca3ae))
* set executable bit on regression-reminder.sh ([0eb9a76](https://github.com/PMDevSolutions/Aurelius/commit/0eb9a7606191b754b1ab310f2c66510e4ff92572))
* **test:** use os.tmpdir() for verify-test-coverage fixtures ([b47895d](https://github.com/PMDevSolutions/Aurelius/commit/b47895d386f112b7082bea52bfe7ff8c70a08d0f))
* wire config thresholds to analyzers, fix weight direction label ([df265ac](https://github.com/PMDevSolutions/Aurelius/commit/df265ac5ba89142e2e3ccfb39f22118ef9e89c5d))


### Refactoring

* **hooks:** extract inline hooks to dedicated files with tests and docs ([f47ff56](https://github.com/PMDevSolutions/Aurelius/commit/f47ff56006d9c07c168c5342ade5b2d3bb54f5f4)), closes [#46](https://github.com/PMDevSolutions/Aurelius/issues/46)
* replace generate-stories.sh with thin Node.js wrapper ([2f7700b](https://github.com/PMDevSolutions/Aurelius/commit/2f7700b1bb53ceecbbfe41d13120429e1cde4b76))
* **scripts:** extract shared bash utilities to scripts/lib ([688a354](https://github.com/PMDevSolutions/Aurelius/commit/688a3540dd2854c05167cd2694f02b6427968d90))

## [0.5.0] - 2026-03-23

### Features

- 48 custom Claude Code agents for engineering, design, testing, marketing, and operations
- 17 development skills including Figma-to-React, Canva-to-React, and TDD workflows
- 10-phase autonomous Figma-to-React pipeline with enforced TDD and pixel-diff visual QA
- Canva-to-React pipeline with AI-powered token inference
- Multi-framework support (React, Vue 3, Svelte/SvelteKit, React Native/Expo)
- Screenshot/URL-to-app conversion pipeline
- Parallel orchestration for concurrent pipeline phase execution
- App-type awareness for web apps, Chrome extensions, and PWAs
- 21 automation scripts for linting, testing, visual diff, bundle analysis, and more
- Design token lockfile enforcement and drift detection
- Cross-browser testing via Playwright (Chromium, Firefox, WebKit)
- Storybook generation and component documentation
- Dark mode and responsive verification pipelines
- 8 automated hooks for pre-commit guards and CI checks
- MCP server integration (Figma, Playwright, Chrome DevTools, Canva)
- 4 Claude Code plugins (episodic-memory, commit-commands, superpowers, ai-taskmaster)
- Starter templates for Next.js, Vite, Chrome extensions, and PWAs
- MIT license, contributing guide, security policy, and code of conduct
