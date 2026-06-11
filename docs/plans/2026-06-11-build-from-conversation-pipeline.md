# /build-from-conversation Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/build-from-conversation` command that interviews the user, generates a real Figma file from the resulting design brief, and hands off to the existing `/build-from-figma` pipeline (issue #33).

**Architecture:** Two new pre-pipeline phases. Phase C0 (`conversation-intake` skill) interviews the user (max 7 questions) and writes `build-spec.json` (`"source": "conversation"`) plus a new `design-brief.json` artifact. Phase C1 (`design-brief-to-figma` skill) has the new `conversation-designer` agent render the brief as one self-contained HTML mockup per page, serves them locally, creates a Figma file (`mcp__figma__whoami` → `mcp__figma__create_new_file`), captures each mockup into it via `mcp__figma__generate_figma_design` (one single-use captureId per page, poll ~5s up to 10×), maps generated node IDs into the build spec via `get_metadata`, then invokes `/build-from-figma` with the new URL. `figma-intake` gains a fast-path that skips the interview when the spec's source is `"conversation"`. The `/build-from-figma` pipeline itself is unchanged.

**Tech Stack:** Markdown skill/agent/command definitions, `pipeline.config.json` + JSON Schema, Vitest structural tests (pattern: `scripts/__tests__/canva-pipeline.test.js`), Figma MCP (whoami / create_new_file / generate_figma_design / get_metadata).

**Key facts discovered during research (do not re-derive):**

- `mcp__figma__generate_figma_design` is a *web-page/HTML → Figma* capture tool, NOT text-to-design. It requires an existing `fileKey`, captures exactly one page per call, returns a capture script + single-use `captureId` on the first call, and is polled with that `captureId` (~every 5s, up to 10×) until `completed`. Localhost URLs are supported. Hence the HTML-mockup intermediate step.
- `mcp__figma__create_new_file` requires `planKey` (from `whoami`; ask the user only if they have multiple plans) and `editorType: "design"`. Its description asks to load the Figma-served `figma-create-new-file` skill (`skill://figma/figma-create-new-file/SKILL.md`) first when available.
- Captured designs have **no Figma variables**, so Phase 2 (`design-token-lock`) falls back to computed styles — an already-documented fallback in `figma-intake`.
- `check-doc-counts.sh` counts agents (`.claude/agents/*.md`, README excluded) and skills (subdirs of `.claude/skills/` containing `SKILL.md`) and fails on any stale "N agents"/"N skills" claim in live `*.md` (CHANGELOG/RELEASE_NOTES/docs/plans excluded). New totals: **55 agents, 22 skills**. Also fix the two un-enforced "3 pipelines" claims → 4.
- `build-spec.json` `source` values now: `"figma" | "canva" | "screenshot" | "conversation"`.
- Husky pre-commit runs the doc-count guard; commitlint enforces Conventional Commits.

---

### Task 1: Failing structural tests + fixtures (RED)

**Files:**
- Create: `scripts/__tests__/conversation-pipeline.test.js`
- Create: `.claude/test-fixtures/conversation-dashboard.build-spec.json`
- Create: `.claude/test-fixtures/conversation-dashboard.design-brief.json`

Test groups (mirror `canva-pipeline.test.js` style):
1. design-brief fixture: version, `source: "conversation"`, styleDirection enum, colorPreferences (style enum, userProvided bool), typography.style enum, layoutStyle.density enum, componentDescriptions = non-empty map of strings, darkMode bool, animations enum, specialRequirements array.
2. build-spec fixture: `source: "conversation"`, `conversation` block (description, designBrief path), populated `figma` block (fileKey, url matching `figma.com/design/`), pages with figmaNodeId/name/route/sections, components with reactName + category enum, valid outputTarget.
3. `pipeline.config.json` → `conversation` section: enabled, interview.maxQuestions 1–7, interview.confirmBriefWithUser true, designGeneration (mockupDir, mockupServerPort, reviewBeforeHandoff, maxRegenerationAttempts ≥1, capturePollIntervalMs > 0, capturePollMaxAttempts ≥ 1), retry (same assertions as canva.retry).
4. `pipeline.config.schema.json` declares `properties.conversation` with retry `$ref` to retryOptions.
5. `conversation-intake/SKILL.md`: mentions design-brief.json, max-7-questions, `"source": "conversation"`, renderer registry detection.
6. `design-brief-to-figma/SKILL.md`: mentions generate_figma_design, create_new_file, whoami/planKey, captureId + polling, get_metadata → figmaNodeId mapping, HTML mockups, single-use captures.
7. `conversation-designer.md` agent: frontmatter name, design-brief.json schema ownership, HTML mockup rules, style directions (minimal/bold/playful/corporate/dark).
8. `build-from-conversation.md` command: references conversation-intake, design-brief-to-figma, /build-from-figma handoff, $ARGUMENTS, fast-path note, `conversation` config.
9. `figma-intake/SKILL.md` fast-path: contains `"source": "conversation"` skip-interview rule.

Run: `pnpm vitest run scripts/__tests__/conversation-pipeline.test.js` → expect FAIL (missing config section + files).

### Task 2: `pipeline.config.json` + schema (`conversation` section)

- Modify: `.claude/pipeline.config.json` — add `conversation` after `screenshot`: enabled, interview{maxQuestions: 7, confirmBriefWithUser: true}, designGeneration{mockupDir ".claude/design-mockups", mockupServerPort 4173, reviewBeforeHandoff true, maxRegenerationAttempts 2, capturePollIntervalMs 5000, capturePollMaxAttempts 10}, retry (canva-style; retryableErrors include rate_limit, timeout, server_error, capture_failed, mcp_connection_lost).
- Modify: `.claude/pipeline.config.schema.json` — add matching `conversation` property (additionalProperties: false throughout; retry → `#/$defs/retryOptions`).
- Verify: `./scripts/validate-pipeline-config.sh`.

### Task 3: `conversation-designer` agent

Create `.claude/agents/conversation-designer.md` (frontmatter: name/description/color/tools). Owns: natural-language → concrete design decisions, design-brief.json authoring, style-direction defaults table, per-component visual specs, self-contained HTML mockup generation rules (1440px desktop frame, inline tokens, Google Fonts only, no JS, deterministic), regeneration on feedback.

### Task 4: `conversation-intake` skill

Create `.claude/skills/conversation-intake/SKILL.md`: local-project auto-discovery (renderer registry, app type, components, UI libs), max-7-question interview (purpose, pages, style, colors, renderer-if-undetected, special requirements, reuse-if-components-found), conversation-designer expansion, writes `.claude/plans/design-brief.json` + `.claude/plans/build-spec.json` with `"source": "conversation"` and `figma: null` (pending generation), confirm-and-proceed gate.

### Task 5: `design-brief-to-figma` skill

Create `.claude/skills/design-brief-to-figma/SKILL.md` per the architecture above (preflight whoami/planKey → mockups → static server (`npx serve`) → create_new_file → per-page generate_figma_design capture+poll → get_metadata node-ID mapping → build-spec figma block update → optional review gate → output URL). Error handling: capture timeout/retry, multiple plans, MCP down, no-variables token fallback note.

### Task 6: `/build-from-conversation` command

Create `.claude/commands/build-from-conversation.md` (allowed-tools frontmatter incl. figma write tools + chrome-devtools): Phase C0 (intake), Phase C1 (design generation), handoff (invoke `build-from-figma` with generated URL; note figma-intake fast-path, token-lock computed-style fallback, Phase 0 skip on greenfield), resume checks, error recovery, completion summary.

### Task 7: `figma-intake` fast-path

Modify `.claude/skills/figma-intake/SKILL.md`: new Step 0 — if `.claude/plans/build-spec.json` exists with `"source": "conversation"` and a populated `figma` block, skip discovery questions; validate spec, backfill missing `figmaNodeId`s via get_metadata, do not re-interview, proceed to Phase 2. Update `source` comment enum + Integration section.

Run: `pnpm vitest run scripts/__tests__/conversation-pipeline.test.js` → expect PASS (GREEN).

### Task 8: Documentation sweep

- `CLAUDE.md`: tree counts 55/22, agents table (Design-to-Code 7→8 + conversation-designer), skills table header 22 + 2 rows, new "Conversation-to-App Pipeline" section, Quick Command Reference + docs tree + architecture footer (55 agents, 22 skills) + Last Updated 2026-06-11.
- `README.md`: 55/22 claims, new quick-start block, Design-to-Code 7→8, skills tables renumbered (8–12 pipeline source skills, 13–21 react, 22 export), doc index row, "3 pipelines"→4.
- `.claude/skills/README.md`: Total 22, two new entries, renumber, pipeline flow diagram + Last Updated.
- `.claude/CUSTOM-AGENTS-GUIDE.md`: Total 55, Design-to-Code row, integration table row, "20 custom skills"→22, quick-reference row, Last Updated.
- `.claude/AGENT-NAMING-GUIDE.md`: 54→55.
- `docs/onboarding/architecture.md`: 54/20→55/22, "3 Pipelines"→4 (diagram), Design-to-Code (8), pipeline-skills table + flow, key artifacts (design-brief.json).
- `docs/onboarding/README.md` (14), `docs/onboarding/quickstart.md` (111, 189–190), `docs/react-development/README.md` (178–179, 206–207), `CONTRIBUTING.md` (140), `docs/guides/agent-creation.md` (5): count updates.
- `docs/onboarding/pipeline-configuration.md`: new "Conversation Pipeline (`conversation`)" section after Screenshot.
- Create `docs/conversation-to-app/README.md` (pipeline guide, mirrors canva guide structure, concise; documents the HTML-capture mechanism and the no-variables token fallback).

### Task 9: Verify

- `pnpm vitest run` (full suite)
- `./scripts/validate-pipeline-config.sh`
- `./scripts/check-doc-counts.sh`
- `pnpm eslint scripts/__tests__/conversation-pipeline.test.js`
- `pnpm prettier --check` on touched JSON/JS

### Task 10: Ship

Conventional commits (feat + docs split if clean), push branch `33-feat-add-build-from-conversation-command-conversational-app-creation-via-figma-generation`, PR → main, body `Closes #33`. GPG signing may stall — retry, never bypass.
