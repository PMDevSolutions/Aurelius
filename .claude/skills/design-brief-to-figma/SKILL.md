---
name: design-brief-to-figma
description: Generates a real Figma file from a design-brief.json. Renders the brief as one high-fidelity HTML mockup per page (via the conversation-designer agent), serves them locally, creates a new Figma file, and captures each mockup into it with the Figma MCP generate_figma_design tool. Outputs a Figma URL that /build-from-figma consumes. Phase C1 of /build-from-conversation. Keywords: design brief to Figma, generate Figma design, Figma file generation, HTML mockup capture, conversational design
---

# Design Brief to Figma — Generated Design Files

## Purpose

Turn the `design-brief.json` produced by `conversation-intake` into an actual Figma file, so the standard `/build-from-figma` pipeline can run against it unchanged. The mechanism is **HTML-mockup capture**: `mcp__figma__generate_figma_design` imports a rendered web page into an existing Figma file pixel-perfectly, so this skill renders the brief as static HTML first, then captures each page. The generated file becomes the single visual source of truth — Phase 5 pixel-diffs the built app against frames created here.

## When to Use

- Phase C1 of `/build-from-conversation`, immediately after `conversation-intake`
- Any time a confirmed `design-brief.json` + `build-spec.json` pair exists and a Figma file needs to be generated from it

## Inputs

- **Required:** `.claude/plans/design-brief.json` and `.claude/plans/build-spec.json` (with `"source": "conversation"`)
- **Reads:** `.claude/pipeline.config.json` → `conversation.designGeneration` (`mockupDir`, `mockupServerPort`, `reviewBeforeHandoff`, `maxRegenerationAttempts`, `capturePollIntervalMs`, `capturePollMaxAttempts`) and `conversation.retry`

## Process

### Step 1: Preflight — Figma Auth and Plan

```
1. Call mcp__figma__whoami
   → Confirms authentication and returns the user's plans
2. Resolve planKey:
   - Exactly one plan → use its `key` field verbatim
   - Multiple plans → ask the user which team/organization to use (one question)
3. If the Figma MCP is unavailable or unauthenticated, stop here —
   report it and leave the brief/spec artifacts intact for a later resume
```

### Step 2: Render the Brief as HTML Mockups

Dispatch the `conversation-designer` agent to write one self-contained HTML mockup per page in `build-spec.json > pages[]` into `conversation.designGeneration.mockupDir` (default `.claude/design-mockups/`):

```
For each page: <mockupDir>/<route-slug>.html   (e.g. dashboard.html, settings.html)
```

The agent definition owns the mockup quality bar (deterministic, no JS, exact brief values, real text content, `data-section` landmarks). After generation, record each page's `mockupPath` in `build-spec.json`.

### Step 3: Serve the Mockups Locally

`generate_figma_design` captures a *served* page, so host the mockup directory on a local static server:

```bash
npx serve <mockupDir> -l <mockupServerPort>   # default port 4173
```

Run it in the background and verify each page responds (e.g. `http://localhost:4173/dashboard.html`) before capturing. Any static server works; `npx serve` keeps it dependency-free.

### Step 4: Create the Figma File

```
1. If the Figma MCP serves a figma-create-new-file skill, load it first
   (resource: skill://figma/figma-create-new-file/SKILL.md) — its tool
   description requires this when available
2. Call mcp__figma__create_new_file with:
   - fileName:  design-brief.json > appName
   - planKey:   from Step 1
   - editorType: "design"
3. Record the returned fileKey and file URL
```

### Step 5: Capture Each Page (generate_figma_design)

Each capture is **single-use and captures exactly one page** — run this loop once per page in the build spec:

```
FOR each page IN build-spec.pages:
  1. Call mcp__figma__generate_figma_design({ fileKey })
     → Returns a capture script + a captureId (single-use; do not reuse across pages)
  2. Follow the returned capture-script instructions against the page's local
     mockup URL (http://localhost:<port>/<page>.html). For local URLs this
     typically means opening the URL with the capture fragment so the script
     can snapshot the rendered DOM.
  3. Poll: mcp__figma__generate_figma_design({ fileKey, captureId })
     every conversation.designGeneration.capturePollIntervalMs (default 5000ms),
     up to capturePollMaxAttempts (default 10), until status is "completed"
  4. On timeout or failure: apply conversation.retry (exponential backoff) and
     retry the page with a FRESH captureId — the old one is spent
```

Each completed capture lands as a new page/frame in the Figma file.

### Step 6: Map Generated Node IDs into the Build Spec

```
1. Call mcp__figma__get_metadata({ fileKey })          → top-level pages (guid + name)
2. For each captured page, drill in as needed to identify its root frame
3. Write the IDs back into build-spec.json:
   - pages[].figmaNodeId = the captured frame's node ID (e.g. "1:2")
4. Populate the figma block and keep the source untouched:
   {
     "source": "conversation",            // unchanged — this is how figma-intake fast-paths
     "figma": {
       "fileKey": "<fileKey>",
       "fileName": "<appName>",
       "url": "https://figma.com/design/<fileKey>/<appName>",
       "generated": true
     }
   }
```

### Step 7: Review Gate (Conditional)

When `conversation.designGeneration.reviewBeforeHandoff` is `true` (default):

```
1. Capture a screenshot of each generated page (mcp__figma__get_screenshot)
2. Present the Figma URL + screenshots to the user
3. On rejection: route feedback to conversation-designer, regenerate only the
   affected mockups, and re-capture only those pages (fresh captureIds).
   Max loops: conversation.designGeneration.maxRegenerationAttempts (default 2)
4. On approval (or when the review gate is disabled): proceed
```

### Step 8: Cleanup and Output

Stop the static server. Return the Figma file URL — `/build-from-conversation` passes it to `/build-from-figma`, whose Phase 1 (`figma-intake`) fast-paths on the conversation-sourced build spec.

## Output

**Primary:** Figma file URL (real, editable file in the user's account)
**Secondary:** Updated `.claude/plans/build-spec.json` (populated `figma` block, `pages[].figmaNodeId`, `pages[].mockupPath`)
**Tertiary:** `<mockupDir>/*.html` mockups (kept — they document the generated design and allow cheap re-capture)

## Error Handling

- **Figma MCP unavailable / unauthenticated:** Stop before generating anything; the brief and spec survive for a later resume. Suggest checking Figma auth (`whoami`).
- **Multiple plans and no answer:** Do not guess a `planKey`; a file created in the wrong org is outward-facing. Wait for the user.
- **Capture timeout (poll budget exhausted):** Retry per `conversation.retry` with a fresh captureId. If a page still fails, continue capturing remaining pages and report the failed page for manual capture.
- **Mockup server port in use:** Increment the port, retry once, and record the port actually used.
- **Generated file has no Figma variables:** Expected — captured designs carry styles, not variable definitions, so Phase 2 (`design-token-lock`) falls back to computed styles. This is the documented `figma-intake`/token-lock fallback; the lockfile is still authoritative because the mockups were generated *from* the brief's exact values.

## Integration

- **Consumed by:** `/build-from-conversation` (Phase C1); its output URL feeds `/build-from-figma`
- **Uses:** `conversation-designer` agent, `mcp__figma__whoami`, `mcp__figma__create_new_file`, `mcp__figma__generate_figma_design`, `mcp__figma__get_metadata`, `mcp__figma__get_screenshot`, a local static server (`npx serve`)
- **Config keys read:** `pipeline.config.json` → `conversation.designGeneration.*`, `conversation.retry`
