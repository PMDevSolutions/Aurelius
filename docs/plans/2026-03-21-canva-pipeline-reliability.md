# Canva Pipeline Reliability Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve reliability of the Canva-to-React pipeline for complex multi-layer designs by adding grouped/nested element handling, retry logic, better CSS generation, and integration tests.

**Architecture:** Four focused changes across agent definitions, command orchestrator, pipeline config, and a new test file. All changes are to markdown agent/skill/command definitions and JSON config, plus one new JS test file.

**Tech Stack:** Markdown (agent/skill definitions), JSON (pipeline config), JavaScript/Vitest (integration tests)

---

### Task 1: Add Grouped/Nested Element Handling to canva-react-converter

**Files:**
- Modify: `.claude/agents/canva-react-converter.md:60-76` (Handling Ambiguity section)

**Step 1: Read the current file to confirm line numbers**

Run: `head -n 160 .claude/agents/canva-react-converter.md`

**Step 2: Add a new section for nested/grouped element handling**

After the existing "Handling Ambiguity" section (### 3), insert a new section `### 3a. Grouped & Nested Element Strategy` between lines 76 and 77 (before ### 4. Component Mapping Strategy).

Add the following content:

```markdown
### 3a. Grouped & Nested Element Strategy

Canva designs frequently use deeply nested groups, overlapping layers, and positioned elements that don't map cleanly to DOM hierarchy. Use this strategy for complex multi-layer designs:

**Flattening rules (depth-first):**
1. **Single-child groups** → unwrap (skip the wrapper, promote the child)
2. **Groups where all children share the same axis** → flatten to a single flex container
3. **Groups with mixed axes** → keep the group as a container, use CSS Grid
4. **Nested groups 3+ levels deep** → flatten intermediate wrappers unless they have distinct styling (background, border, shadow)

**Overlapping / absolutely-positioned elements:**
- Detect overlapping regions in the screenshot (elements sharing the same bounding area)
- Use `relative` parent + `absolute` children only when elements truly overlap visually
- For slight overlaps (badges, avatars on cards), prefer `relative` with negative margin over absolute positioning
- Never use absolute positioning for main layout — only decorative overlays

**Z-order inference:**
- Visually foreground elements (brighter, sharper, with shadow) get higher z-index
- Background decorative elements (blurred, muted) get lower z-index
- Default stacking: text > interactive elements > images > decorative shapes

**Multi-layer composition patterns:**
| Visual Pattern | Implementation |
|---------------|---------------|
| Card with badge overlay | `relative` card, `absolute -top-2 -right-2` badge |
| Hero with background image + text | `relative` container, `bg-cover`, text with `relative z-10` |
| Overlapping avatar stack | `flex` with negative margin `-ml-3` on subsequent items |
| Floating action button | `fixed bottom-4 right-4` or `sticky` depending on context |
| Decorative shapes behind content | `absolute inset-0 -z-10` with overflow-hidden parent |

**Error recovery for ambiguous groups:**
- If a group has > 8 direct children with no clear layout pattern, split into logical sub-groups based on visual proximity
- If nesting exceeds 4 levels, log a warning and flatten aggressively
- Always prefer fewer DOM nodes — measure twice, nest once
```

**Step 3: Verify the edit preserved valid markdown**

Run: `cat .claude/agents/canva-react-converter.md | head -n 120`
Expected: new section appears between "Handling Ambiguity" and "Component Mapping Strategy"

**Step 4: Commit**

```bash
git add .claude/agents/canva-react-converter.md
git commit -m "feat(canva): add grouped/nested element handling strategy to converter agent"
```

---

### Task 2: Add Retry Logic for Canva API Rate Limits

**Files:**
- Modify: `.claude/commands/build-from-canva.md:176-184` (Error Recovery section)
- Modify: `.claude/pipeline.config.json:255-269` (canva section)
- Modify: `.claude/skills/canva-intake/SKILL.md:292-302` (Error Handling section)

**Step 1: Add retry config to pipeline.config.json**

In the `canva` section (line 255), add a `retry` block after `restApiFallback`:

```json
"retry": {
  "maxAttempts": 3,
  "initialDelayMs": 2000,
  "backoffMultiplier": 2,
  "maxDelayMs": 30000,
  "retryableErrors": [
    "rate_limit",
    "timeout",
    "server_error",
    "export_failed",
    "mcp_connection_lost"
  ]
}
```

**Step 2: Add retry protocol to build-from-canva.md Error Recovery section**

Replace the existing Error Recovery section with an expanded version that includes retry logic:

```markdown
## Error Recovery

### Retry Protocol

For transient failures (rate limits, timeouts, MCP disconnects), apply exponential backoff from `pipeline.config.json > canva.retry`:

```
FOR attempt IN 1..maxAttempts:
  TRY operation
  ON SUCCESS: continue pipeline
  ON FAILURE:
    IF error type IN retryableErrors:
      delay = min(initialDelayMs * backoffMultiplier^(attempt-1), maxDelayMs)
      WAIT delay
      LOG: "Retry {attempt}/{maxAttempts} after {delay}ms — {error type}"
      CONTINUE
    ELSE:
      FALL THROUGH to manual recovery below
AFTER maxAttempts exhausted:
  LOG: "All {maxAttempts} retries failed for {operation}"
  FALL THROUGH to manual recovery
```

### Canva MCP Failures
- **Rate limited:** Automatic retry with backoff (see protocol above). If all retries fail, pause 60 seconds and retry once more. If still failing, ask user to wait and retry later.
- **MCP connection lost:** Retry connection 3 times. If it fails, ask user to restart Canva AI Connector and re-run the current phase.
- **Export timeout:** Retry with backoff. On persistent failure, reduce export scale to 1x and retry. If still failing, ask user to manually export.

### Content Failures
- **Export fails:** Ask user to manually export design pages as PNG from Canva and provide file paths.
- **Token inference low confidence:** Present all tokens with detailed confidence breakdown. Offer to accept user-provided brand guidelines as override.
- **Complex nested groups fail to parse:** Flatten aggressively (see canva-react-converter § 3a), log skipped layers, continue.

### Environment Failures
- **Dev server won't start:** Check for port conflicts, missing dependencies. Run `pnpm install` if needed.
- **Tests won't pass after 3 attempts:** Mark component as needing manual intervention, continue with remaining.
- **Build fails:** Check TypeScript errors first, then dependency issues. Report blockers.
- **Session interrupted:** On resume, check TodoWrite progress. Skip completed phases, resume from first incomplete.
```

**Step 3: Add retry guidance to canva-intake SKILL.md Error Handling section**

At the end of the Error Handling section, add:

```markdown
- **Rate limited by Canva API:** Apply retry protocol from `pipeline.config.json > canva.retry`. Log each retry attempt. If all retries fail, ask user to wait 2 minutes and re-invoke Phase 1.
- **MCP timeout during export:** Retry up to 3 times with exponential backoff. If persistent, reduce export scale to 1x and retry. Fall back to manual export as last resort.
```

**Step 4: Commit**

```bash
git add .claude/commands/build-from-canva.md .claude/pipeline.config.json .claude/skills/canva-intake/SKILL.md
git commit -m "feat(canva): add retry logic with exponential backoff for API rate limits"
```

---

### Task 3: Improve CSS Generation from Canva Styling Data

**Files:**
- Modify: `.claude/agents/canva-react-converter.md:79-91` (Component Mapping Strategy section)
- Modify: `.claude/skills/canva-token-inference/SKILL.md:104-113` (Pass 4 — Effects)

**Step 1: Expand the Component Mapping Strategy in canva-react-converter.md**

After the existing Component Mapping table (### 4), add a new section `### 4a. Advanced CSS Generation`:

```markdown
### 4a. Advanced CSS Generation

Canva designs use styling patterns that need careful translation to Tailwind CSS:

**Gradient handling:**
- Linear gradients → `bg-gradient-to-{direction}` with `from-{color}` / `via-{color}` / `to-{color}`
- If gradient has > 3 stops, use arbitrary value: `bg-[linear-gradient(...)]`
- Radial gradients → arbitrary value: `bg-[radial-gradient(...)]`
- Always extract gradient colors into the lockfile as token values

**Background effects:**
- Blurred backgrounds → `backdrop-blur-{size}` + semi-transparent background
- Image overlays → pseudo-element or `bg-blend-{mode}`
- Pattern fills → CSS `background-image` with token-referenced colors

**Text effects:**
- Text shadows → use lockfile shadow tokens, apply via `[text-shadow:...]` arbitrary
- Letter spacing → map to Tailwind tracking scale (`tracking-tight`, `tracking-wide`)
- Text decoration → `underline`, `decoration-{color}`, `underline-offset-{n}`
- Text gradient → `bg-clip-text text-transparent bg-gradient-to-r`

**Border and outline patterns:**
- Double borders → `ring-{width} ring-{color}` + `border-{width} border-{color}`
- Dashed/dotted → `border-dashed` or `border-dotted`
- Inner borders → `shadow-[inset_0_0_0_Npx_color]`
- Focus rings → `focus:ring-2 focus:ring-{color} focus:ring-offset-2`

**Opacity and blend modes:**
- Layer opacity → `opacity-{value}` (never use rgba alpha for structural opacity)
- Blend modes → `mix-blend-{mode}` for overlapping elements
- Semi-transparent backgrounds → `bg-{color}/{opacity}` (e.g., `bg-black/50`)

**Animation hints from static designs:**
- Elements with visual "motion" cues (arrows, progress indicators) → add subtle CSS transitions
- Hover states → infer from button styling (darker shade = hover, lighter = active)
- Don't over-animate — only add transitions for interactive elements
```

**Step 2: Expand Pass 4 (Effects) in canva-token-inference SKILL.md**

Replace the existing Pass 4 content with a more comprehensive extraction:

```markdown
**Pass 4 — Effects & Advanced Styling:**
```
Extract ALL visual effects and advanced styling:

1. Border radius values (per component type: buttons, cards, inputs, avatars)
2. Box shadows (subtle, medium, large — note direction and spread)
3. Border styles (width, color, style: solid/dashed/dotted)
4. Opacity values (structural vs decorative)
5. Gradients:
   - Direction (top-to-bottom, left-to-right, diagonal)
   - Color stops with positions
   - Type (linear, radial)
6. Backdrop effects:
   - Blur radius estimates
   - Background opacity behind blur
7. Text effects:
   - Letter spacing (tight, normal, wide)
   - Text shadows (color, offset, blur)
8. Transitions/motion hints:
   - Elements that appear to have hover states
   - Progress indicators or animated elements

For each, provide confidence level and specific Tailwind mapping suggestion.
```
```

**Step 3: Commit**

```bash
git add .claude/agents/canva-react-converter.md .claude/skills/canva-token-inference/SKILL.md
git commit -m "feat(canva): improve CSS generation with gradients, effects, and advanced styling"
```

---

### Task 4: Add Integration Tests for Common Canva Template Types

**Files:**
- Create: `scripts/__tests__/canva-pipeline.test.js`
- Create: `scripts/__tests__/fixtures/canva-templates/` (test fixture build specs)

**Step 1: Create test fixture build specs for common Canva template types**

Create `.claude/test-fixtures/canva-landing-page.build-spec.json`:

```json
{
  "version": "1.0.0",
  "source": "canva",
  "outputTarget": "react",
  "createdAt": "2026-03-21T00:00:00Z",
  "canva": {
    "designId": "DAGtest-landing",
    "designName": "Landing Page Template",
    "url": "https://www.canva.com/design/DAGtest-landing/test",
    "exportedScreenshots": []
  },
  "appType": "web-app",
  "framework": { "type": "vite", "version": "6.0.0", "outputDir": "src" },
  "styling": { "approach": "tailwind", "uiLibrary": null, "existingTokens": false },
  "pages": [
    {
      "canvaPageIndex": 0,
      "screenshotPath": "",
      "name": "Home",
      "route": "/",
      "sections": ["hero", "features", "testimonials", "pricing", "cta", "footer"]
    }
  ],
  "components": [
    { "detectedName": "Hero Section", "confidence": "high", "reactName": "HeroSection", "category": "sections", "action": "generate", "existingPath": null, "variants": [], "props": ["title", "subtitle", "ctaText", "backgroundImage"] },
    { "detectedName": "Feature Card", "confidence": "high", "reactName": "FeatureCard", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["icon", "title", "description"] },
    { "detectedName": "Testimonial Card", "confidence": "medium", "reactName": "TestimonialCard", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["quote", "author", "avatar", "role"] },
    { "detectedName": "Pricing Card", "confidence": "high", "reactName": "PricingCard", "category": "ui", "action": "generate", "existingPath": null, "variants": ["basic", "pro", "enterprise"], "props": ["plan", "price", "features", "highlighted"] },
    { "detectedName": "Navigation Bar", "confidence": "high", "reactName": "Navbar", "category": "layout", "action": "generate", "existingPath": null, "variants": [], "props": ["logo", "links", "cta"] },
    { "detectedName": "Footer", "confidence": "high", "reactName": "Footer", "category": "layout", "action": "generate", "existingPath": null, "variants": [], "props": ["columns", "copyright"] }
  ],
  "textContent": { "hero-heading": "Build Something Great", "hero-subheading": "Start your journey today", "cta-primary": "Get Started" },
  "businessLogic": { "forms": [], "apiCalls": [], "auth": null, "stateManagement": null },
  "e2e": { "strategy": "navigate-interact-verify", "flows": [] },
  "testStrategy": { "unit": true, "e2e": true, "visual": true, "crossBrowser": false, "coverageThreshold": 80 },
  "options": { "componentReuse": "generate", "integration": "standalone" }
}
```

Create `.claude/test-fixtures/canva-dashboard.build-spec.json`:

```json
{
  "version": "1.0.0",
  "source": "canva",
  "outputTarget": "react",
  "createdAt": "2026-03-21T00:00:00Z",
  "canva": {
    "designId": "DAGtest-dashboard",
    "designName": "Dashboard Template",
    "url": "https://www.canva.com/design/DAGtest-dashboard/test",
    "exportedScreenshots": []
  },
  "appType": "web-app",
  "framework": { "type": "nextjs-app", "version": "15.0.0", "outputDir": "src" },
  "styling": { "approach": "tailwind", "uiLibrary": "shadcn", "existingTokens": false },
  "pages": [
    { "canvaPageIndex": 0, "screenshotPath": "", "name": "Dashboard", "route": "/dashboard", "sections": ["sidebar", "header", "stats", "charts", "table"] },
    { "canvaPageIndex": 1, "screenshotPath": "", "name": "Settings", "route": "/settings", "sections": ["sidebar", "header", "form"] }
  ],
  "components": [
    { "detectedName": "Sidebar Navigation", "confidence": "high", "reactName": "Sidebar", "category": "layout", "action": "generate", "existingPath": null, "variants": ["expanded", "collapsed"], "props": ["links", "activeRoute", "onCollapse"] },
    { "detectedName": "Stats Card", "confidence": "high", "reactName": "StatsCard", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["label", "value", "change", "icon"] },
    { "detectedName": "Data Table", "confidence": "medium", "reactName": "DataTable", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["columns", "data", "pagination", "sortable"] },
    { "detectedName": "Chart Widget", "confidence": "low", "reactName": "ChartWidget", "category": "ui", "action": "generate", "existingPath": null, "variants": ["line", "bar", "pie"], "props": ["type", "data", "title"] },
    { "detectedName": "Header Bar", "confidence": "high", "reactName": "HeaderBar", "category": "layout", "action": "generate", "existingPath": null, "variants": [], "props": ["title", "breadcrumbs", "actions"] },
    { "detectedName": "Settings Form", "confidence": "medium", "reactName": "SettingsForm", "category": "sections", "action": "generate", "existingPath": null, "variants": [], "props": ["sections", "onSave"] }
  ],
  "textContent": { "dashboard-title": "Analytics Dashboard", "stats-revenue": "Total Revenue" },
  "businessLogic": { "forms": ["settings"], "apiCalls": ["fetchStats", "fetchTableData"], "auth": "required", "stateManagement": "zustand" },
  "e2e": { "strategy": "navigate-interact-verify", "flows": [] },
  "testStrategy": { "unit": true, "e2e": true, "visual": true, "crossBrowser": false, "coverageThreshold": 80 },
  "options": { "componentReuse": "generate", "integration": "standalone" }
}
```

Create `.claude/test-fixtures/canva-nested-groups.build-spec.json`:

```json
{
  "version": "1.0.0",
  "source": "canva",
  "outputTarget": "react",
  "createdAt": "2026-03-21T00:00:00Z",
  "canva": {
    "designId": "DAGtest-nested",
    "designName": "Complex Nested Layout",
    "url": "https://www.canva.com/design/DAGtest-nested/test",
    "exportedScreenshots": []
  },
  "appType": "web-app",
  "framework": { "type": "vite", "version": "6.0.0", "outputDir": "src" },
  "styling": { "approach": "tailwind", "uiLibrary": null, "existingTokens": false },
  "pages": [
    { "canvaPageIndex": 0, "screenshotPath": "", "name": "Portfolio", "route": "/", "sections": ["hero-with-overlay", "project-grid", "team-overlapping", "contact-form"] }
  ],
  "components": [
    { "detectedName": "Hero with Background Overlay", "confidence": "medium", "reactName": "HeroOverlay", "category": "sections", "action": "generate", "existingPath": null, "variants": [], "props": ["backgroundImage", "overlayOpacity", "title", "subtitle"], "nested": true, "nestingDepth": 3, "hasOverlap": true },
    { "detectedName": "Project Card with Badge", "confidence": "high", "reactName": "ProjectCard", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["image", "title", "category", "badgeText"], "nested": true, "nestingDepth": 2, "hasOverlap": true },
    { "detectedName": "Overlapping Avatar Stack", "confidence": "medium", "reactName": "AvatarStack", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["avatars", "maxVisible", "size"], "nested": false, "nestingDepth": 1, "hasOverlap": true },
    { "detectedName": "Floating Contact Button", "confidence": "high", "reactName": "FloatingButton", "category": "ui", "action": "generate", "existingPath": null, "variants": [], "props": ["icon", "label", "onClick"], "nested": false, "nestingDepth": 1, "hasOverlap": false },
    { "detectedName": "Multi-column Form with Grouped Fields", "confidence": "medium", "reactName": "ContactForm", "category": "sections", "action": "generate", "existingPath": null, "variants": [], "props": ["fields", "onSubmit"], "nested": true, "nestingDepth": 4, "hasOverlap": false }
  ],
  "textContent": {},
  "businessLogic": { "forms": ["contact"], "apiCalls": [], "auth": null, "stateManagement": null },
  "e2e": { "strategy": "navigate-interact-verify", "flows": [] },
  "testStrategy": { "unit": true, "e2e": true, "visual": true, "crossBrowser": false, "coverageThreshold": 80 },
  "options": { "componentReuse": "generate", "integration": "standalone" }
}
```

**Step 2: Create the integration test file**

Create `scripts/__tests__/canva-pipeline.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const FIXTURES = join(ROOT, ".claude", "test-fixtures");
const AGENTS = join(ROOT, ".claude", "agents");
const SKILLS = join(ROOT, ".claude", "skills");
const COMMANDS = join(ROOT, ".claude", "commands");
const CONFIG_PATH = join(ROOT, ".claude", "pipeline.config.json");

function loadBuildSpec(name) {
  const path = join(FIXTURES, name);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function loadMarkdown(path) {
  return readFileSync(path, "utf-8");
}

// --- Build Spec Validation ---

describe("canva build-spec validation — landing page template", () => {
  const spec = loadBuildSpec("canva-landing-page.build-spec.json");

  it("has source set to canva", () => {
    expect(spec.source).toBe("canva");
  });

  it("has required canva metadata fields", () => {
    expect(spec.canva).toBeDefined();
    expect(spec.canva.designId).toBeTruthy();
    expect(spec.canva.designName).toBeTruthy();
    expect(spec.canva.url).toMatch(/canva\.com\/design\//);
    expect(spec.canva.exportedScreenshots).toBeInstanceOf(Array);
  });

  it("has valid outputTarget", () => {
    expect(["react", "vue", "svelte", "react-native"]).toContain(spec.outputTarget);
  });

  it("has at least one page with required fields", () => {
    expect(spec.pages.length).toBeGreaterThan(0);
    for (const page of spec.pages) {
      expect(page).toHaveProperty("canvaPageIndex");
      expect(page).toHaveProperty("name");
      expect(page).toHaveProperty("route");
      expect(page).toHaveProperty("sections");
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  it("has components with confidence scores", () => {
    expect(spec.components.length).toBeGreaterThan(0);
    for (const comp of spec.components) {
      expect(comp).toHaveProperty("detectedName");
      expect(comp).toHaveProperty("confidence");
      expect(["high", "medium", "low"]).toContain(comp.confidence);
      expect(comp).toHaveProperty("reactName");
      expect(comp).toHaveProperty("category");
      expect(["ui", "layout", "sections", "pages"]).toContain(comp.category);
    }
  });

  it("landing page has expected section types", () => {
    const sections = spec.pages[0].sections;
    expect(sections).toContain("hero");
    expect(sections).toContain("footer");
  });

  it("landing page components include navigation and hero", () => {
    const names = spec.components.map((c) => c.reactName);
    expect(names).toContain("Navbar");
    expect(names).toContain("HeroSection");
  });
});

describe("canva build-spec validation — dashboard template", () => {
  const spec = loadBuildSpec("canva-dashboard.build-spec.json");

  it("has multi-page structure", () => {
    expect(spec.pages.length).toBeGreaterThan(1);
  });

  it("dashboard has sidebar and data components", () => {
    const names = spec.components.map((c) => c.reactName);
    expect(names).toContain("Sidebar");
    expect(names).toContain("DataTable");
    expect(names).toContain("StatsCard");
  });

  it("includes business logic requirements", () => {
    expect(spec.businessLogic.auth).toBe("required");
    expect(spec.businessLogic.apiCalls.length).toBeGreaterThan(0);
    expect(spec.businessLogic.stateManagement).toBeTruthy();
  });

  it("low-confidence components are flagged", () => {
    const lowConfidence = spec.components.filter((c) => c.confidence === "low");
    expect(lowConfidence.length).toBeGreaterThan(0);
    expect(lowConfidence[0].reactName).toBe("ChartWidget");
  });
});

describe("canva build-spec validation — nested groups template", () => {
  const spec = loadBuildSpec("canva-nested-groups.build-spec.json");

  it("components have nesting metadata", () => {
    const nested = spec.components.filter((c) => c.nested === true);
    expect(nested.length).toBeGreaterThan(0);
  });

  it("deeply nested components report nestingDepth", () => {
    const deep = spec.components.filter((c) => (c.nestingDepth || 0) >= 3);
    expect(deep.length).toBeGreaterThan(0);
  });

  it("overlapping components are flagged", () => {
    const overlapping = spec.components.filter((c) => c.hasOverlap === true);
    expect(overlapping.length).toBeGreaterThan(0);
    const names = overlapping.map((c) => c.reactName);
    expect(names).toContain("HeroOverlay");
    expect(names).toContain("AvatarStack");
  });

  it("form with deep nesting has correct depth", () => {
    const form = spec.components.find((c) => c.reactName === "ContactForm");
    expect(form.nestingDepth).toBe(4);
    expect(form.nested).toBe(true);
  });
});

// --- Pipeline Config Validation ---

describe("pipeline config — canva section", () => {
  const config = loadConfig();

  it("canva section exists and is enabled", () => {
    expect(config.canva).toBeDefined();
    expect(config.canva.enabled).toBe(true);
  });

  it("has token inference settings", () => {
    const ti = config.canva.tokenInference;
    expect(ti.confirmWithUser).toBe(true);
    expect(["high", "medium", "low"]).toContain(ti.confidenceThreshold);
    expect(ti.maxInferenceRetries).toBeGreaterThanOrEqual(1);
  });

  it("has export settings with valid format", () => {
    expect(config.canva.export.format).toBe("png");
    expect(config.canva.export.scale).toBeGreaterThanOrEqual(1);
  });

  it("has retry configuration", () => {
    const retry = config.canva.retry;
    expect(retry).toBeDefined();
    expect(retry.maxAttempts).toBeGreaterThanOrEqual(2);
    expect(retry.initialDelayMs).toBeGreaterThan(0);
    expect(retry.backoffMultiplier).toBeGreaterThan(1);
    expect(retry.maxDelayMs).toBeGreaterThanOrEqual(retry.initialDelayMs);
    expect(retry.retryableErrors).toBeInstanceOf(Array);
    expect(retry.retryableErrors.length).toBeGreaterThan(0);
    expect(retry.retryableErrors).toContain("rate_limit");
    expect(retry.retryableErrors).toContain("timeout");
  });
});

// --- Agent & Skill Definition Validation ---

describe("canva-react-converter agent definition", () => {
  const content = loadMarkdown(join(AGENTS, "canva-react-converter.md"));

  it("includes grouped/nested element strategy", () => {
    expect(content).toContain("Grouped");
    expect(content).toContain("Nested");
    expect(content).toContain("Flattening rules");
  });

  it("addresses overlapping/absolutely-positioned elements", () => {
    expect(content).toContain("absolute");
    expect(content).toContain("z-index");
    expect(content).toContain("overlapping");
  });

  it("includes advanced CSS generation guidance", () => {
    expect(content).toContain("Gradient");
    expect(content).toContain("backdrop-blur");
    expect(content).toContain("blend");
  });

  it("has error recovery for ambiguous groups", () => {
    expect(content).toContain("ambiguous group");
    expect(content).toContain("flatten");
  });
});

describe("build-from-canva command definition", () => {
  const content = loadMarkdown(join(COMMANDS, "build-from-canva.md"));

  it("includes retry protocol", () => {
    expect(content).toContain("Retry Protocol");
    expect(content).toContain("exponential backoff");
    expect(content).toContain("maxAttempts");
  });

  it("references pipeline config for retry settings", () => {
    expect(content).toContain("pipeline.config.json");
    expect(content).toContain("canva.retry");
  });

  it("handles rate limiting specifically", () => {
    expect(content).toContain("Rate limit");
  });

  it("handles MCP connection loss", () => {
    expect(content).toContain("MCP connection lost");
  });
});

describe("canva-intake skill definition", () => {
  const content = loadMarkdown(join(SKILLS, "canva-intake", "SKILL.md"));

  it("includes retry guidance for rate limits", () => {
    expect(content).toContain("Rate limit");
    expect(content).toContain("retry");
  });
});

describe("canva-token-inference skill definition", () => {
  const content = loadMarkdown(join(SKILLS, "canva-token-inference", "SKILL.md"));

  it("extracts gradient information", () => {
    expect(content).toContain("Gradient");
  });

  it("extracts backdrop effects", () => {
    expect(content).toContain("Backdrop");
  });

  it("extracts letter spacing", () => {
    expect(content).toContain("Letter spacing");
  });
});
```

**Step 3: Run the tests (they should fail initially since changes aren't applied yet)**

Run: `npx vitest run scripts/__tests__/canva-pipeline.test.js`
Expected: Tests for retry config, nested element strategy, and advanced CSS fail (the fixture files validate, but agent/config assertions will fail until Tasks 1-3 are applied).

**Step 4: Apply Tasks 1-3, then re-run tests**

After Tasks 1-3 are committed, run again:
Run: `npx vitest run scripts/__tests__/canva-pipeline.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/__tests__/canva-pipeline.test.js .claude/test-fixtures/
git commit -m "test(canva): add integration tests for common Canva template types"
```

---

## Execution Order

Tasks 1-3 modify agent/skill/command definitions and config. Task 4 creates tests that validate those changes. The TDD approach here is:

1. **Task 4 first** — write the tests (RED)
2. **Tasks 1, 2, 3** — apply the changes (GREEN)
3. Final commit verifies all tests pass

## Summary

| Task | Files Changed | Type |
|------|--------------|------|
| 1. Grouped/nested elements | `canva-react-converter.md` | Agent definition |
| 2. Retry logic | `build-from-canva.md`, `pipeline.config.json`, `canva-intake/SKILL.md` | Command + config + skill |
| 3. CSS generation | `canva-react-converter.md`, `canva-token-inference/SKILL.md` | Agent + skill |
| 4. Integration tests | `canva-pipeline.test.js`, 3 fixture JSON files | Tests |
