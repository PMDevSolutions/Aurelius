import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const FIXTURES = join(ROOT, ".claude", "test-fixtures");
const AGENTS = join(ROOT, ".claude", "agents");
const SKILLS = join(ROOT, ".claude", "skills");
const COMMANDS = join(ROOT, ".claude", "commands");
const CONFIG_PATH = join(ROOT, ".claude", "pipeline.config.json");
const SCHEMA_PATH = join(ROOT, ".claude", "pipeline.config.schema.json");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadMarkdown(path) {
  return readFileSync(path, "utf-8");
}

// --- Design Brief Validation ---

describe("conversation design-brief validation — dashboard template", () => {
  const brief = loadJson(join(FIXTURES, "conversation-dashboard.design-brief.json"));

  it("has version and conversation source", () => {
    expect(brief.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(brief.source).toBe("conversation");
  });

  it("has a valid style direction", () => {
    expect(["minimal", "bold", "playful", "corporate", "dark", "custom"]).toContain(
      brief.styleDirection,
    );
  });

  it("has color preferences with style family and provenance", () => {
    const colors = brief.colorPreferences;
    expect(colors).toBeDefined();
    expect(["cool-neutral", "warm-neutral", "vibrant", "monochrome", "custom"]).toContain(
      colors.style,
    );
    expect(typeof colors.userProvided).toBe("boolean");
    if (colors.primary !== null) {
      expect(colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(colors.notes).toBeTruthy();
  });

  it("has typography decisions", () => {
    expect(["modern-sans", "classic-serif", "geometric", "humanist", "monospace"]).toContain(
      brief.typography.style,
    );
    expect(["bold-clean", "elegant", "casual", "technical"]).toContain(
      brief.typography.headingStyle,
    );
  });

  it("has layout style decisions", () => {
    expect(["compact", "comfortable", "spacious"]).toContain(brief.layoutStyle.density);
    expect(brief.layoutStyle.maxWidth).toMatch(/^\d+px$/);
    expect(typeof brief.layoutStyle.sidebar).toBe("boolean");
  });

  it("describes every component in natural language", () => {
    const descriptions = brief.componentDescriptions;
    expect(Object.keys(descriptions).length).toBeGreaterThan(0);
    for (const [name, description] of Object.entries(descriptions)) {
      expect(name).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      expect(typeof description).toBe("string");
      expect(description.length).toBeGreaterThan(20);
    }
  });

  it("captures dark mode, animation, and special requirements", () => {
    expect(typeof brief.darkMode).toBe("boolean");
    expect(["none", "subtle", "expressive"]).toContain(brief.animations);
    expect(brief.specialRequirements).toBeInstanceOf(Array);
  });
});

// --- Build Spec Validation ---

describe("conversation build-spec validation — dashboard template", () => {
  const spec = loadJson(join(FIXTURES, "conversation-dashboard.build-spec.json"));

  it("has source set to conversation", () => {
    expect(spec.source).toBe("conversation");
  });

  it("has conversation metadata pointing at the design brief", () => {
    expect(spec.conversation).toBeDefined();
    expect(spec.conversation.description).toBeTruthy();
    expect(spec.conversation.designBrief).toMatch(/design-brief\.json$/);
  });

  it("has a populated figma block after design generation", () => {
    expect(spec.figma).toBeDefined();
    expect(spec.figma.fileKey).toBeTruthy();
    expect(spec.figma.url).toMatch(/figma\.com\/design\//);
    expect(spec.figma.generated).toBe(true);
  });

  it("has valid outputTarget", () => {
    expect(["react", "vue", "svelte", "react-native"]).toContain(spec.outputTarget);
  });

  it("has pages with generated Figma node IDs and mockup paths", () => {
    expect(spec.pages.length).toBeGreaterThan(1);
    for (const page of spec.pages) {
      expect(page.figmaNodeId).toMatch(/^\d+:\d+$/);
      expect(page).toHaveProperty("name");
      expect(page).toHaveProperty("route");
      expect(page.mockupPath).toMatch(/\.html$/);
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  it("has components with valid categories", () => {
    expect(spec.components.length).toBeGreaterThan(0);
    for (const comp of spec.components) {
      expect(comp).toHaveProperty("reactName");
      expect(["ui", "layout", "sections", "pages"]).toContain(comp.category);
    }
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
  });
});

// --- Pipeline Config Validation ---

describe("pipeline config — conversation section", () => {
  const config = loadJson(CONFIG_PATH);

  it("conversation section exists and is enabled", () => {
    expect(config.conversation).toBeDefined();
    expect(config.conversation.enabled).toBe(true);
  });

  it("caps the interview at 7 questions and confirms the brief", () => {
    const interview = config.conversation.interview;
    expect(interview.maxQuestions).toBeGreaterThanOrEqual(1);
    expect(interview.maxQuestions).toBeLessThanOrEqual(7);
    expect(interview.confirmBriefWithUser).toBe(true);
  });

  it("has design generation settings", () => {
    const gen = config.conversation.designGeneration;
    expect(gen.mockupDir).toBeTruthy();
    expect(gen.mockupServerPort).toBeGreaterThan(0);
    expect(typeof gen.reviewBeforeHandoff).toBe("boolean");
    expect(gen.maxRegenerationAttempts).toBeGreaterThanOrEqual(1);
    expect(gen.capturePollIntervalMs).toBeGreaterThan(0);
    expect(gen.capturePollMaxAttempts).toBeGreaterThanOrEqual(1);
  });

  it("has retry configuration", () => {
    const retry = config.conversation.retry;
    expect(retry).toBeDefined();
    expect(retry.maxAttempts).toBeGreaterThanOrEqual(2);
    expect(retry.initialDelayMs).toBeGreaterThan(0);
    expect(retry.backoffMultiplier).toBeGreaterThan(1);
    expect(retry.maxDelayMs).toBeGreaterThanOrEqual(retry.initialDelayMs);
    expect(retry.retryableErrors).toBeInstanceOf(Array);
    expect(retry.retryableErrors).toContain("rate_limit");
    expect(retry.retryableErrors).toContain("timeout");
    expect(retry.retryableErrors).toContain("capture_failed");
  });
});

describe("pipeline config schema — conversation section", () => {
  const schema = loadJson(SCHEMA_PATH);

  it("declares the conversation property", () => {
    expect(schema.properties.conversation).toBeDefined();
    expect(schema.properties.conversation.additionalProperties).toBe(false);
  });

  it("reuses the shared retryOptions definition", () => {
    expect(schema.properties.conversation.properties.retry.$ref).toBe("#/$defs/retryOptions");
  });
});

// --- Agent & Skill Definition Validation ---

describe("conversation-intake skill definition", () => {
  const content = loadMarkdown(join(SKILLS, "conversation-intake", "SKILL.md"));

  it("produces both the build spec and the design brief", () => {
    expect(content).toContain("build-spec.json");
    expect(content).toContain("design-brief.json");
    expect(content).toContain('"source": "conversation"');
  });

  it("caps the interview via pipeline config", () => {
    expect(content).toContain("maxQuestions");
    expect(content).toMatch(/max(imum)? (of )?7 questions/i);
  });

  it("detects the framework through the renderer registry", () => {
    expect(content).toContain("renderer-registry.js detect");
  });

  it("dispatches the conversation-designer agent", () => {
    expect(content).toContain("conversation-designer");
  });
});

describe("design-brief-to-figma skill definition", () => {
  const content = loadMarkdown(join(SKILLS, "design-brief-to-figma", "SKILL.md"));

  it("creates the Figma file with an authenticated plan", () => {
    expect(content).toContain("whoami");
    expect(content).toContain("planKey");
    expect(content).toContain("create_new_file");
  });

  it("captures HTML mockups through generate_figma_design", () => {
    expect(content).toContain("HTML mockup");
    expect(content).toContain("generate_figma_design");
    expect(content).toContain("captureId");
    expect(content).toContain("single-use");
    expect(content).toMatch(/poll/i);
  });

  it("maps generated node IDs back into the build spec", () => {
    expect(content).toContain("get_metadata");
    expect(content).toContain("figmaNodeId");
  });

  it("warns that captured designs have no Figma variables", () => {
    expect(content).toMatch(/no Figma variables/i);
    expect(content).toMatch(/computed styles/i);
  });
});

describe("conversation-designer agent definition", () => {
  const content = loadMarkdown(join(AGENTS, "conversation-designer.md"));

  it("has the expected frontmatter name", () => {
    expect(content).toMatch(/^---\r?\nname: conversation-designer\r?\n/);
  });

  it("owns the design brief and HTML mockups", () => {
    expect(content).toContain("design-brief.json");
    expect(content).toContain("HTML mockup");
  });

  it("documents concrete defaults per style direction", () => {
    for (const direction of ["minimal", "bold", "playful", "corporate", "dark"]) {
      expect(content).toContain(direction);
    }
  });
});

describe("build-from-conversation command definition", () => {
  const content = loadMarkdown(join(COMMANDS, "build-from-conversation.md"));

  it("orchestrates both new skills", () => {
    expect(content).toContain("conversation-intake");
    expect(content).toContain("design-brief-to-figma");
  });

  it("hands off to the figma pipeline", () => {
    expect(content).toContain("/build-from-figma");
    expect(content).toMatch(/fast-path/i);
  });

  it("accepts an optional initial description", () => {
    expect(content).toContain("$ARGUMENTS");
  });

  it("reads the conversation section of the pipeline config", () => {
    expect(content).toContain("pipeline.config.json");
    expect(content).toMatch(/conversation\.(interview|designGeneration|retry)/);
  });
});

describe("figma-intake conversation fast-path", () => {
  const content = loadMarkdown(join(SKILLS, "figma-intake", "SKILL.md"));

  it("skips the interview for conversation-sourced build specs", () => {
    expect(content).toMatch(/fast-path/i);
    expect(content).toContain('"source": "conversation"');
  });
});
