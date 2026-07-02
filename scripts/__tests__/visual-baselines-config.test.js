// Tests for the visualBaselines section of pipeline.config.json (RFC 0002):
// schema strictness, enums, and the structural checks the schema cannot express.
// Black-box: runs validate-pipeline-config.js as a CLI and parses --json output.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(__dirname, "..", "validate-pipeline-config.js");
const LIVE_CONFIG = join(__dirname, "..", "..", ".claude", "pipeline.config.json");
const LIVE_SCHEMA = join(__dirname, "..", "..", ".claude", "pipeline.config.schema.json");

let tmp;
let liveConfig;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "vb-config-"));
  liveConfig = JSON.parse(readFileSync(LIVE_CONFIG, "utf-8"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Run the validator against a config object written to a temp file. */
function validate(config, name) {
  const configPath = join(tmp, `${name}.json`);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  let stdout;
  let exitCode = 0;
  try {
    stdout = execFileSync(
      "node",
      [VALIDATOR, "--config", configPath, "--schema", LIVE_SCHEMA, "--json"],
      { encoding: "utf-8", timeout: 30000 },
    );
  } catch (err) {
    stdout = err.stdout;
    exitCode = err.status;
  }
  return { ...JSON.parse(stdout), exitCode };
}

/** Deep-clone the live config and apply a mutator. */
function withConfig(mutate) {
  const clone = JSON.parse(JSON.stringify(liveConfig));
  mutate(clone);
  return clone;
}

describe("visualBaselines config section", () => {
  it("live config is valid and includes visualBaselines (backend=commit)", () => {
    const result = validate(liveConfig, "live");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(liveConfig.visualBaselines).toBeDefined();
    expect(liveConfig.visualBaselines.backend).toBe("commit");
    expect(liveConfig.visualBaselines.storage).toBe("git");
    expect(liveConfig.visualBaselines.blocking).toBe(false);
    expect(liveConfig.visualBaselines.threshold).toBe(
      liveConfig.e2e.crossBrowserDiffThreshold,
    );
    expect(liveConfig.visualBaselines.provenance.manifest).toBe(
      ".claude/visual-qa/baselines/manifest.json",
    );
  });

  it("rejects unknown keys inside visualBaselines (strict schema)", () => {
    const config = withConfig((c) => {
      c.visualBaselines.bogusKey = true;
    });
    const result = validate(config, "unknown-key");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    const flagged = result.schemaErrors.some(
      (e) =>
        e.path.startsWith("/visualBaselines") &&
        e.extras.some((x) => x.includes("bogusKey")),
    );
    expect(flagged).toBe(true);
  });

  it("rejects an unknown backend", () => {
    const config = withConfig((c) => {
      c.visualBaselines.backend = "s3";
    });
    const result = validate(config, "bad-backend");
    expect(result.ok).toBe(false);
    expect(result.schemaErrors.some((e) => e.path === "/visualBaselines/backend")).toBe(
      true,
    );
  });

  it("rejects an unknown provenance policy", () => {
    const config = withConfig((c) => {
      c.visualBaselines.provenance.policy = "block";
    });
    const result = validate(config, "bad-policy");
    expect(result.ok).toBe(false);
    expect(
      result.schemaErrors.some((e) => e.path === "/visualBaselines/provenance/policy"),
    ).toBe(true);
  });

  it("accepts storage=lfs on the commit backend", () => {
    const config = withConfig((c) => {
      c.visualBaselines.storage = "lfs";
    });
    const result = validate(config, "lfs-ok");
    expect(result.ok).toBe(true);
  });

  it("rejects capture mode outside container|local", () => {
    const config = withConfig((c) => {
      c.visualBaselines.capture.mode = "vm";
    });
    const result = validate(config, "bad-mode");
    expect(result.ok).toBe(false);
    expect(
      result.schemaErrors.some((e) => e.path === "/visualBaselines/capture/mode"),
    ).toBe(true);
  });

  it("structural: storage=lfs requires the commit backend", () => {
    const config = withConfig((c) => {
      c.visualBaselines.backend = "ci-artifact";
      c.visualBaselines.storage = "lfs";
    });
    const result = validate(config, "lfs-wrong-backend");
    expect(result.ok).toBe(false);
    expect(
      result.structuralIssues.some((e) => e.path === "/visualBaselines/storage"),
    ).toBe(true);
  });

  it("structural: threshold must match e2e.crossBrowserDiffThreshold", () => {
    const config = withConfig((c) => {
      c.visualBaselines.threshold = 0.05;
    });
    const result = validate(config, "threshold-drift");
    expect(result.ok).toBe(false);
    expect(
      result.structuralIssues.some(
        (e) =>
          e.path === "/visualBaselines/threshold" &&
          e.message.includes("crossBrowserDiffThreshold"),
      ),
    ).toBe(true);
  });

  it("structural: visualBaselines.browsers must be a subset of e2e.crossBrowserBrowsers", () => {
    const config = withConfig((c) => {
      c.e2e.crossBrowserBrowsers = ["chromium", "firefox"];
    });
    const result = validate(config, "browser-superset");
    expect(result.ok).toBe(false);
    expect(
      result.structuralIssues.some((e) => e.path === "/visualBaselines/browsers"),
    ).toBe(true);
  });
});
