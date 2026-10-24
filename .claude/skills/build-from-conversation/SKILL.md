---
name: build-from-conversation
description: Talk-to-build pipeline with no design file. A bounded interview produces a build spec and design brief, a real Figma file is generated from HTML mockups, and the run hands off to /build-from-figma. Use when the user describes an app in words and has no Figma, Canva or screenshot to start from. Keywords: build from conversation, describe an app, no design file, generate Figma design
argument-hint: "[app description]"
disable-model-invocation: true
allowed-tools: Skill, Agent, Workflow, Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, mcp__figma__*, mcp__chrome-devtools__*, mcp__playwright__*
---

# /build-from-conversation — Conversational App Creation via Figma Generation

You are the master orchestrator for building a working, tested app from nothing but a conversation. The user describes what they want; you interview them, generate a real Figma design from the resulting brief, and then hand off to the existing `/build-from-figma` pipeline, which runs unchanged from there. "Talk to build" — no pre-existing design file required.

```
Conversation ──► [C0] conversation-intake ──► build-spec.json + design-brief.json
                          │
                          ▼
                 [C1] design-brief-to-figma ──► real Figma file (URL + node IDs)
                          │
                          ▼
                 /build-from-figma <generated URL> ──► phases 0-9, unchanged
```

**Key enforcement rules:**
- **The interview is bounded** — at most `conversation.interview.maxQuestions` (default 7) questions. Auto-discover everything else.
- **The brief is confirmed** — when `conversation.interview.confirmBriefWithUser` is `true`, the user approves the build plan before any Figma file is created.
- **The generated design is reviewed** — when `conversation.designGeneration.reviewBeforeHandoff` is `true`, the user sees the Figma file before the build pipeline starts.
- **Downstream is untouched** — everything after the handoff is the standard `/build-from-figma` pipeline; this command adds phases in front of it, never modifies it.

## Input

The user provides: `$ARGUMENTS` (optional — a brief initial description of the app, e.g. "a minimal analytics dashboard with auth and dark mode")

If `$ARGUMENTS` is non-empty, pass it to the `conversation-intake` skill as seed answers; the skill skips any interview question the description already answers. If empty, the interview starts from Question 1.

## Configuration

Load `.claude/pipeline.config.json` at the start. This command reads the `conversation` section:
- `conversation.interview` — question cap, brief confirmation gate
- `conversation.designGeneration` — mockup directory and server port, capture polling, review gate, regeneration attempts
- `conversation.retry` — exponential backoff for Figma MCP capture failures

All downstream settings (visual diff thresholds, TDD enforcement, quality gates) are read by `/build-from-figma` as usual.

## Progress Tracking

Track the run in `.claude/plans/pipeline-state.json`, in the shape `/build-from-figma` defines (`.claude/skills/build-from-figma/SKILL.md` → Progress Tracking), with `"pipeline": "conversation"` and phases `C0` (conversation-intake → build-spec.json + design-brief.json) and `C1` (design-brief-to-figma → Figma URL + node IDs). At the handoff, set `"pipeline": "figma"`, put the generated Figma URL in `source`, and keep `C0` and `C1` in `phases`; `/build-from-figma` adds phases 0-9 to the same file.

## Phase C0: Conversation Intake

Invoke the `conversation-intake` skill.

**Input:** `$ARGUMENTS` (optional seed description)
**Output:** `.claude/plans/build-spec.json` with `"source": "conversation"` and `figma: null`, plus `.claude/plans/design-brief.json`

This phase:
1. Auto-discovers local project context (renderer registry, app type, existing components, UI libraries)
2. Interviews the user — maximum of 7 questions, skipping anything derivable
3. Dispatches the `conversation-designer` agent to expand answers into concrete design decisions
4. Writes both artifacts and presents the build plan for confirmation

**Resume check:** If `.claude/plans/build-spec.json` already exists with `"source": "conversation"`:
- `figma` is `null` → offer to reuse it and resume at Phase C1, or re-run the interview
- `figma` is populated → offer to skip straight to the handoff with the recorded URL

## Phase C1: Figma Design Generation

Invoke the `design-brief-to-figma` skill.

**Input:** `design-brief.json` + `build-spec.json`
**Output:** A real Figma file URL; `build-spec.json` updated in place (`figma` block populated, `pages[].figmaNodeId` and `pages[].mockupPath` filled in)

This phase:
1. Verifies Figma MCP auth (`whoami`) and resolves the `planKey`
2. Dispatches `conversation-designer` to render one self-contained HTML mockup per page
3. Serves the mockups locally and creates a new Figma file (`create_new_file`)
4. Captures each mockup into the file via `generate_figma_design` (one single-use capture per page, polled until complete)
5. Maps the generated node IDs into the build spec (`get_metadata`)
6. Shows the generated design to the user when `conversation.designGeneration.reviewBeforeHandoff` is `true`; on rejection, regenerates the affected pages (max `conversation.designGeneration.maxRegenerationAttempts` loops)

**Resume check:** If `build-spec.json` already has a populated `figma` block with `"generated": true`, confirm the file still exists (`get_metadata`) and skip to the handoff.

## Handoff: /build-from-figma

Continue with the `/build-from-figma` pipeline in this session, with the generated Figma URL as its input, exactly as if the user had run:

```
/build-from-figma https://figma.com/design/<fileKey>/<appName>
```

`/build-from-figma` sets `disable-model-invocation`, so Claude never starts that pipeline unprompted and cannot call it through the Skill tool. Read `.claude/skills/build-from-figma/SKILL.md` and follow it, with the generated URL in place of `$ARGUMENTS`; this run is the user's request for it.

The standard pipeline runs unchanged. What to expect on a conversation-sourced run:

- **Phase 0 (token sync)** skips on greenfield projects — no lockfile exists yet.
- **Phase 1 (figma-intake)** detects `"source": "conversation"` in the existing build spec and **fast-paths**: no second interview, no rediscovery — it validates the spec, backfills any missing `figmaNodeId` via `get_metadata`, and proceeds.
- **Phase 2 (design-token-lock)** finds no Figma variables (captured designs carry styles, not variable definitions) and falls back to computed styles — the documented fallback. The extracted values match the design brief because the mockups were generated from its exact values.
- **Phase 5 (visual diff)** compares the built app against the generated Figma frames — the same frames captured from your mockups, closing the loop from conversation to verified pixels.

## Error Recovery

- **Figma MCP unavailable or unauthenticated:** Complete Phase C0 anyway — the brief and spec are durable artifacts. Report that design generation is blocked, and resume at Phase C1 once the user has Figma access working (`whoami` to verify).
- **Capture failures (timeout, rate limit, connection lost):** Apply `conversation.retry` exponential backoff with a fresh capture per attempt. If a page exhausts retries, continue with the remaining pages and list the failed ones for manual re-capture before the handoff.
- **User rejects the generated design repeatedly:** After `maxRegenerationAttempts` loops, stop and summarize the disagreement — offer to hand-edit the Figma file (it's a real file in their account) and resume with `/build-from-figma <url>` directly.
- **Multiple Figma plans:** Never guess which team/org to create the file in — ask.
- **Session interrupted:** On resume, read `.claude/plans/pipeline-state.json` and apply the resume checks above. The artifacts (`build-spec.json`, `design-brief.json`, mockups, the Figma file itself) make every phase resumable.

## Completion

When the handoff pipeline finishes, present:

1. The Figma file URL (the user now owns a real, editable design file)
2. The standard build report summary from `/build-from-figma` Phase 9
3. Interview-to-app traceability: questions asked, assumptions the designer made (from `design-brief.json` notes), and any items needing manual review
4. Next steps (e.g., "run `pnpm dev` to see the app; edit the Figma file and re-run `/build-from-figma` to iterate")
