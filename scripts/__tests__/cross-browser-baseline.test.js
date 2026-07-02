// Tests for scripts/cross-browser-baseline.js — RFC 0002 cross-browser
// baseline capture/compare/verify CLI (commit backend). Black-box via CLI;
// Playwright-free thanks to compare --current-dir. Config is injected per
// test through the CBB_CONFIG env var.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { createRequire } from "module";

import { createPNG, solid } from "./generate-fixtures.js";
import { recordBaselines } from "../lib/baseline-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JS_CLI = join(__dirname, "..", "cross-browser-baseline.js");
const SH_CLI = join(__dirname, "..", "cross-browser-baseline.sh");
const IMAGE = "mcr.microsoft.com/playwright:v1.61.1-noble";

let tmp;
let projCount = 0;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "cbb-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function pngBytes(rgb) {
  return PNG.sync.write(createPNG(40, 30, solid(...rgb)));
}

const RED = [200, 40, 40];
const BLUE = [40, 40, 200];

/** Lay out a project: baselines + currents trees and a CBB_CONFIG file. */
function makeProject({ config = {}, baselines = {}, currents = {} } = {}) {
  const root = join(tmp, `proj-${projCount++}`);
  const baselineDir = join(root, "baselines");
  const currentDir = join(root, "current");
  const paths = {
    root,
    baselineDir,
    currentDir,
    screenshotDir: join(root, "shots"),
    diffDir: join(root, "diffs"),
    reportFile: join(root, "cross-browser-report.md"),
    manifestPath: join(baselineDir, "manifest.json"),
  };
  const writeTree = (dir, files) => {
    mkdirSync(dir, { recursive: true });
    for (const [rel, bytes] of Object.entries(files)) {
      const p = join(dir, ...rel.split("/"));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, bytes);
    }
  };
  writeTree(baselineDir, baselines);
  writeTree(currentDir, currents);

  const visualBaselines = {
    enabled: true,
    backend: "commit",
    storage: "git",
    baselineDir,
    screenshotDir: paths.screenshotDir,
    diffDir: paths.diffDir,
    browsers: ["chromium", "firefox", "webkit"],
    routes: ["/"],
    breakpoints: { mobile: 375, desktop: 1440 },
    threshold: 0.03,
    blocking: false,
    reportFile: paths.reportFile,
    capture: { mode: "local", image: IMAGE, waitAfterLoadMs: 0, fullPage: true },
    provenance: { manifest: paths.manifestPath, policy: "warn" },
    ciArtifact: { compareAgainst: "last-green-main", retentionDays: 30 },
    service: { provider: "chromatic", projectTokenEnv: "CHROMATIC_PROJECT_TOKEN" },
    ...config,
  };
  paths.configPath = join(root, "config.json");
  writeFileSync(paths.configPath, JSON.stringify({ visualBaselines }, null, 2));
  return paths;
}

function record(proj, overrides = {}) {
  recordBaselines({
    baselineDir: proj.baselineDir,
    manifestPath: proj.manifestPath,
    engines: ["chromium", "firefox", "webkit"],
    envelope: {
      playwrightVersion: "1.61.1",
      image: IMAGE,
      host: "container",
      gitSha: "testsha",
      ...overrides,
    },
    routes: ["/"],
  });
}

function run(cliArgs, proj, { viaShell = false, env = {} } = {}) {
  const [bin, prefix] = viaShell ? ["bash", [SH_CLI]] : ["node", [JS_CLI]];
  try {
    const stdout = execFileSync(bin, [...prefix, ...cliArgs], {
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, ...(proj ? { CBB_CONFIG: proj.configPath } : {}), ...env },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status };
  }
}

function runJson(cliArgs, proj, options = {}) {
  const result = run(cliArgs, proj, options);
  return { ...result, json: result.stdout ? JSON.parse(result.stdout) : null };
}

const playwrightResolvable = (() => {
  try {
    createRequire(join(process.cwd(), "package.json")).resolve("@playwright/test");
    return true;
  } catch {
    return false;
  }
})();

describe("help and usage", () => {
  it("node CLI prints usage on --help", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/capture/);
    expect(stdout).toMatch(/compare/);
    expect(stdout).toMatch(/verify/);
  });

  it("shell wrapper forwards --help", () => {
    const { stdout, exitCode } = run(["--help"], null, { viaShell: true });
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/compare/);
  });

  it("exits 2 with usage when no subcommand is given", () => {
    const { exitCode, stderr } = run([]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Usage/i);
  });
});

describe("compare (commit backend)", () => {
  it("passes when current screenshots match committed baselines", () => {
    const proj = makeProject({
      baselines: {
        "firefox/home/desktop_1440px.png": pngBytes(RED),
        "webkit/home/mobile_375px.png": pngBytes(BLUE),
      },
      currents: {
        "firefox/home/desktop_1440px.png": pngBytes(RED),
        "webkit/home/mobile_375px.png": pngBytes(BLUE),
      },
    });
    record(proj);
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.backend).toBe("commit");
    expect(json.pass).toBe(2);
    expect(json.fail).toBe(0);
    expect(json.wouldBlock).toBe(false);
    expect(json.provenance.violations).toBe(0);
    expect(json.advisory).toBe(false);
    expect(existsSync(proj.reportFile)).toBe(true);
    expect(readFileSync(proj.reportFile, "utf-8")).toMatch(/Cross-Browser/i);
  });

  it("counts pixel failures but stays exit 0 while non-blocking", () => {
    const proj = makeProject({
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(BLUE) },
    });
    record(proj);
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.fail).toBe(1);
    expect(json.wouldBlock).toBe(true);
    expect(json.blocking).toBe(false);
  });

  it("exits 1 on failures with --blocking", () => {
    const proj = makeProject({
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(BLUE) },
    });
    record(proj);
    const { exitCode, json } = runJson(
      ["compare", "--json", "--blocking", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(1);
    expect(json.blocking).toBe(true);
  });

  it("exits 1 on failures when config sets blocking: true (Phase B teeth)", () => {
    const proj = makeProject({
      config: { blocking: true },
      baselines: { "webkit/home/mobile_375px.png": pngBytes(RED) },
      currents: { "webkit/home/mobile_375px.png": pngBytes(BLUE) },
    });
    record(proj);
    const { exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(1);
  });

  it("reports modified provenance as a warning (policy=warn) while still diffing", () => {
    const tampered = pngBytes(RED);
    const proj = makeProject({
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(BLUE) },
      currents: { "firefox/home/desktop_1440px.png": tampered },
    });
    record(proj);
    // Rewrite the baseline after recording provenance → sha mismatch.
    writeFileSync(
      join(proj.baselineDir, "firefox", "home", "desktop_1440px.png"),
      tampered,
    );
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.provenance.violations).toBeGreaterThanOrEqual(1);
    const entry = json.results.find((r) => r.path === "firefox/home/desktop_1440px.png");
    expect(entry.provenance).toBe("modified");
    expect(entry.status).toBe("PASS"); // still pixel-diffed under warn policy
    expect(json.provenanceFailures).toBe(0);
  });

  it("excludes flagged baselines from diffing under policy=enforce", () => {
    const tampered = pngBytes(RED);
    const proj = makeProject({
      config: { provenance: { manifest: undefined, policy: "enforce" } },
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(BLUE) },
      currents: { "firefox/home/desktop_1440px.png": tampered },
    });
    // provenance.manifest was clobbered by the override — restore the path
    const configRaw = JSON.parse(readFileSync(proj.configPath, "utf-8"));
    configRaw.visualBaselines.provenance = { manifest: proj.manifestPath, policy: "enforce" };
    writeFileSync(proj.configPath, JSON.stringify(configRaw, null, 2));

    record(proj);
    writeFileSync(
      join(proj.baselineDir, "firefox", "home", "desktop_1440px.png"),
      tampered,
    );
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(0); // blocking still false
    const entry = json.results.find((r) => r.path === "firefox/home/desktop_1440px.png");
    expect(entry.status).toBe("PROVENANCE");
    expect(json.provenanceFailures).toBe(1);
    expect(json.wouldBlock).toBe(true);
  });

  it("marks compares advisory when the manifest is missing (all untracked)", () => {
    const proj = makeProject({
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
    });
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.provenance.manifestFound).toBe(false);
    expect(json.advisory).toBe(true);
    expect(json.pass).toBe(1);
  });

  it("marks local-envelope compares advisory", () => {
    const proj = makeProject({
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
    });
    record(proj);
    const { json } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "local"],
      proj,
    );
    expect(json.advisory).toBe(true);
    expect(json.pass).toBe(1);
  });

  it("walks only configured engines and skips stray directories", () => {
    const proj = makeProject({
      baselines: {
        "firefox/home/desktop_1440px.png": pngBytes(RED),
        "not-a-browser/home/desktop_1440px.png": pngBytes(RED),
      },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
    });
    record(proj);
    const { json } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(json.results.map((r) => r.path)).toEqual(["firefox/home/desktop_1440px.png"]);
  });

  it("honors --engines filtering", () => {
    const proj = makeProject({
      baselines: {
        "firefox/home/desktop_1440px.png": pngBytes(RED),
        "webkit/home/mobile_375px.png": pngBytes(BLUE),
      },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
    });
    record(proj);
    const { json } = runJson(
      ["compare", "--json", "--engines", "firefox", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(json.results).toHaveLength(1);
    expect(json.results[0].engine).toBe("firefox");
  });

  it("skips baselines with no current screenshot", () => {
    const proj = makeProject({
      baselines: {
        "firefox/home/desktop_1440px.png": pngBytes(RED),
        "firefox/home/mobile_375px.png": pngBytes(RED),
      },
      currents: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
    });
    record(proj);
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir, "--host", "container"],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.skip).toBe(1);
    expect(json.pass).toBe(1);
  });

  it("exits 0 with a capture hint when no baselines exist", () => {
    const proj = makeProject({ currents: {} });
    const { json, exitCode } = runJson(
      ["compare", "--json", "--current-dir", proj.currentDir],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.skipped).toBe(true);
    expect(json.reason).toMatch(/no baselines/i);
  });

  it("exits 0 and reports skipped when visualBaselines.enabled is false", () => {
    const proj = makeProject({ config: { enabled: false } });
    const { json, exitCode } = runJson(["compare", "--json"], proj);
    expect(exitCode).toBe(0);
    expect(json.skipped).toBe(true);
    expect(json.reason).toMatch(/disabled/i);
  });

  it("exits 2 for an unknown backend", () => {
    const proj = makeProject({ config: { backend: "carrier-pigeon" } });
    const { exitCode, stderr } = run(["compare", "--json"], proj);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/backend/i);
  });
});

describe("verify", () => {
  it("exits 0 on a clean recorded tree and 1 after tampering", () => {
    const proj = makeProject({
      baselines: { "firefox/home/desktop_1440px.png": pngBytes(RED) },
    });
    record(proj);
    expect(run(["verify", "--json", "--host", "container"], proj).exitCode).toBe(0);

    writeFileSync(
      join(proj.baselineDir, "firefox", "home", "desktop_1440px.png"),
      pngBytes(BLUE),
    );
    const { exitCode, json } = runJson(["verify", "--json", "--host", "container"], proj);
    expect(exitCode).toBe(1);
    expect(json.statuses["firefox/home/desktop_1440px.png"]).toBe("modified");
  });
});

describe("capture", () => {
  it.skipIf(playwrightResolvable)(
    "fails with an install hint when Playwright is not resolvable",
    () => {
      const proj = makeProject({});
      const { exitCode, stderr } = run(
        ["capture", "http://127.0.0.1:9", "--local"],
        proj,
      );
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/@playwright\/test/);
    },
  );
});

describe("capture — pinned container wrapping (Phase B)", () => {
  const containerConfig = {
    capture: { mode: "container", image: IMAGE, waitAfterLoadMs: 0, fullPage: true },
  };

  it("builds the docker run command with the pinned image and rewritten URL (--dry-run)", () => {
    const proj = makeProject({ config: containerConfig });
    const { json, exitCode } = runJson(
      ["capture", "http://localhost:3000", "--dry-run", "--json"],
      proj,
    );
    expect(exitCode).toBe(0);
    expect(json.dryRun).toBe(true);
    expect(json.image).toBe(IMAGE);
    expect(json.playwrightVersion).toBe("1.61.1");
    expect(json.url).toBe("http://host.docker.internal:3000");

    const argv = json.docker;
    expect(argv.slice(0, 3)).toEqual(["docker", "run", "--rm"]);
    expect(argv).toContain(IMAGE);
    expect(argv).toContain("--add-host=host.docker.internal:host-gateway");
    expect(argv).toContain("CBB_IN_CONTAINER=1");
    expect(argv).toContain("CBB_PLAYWRIGHT_DIR=/tmp/cbb");
    const mount = argv[argv.indexOf("-v") + 1];
    expect(mount.endsWith(":/work")).toBe(true);
    const inner = argv[argv.length - 1];
    expect(inner).toContain("@playwright/test@1.61.1");
    expect(inner).toContain("--host container");
    expect(inner).toContain("--no-manifest");
    expect(inner).toContain("http://host.docker.internal:3000");
  });

  it("rewrites 127.0.0.1 and forwards --engines into the container command", () => {
    const proj = makeProject({ config: containerConfig });
    const { json } = runJson(
      ["capture", "http://127.0.0.1:4173", "--dry-run", "--json", "--engines", "firefox,webkit"],
      proj,
    );
    expect(json.url).toBe("http://host.docker.internal:4173");
    expect(json.docker[json.docker.length - 1]).toContain("--engines firefox,webkit");
  });

  it("does not wrap when already inside the container", () => {
    const proj = makeProject({ config: containerConfig });
    // In-container + no wrap → direct capture path → Playwright install hint
    // (this repo does not have @playwright/test installed).
    const { exitCode, stderr } = run(["capture", "http://localhost:3000"], proj, {
      env: { CBB_IN_CONTAINER: "1" },
    });
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/@playwright\/test/);
    expect(stderr).not.toMatch(/docker/i);
  });

  it.skipIf(playwrightResolvable)("--local bypasses the container wrapper", () => {
    const proj = makeProject({ config: containerConfig });
    const { exitCode, stderr } = run(
      ["capture", "http://127.0.0.1:9", "--local"],
      proj,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/@playwright\/test/);
    expect(stderr).not.toMatch(/docker run/i);
  });

  it("rejects an image tag it cannot derive a Playwright version from", () => {
    const proj = makeProject({
      config: { capture: { mode: "container", image: "mcr.microsoft.com/playwright:latest", waitAfterLoadMs: 0, fullPage: true } },
    });
    const { exitCode, stderr } = run(
      ["capture", "http://localhost:3000", "--dry-run"],
      proj,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/image/i);
  });
});
