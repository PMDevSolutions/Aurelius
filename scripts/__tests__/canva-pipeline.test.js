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
