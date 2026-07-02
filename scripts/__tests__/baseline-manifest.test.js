// Tests for scripts/lib/baseline-manifest.js — the RFC 0002 provenance
// manifest (record / sync / verify) for cross-browser screenshot baselines.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "fs";
import { createHash } from "crypto";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

import {
  sha256File,
  parseBaselineRelPath,
  recordBaselines,
  syncManifest,
  verifyBaselines,
  loadManifest,
} from "../lib/baseline-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = join(__dirname, "..", "lib", "baseline-manifest.js");

let tmp;
let treeCount = 0;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "baseline-manifest-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Create a baseline tree: { "firefox/home/desktop_1440px.png": "content", ... } */
function makeTree(files) {
  const root = join(tmp, `tree-${treeCount++}`);
  const baselineDir = join(root, "baselines");
  for (const [rel, content] of Object.entries(files)) {
    const p = join(baselineDir, ...rel.split("/"));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  mkdirSync(baselineDir, { recursive: true });
  return { root, baselineDir, manifestPath: join(baselineDir, "manifest.json") };
}

const ENVELOPE = {
  playwrightVersion: "1.61.1",
  image: "mcr.microsoft.com/playwright:v1.61.1-noble",
  host: "container",
  gitSha: "abc1234",
};

describe("sha256File", () => {
  it("hashes file bytes", () => {
    const p = join(tmp, "hash-me.txt");
    writeFileSync(p, "hello");
    expect(sha256File(p)).toBe(createHash("sha256").update("hello").digest("hex"));
  });
});

describe("parseBaselineRelPath", () => {
  it("parses engine/routeSlug/breakpoint_width", () => {
    expect(parseBaselineRelPath("firefox/home/desktop_1440px.png")).toEqual({
      engine: "firefox",
      routeSlug: "home",
      breakpoint: "desktop",
      width: 1440,
    });
  });

  it("handles breakpoint names containing underscores and windows separators", () => {
    expect(parseBaselineRelPath("webkit\\about-us\\small_mobile_320px.png")).toEqual({
      engine: "webkit",
      routeSlug: "about-us",
      breakpoint: "small_mobile",
      width: 320,
    });
  });

  it("returns null for non-baseline paths", () => {
    expect(parseBaselineRelPath("manifest.json")).toBeNull();
    expect(parseBaselineRelPath("firefox/loose.png")).toBeNull();
    expect(parseBaselineRelPath("firefox/home/desktop.png")).toBeNull();
  });
});

describe("recordBaselines", () => {
  it("writes an RFC-shaped manifest for the requested engines only", () => {
    const { baselineDir, manifestPath } = makeTree({
      "chromium/home/mobile_375px.png": "c1",
      "firefox/home/desktop_1440px.png": "f1",
      "webkit/home/mobile_375px.png": "w1",
    });
    const manifest = recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: ENVELOPE,
      routes: ["/"],
    });

    expect(existsSync(manifestPath)).toBe(true);
    expect(manifest.playwrightVersion).toBe("1.61.1");
    expect(manifest.image).toBe(ENVELOPE.image);
    expect(Object.keys(manifest.baselines).sort()).toEqual([
      "firefox/home/desktop_1440px.png",
      "webkit/home/mobile_375px.png",
    ]);

    const entry = manifest.baselines["firefox/home/desktop_1440px.png"];
    expect(entry.sha256).toBe(createHash("sha256").update("f1").digest("hex"));
    expect(entry.engine).toBe("firefox");
    expect(entry.route).toBe("/");
    expect(entry.breakpoint).toBe("desktop");
    expect(entry.host).toBe("container");
    expect(entry.gitSha).toBe("abc1234");
    expect(new Date(entry.capturedAt).toISOString()).toBe(entry.capturedAt);
  });

  it("maps route slugs from the provided routes and nulls unknown slugs", () => {
    const { baselineDir, manifestPath } = makeTree({
      "firefox/about/mobile_375px.png": "a",
      "firefox/mystery/mobile_375px.png": "m",
    });
    const manifest = recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox"],
      envelope: ENVELOPE,
      routes: ["/", "/about"],
    });
    expect(manifest.baselines["firefox/about/mobile_375px.png"].route).toBe("/about");
    expect(manifest.baselines["firefox/mystery/mobile_375px.png"].route).toBeNull();
  });

  it("preserves other engines' entries and drops stale ones for scanned engines", () => {
    const { baselineDir, manifestPath } = makeTree({
      "firefox/home/desktop_1440px.png": "f1",
      "firefox/home/mobile_375px.png": "f2",
      "webkit/home/mobile_375px.png": "w1",
    });
    recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: ENVELOPE,
      routes: ["/"],
    });

    // A firefox baseline disappears; re-record firefox only.
    rmSync(join(baselineDir, "firefox", "home", "mobile_375px.png"));
    const manifest = recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox"],
      envelope: { ...ENVELOPE, gitSha: "def5678" },
      routes: ["/"],
    });

    expect(Object.keys(manifest.baselines).sort()).toEqual([
      "firefox/home/desktop_1440px.png",
      "webkit/home/mobile_375px.png",
    ]);
    // webkit untouched, firefox refreshed
    expect(manifest.baselines["webkit/home/mobile_375px.png"].gitSha).toBe("abc1234");
    expect(manifest.baselines["firefox/home/desktop_1440px.png"].gitSha).toBe("def5678");
  });
});

describe("syncManifest", () => {
  it("is a no-op when no manifest exists", () => {
    const { baselineDir, manifestPath } = makeTree({
      "chromium/home/mobile_375px.png": "c1",
    });
    const result = syncManifest({
      baselineDir,
      manifestPath,
      engines: ["chromium"],
      host: "local",
      gitSha: "abc1234",
    });
    expect(result).toBeNull();
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("refreshes entries for its engines without touching the envelope or other engines", () => {
    const { baselineDir, manifestPath } = makeTree({
      "chromium/home/mobile_375px.png": "c1",
      "firefox/home/mobile_375px.png": "f1",
    });
    recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["chromium", "firefox"],
      envelope: ENVELOPE,
      routes: ["/"],
    });

    // regression-test.sh rewrites the chromium baseline locally...
    writeFileSync(join(baselineDir, "chromium", "home", "mobile_375px.png"), "c2");
    // ...and a new chromium baseline appears.
    mkdirSync(join(baselineDir, "chromium", "about"), { recursive: true });
    writeFileSync(join(baselineDir, "chromium", "about", "mobile_375px.png"), "c3");

    const manifest = syncManifest({
      baselineDir,
      manifestPath,
      engines: ["chromium"],
      host: "local",
      gitSha: "def5678",
      routes: ["/", "/about"],
    });

    const updated = manifest.baselines["chromium/home/mobile_375px.png"];
    expect(updated.sha256).toBe(createHash("sha256").update("c2").digest("hex"));
    expect(updated.host).toBe("local");
    expect(updated.gitSha).toBe("def5678");
    expect(manifest.baselines["chromium/about/mobile_375px.png"]).toBeDefined();
    // firefox entry and top-level envelope untouched
    expect(manifest.baselines["firefox/home/mobile_375px.png"].host).toBe("container");
    expect(manifest.playwrightVersion).toBe("1.61.1");
    expect(manifest.image).toBe(ENVELOPE.image);
  });
});

describe("verifyBaselines", () => {
  function recordedTree() {
    const tree = makeTree({
      "firefox/home/desktop_1440px.png": "f1",
      "webkit/home/mobile_375px.png": "w1",
    });
    recordBaselines({
      baselineDir: tree.baselineDir,
      manifestPath: tree.manifestPath,
      engines: ["firefox", "webkit"],
      envelope: ENVELOPE,
      routes: ["/"],
    });
    return tree;
  }

  const CURRENT = { playwrightVersion: "1.61.1", host: "container" };
  const IMAGE = ENVELOPE.image;

  it("reports ok for pristine container-captured baselines", () => {
    const { baselineDir, manifestPath } = recordedTree();
    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: CURRENT,
      image: IMAGE,
    });
    expect(result.manifestFound).toBe(true);
    expect(result.statuses["firefox/home/desktop_1440px.png"]).toBe("ok");
    expect(result.statuses["webkit/home/mobile_375px.png"]).toBe("ok");
    expect(result.violations).toBe(0);
    expect(result.envelopeMatch).toBe(true);
    expect(result.drift).toEqual({ version: false, image: false });
  });

  it("flags modified, untracked, and missing baselines", () => {
    const { baselineDir, manifestPath } = recordedTree();
    writeFileSync(join(baselineDir, "firefox", "home", "desktop_1440px.png"), "f1-EDITED");
    mkdirSync(join(baselineDir, "webkit", "about"), { recursive: true });
    writeFileSync(join(baselineDir, "webkit", "about", "mobile_375px.png"), "new");
    rmSync(join(baselineDir, "webkit", "home", "mobile_375px.png"));

    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: CURRENT,
      image: IMAGE,
    });
    expect(result.statuses["firefox/home/desktop_1440px.png"]).toBe("modified");
    expect(result.statuses["webkit/about/mobile_375px.png"]).toBe("untracked");
    expect(result.statuses["webkit/home/mobile_375px.png"]).toBe("missing-file");
    expect(result.violations).toBe(3);
  });

  it("flags local-captured firefox/webkit baselines as foreign-host but not chromium", () => {
    const { baselineDir, manifestPath } = makeTree({
      "chromium/home/mobile_375px.png": "c1",
      "firefox/home/mobile_375px.png": "f1",
    });
    recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["chromium", "firefox"],
      envelope: { ...ENVELOPE, host: "local" },
      routes: ["/"],
    });
    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["chromium", "firefox"],
      envelope: CURRENT,
      image: IMAGE,
    });
    expect(result.statuses["firefox/home/mobile_375px.png"]).toBe("foreign-host");
    expect(result.statuses["chromium/home/mobile_375px.png"]).toBe("ok");
    expect(result.violations).toBe(1);
  });

  it("reports version and image drift against the manifest envelope", () => {
    const { baselineDir, manifestPath } = recordedTree();
    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: { playwrightVersion: "1.62.0", host: "container" },
      image: "mcr.microsoft.com/playwright:v1.62.0-noble",
    });
    expect(result.drift).toEqual({ version: true, image: true });
    expect(result.envelopeMatch).toBe(false);
    expect(result.violations).toBeGreaterThanOrEqual(2);
  });

  it("marks a local current envelope as not matching (advisory compares)", () => {
    const { baselineDir, manifestPath } = recordedTree();
    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: { playwrightVersion: "1.61.1", host: "local" },
      image: IMAGE,
    });
    expect(result.envelopeMatch).toBe(false);
    // host mismatch alone is advisory, not a per-baseline violation
    expect(result.statuses["firefox/home/desktop_1440px.png"]).toBe("ok");
  });

  it("treats every baseline as untracked when no manifest exists", () => {
    const { baselineDir, manifestPath } = makeTree({
      "firefox/home/desktop_1440px.png": "f1",
    });
    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox"],
      envelope: CURRENT,
      image: IMAGE,
    });
    expect(result.manifestFound).toBe(false);
    expect(result.statuses["firefox/home/desktop_1440px.png"]).toBe("untracked");
    expect(result.violations).toBe(1);
  });

  it("is clean when there is nothing to verify", () => {
    const { baselineDir, manifestPath } = makeTree({});
    const result = verifyBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox", "webkit"],
      envelope: CURRENT,
      image: IMAGE,
    });
    expect(result.manifestFound).toBe(false);
    expect(result.violations).toBe(0);
  });
});

describe("CLI", () => {
  function runCli(args, options = {}) {
    try {
      const stdout = execFileSync("node", [LIB, ...args], {
        encoding: "utf-8",
        timeout: 30000,
        ...options,
      });
      return { stdout, exitCode: 0 };
    } catch (err) {
      return { stdout: err.stdout ?? "", exitCode: err.status };
    }
  }

  it("verify --json exits 0 on a clean recorded tree", () => {
    const { baselineDir, manifestPath } = makeTree({
      "firefox/home/desktop_1440px.png": "f1",
    });
    recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox"],
      envelope: ENVELOPE,
      routes: ["/"],
    });
    const { stdout, exitCode } = runCli([
      "verify",
      "--json",
      "--baseline-dir", baselineDir,
      "--manifest", manifestPath,
      "--engines", "firefox",
      "--host", "container",
      "--playwright-version", "1.61.1",
      "--image", ENVELOPE.image,
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.violations).toBe(0);
  });

  it("verify --json exits 1 when a baseline was modified outside capture", () => {
    const { baselineDir, manifestPath } = makeTree({
      "firefox/home/desktop_1440px.png": "f1",
    });
    recordBaselines({
      baselineDir,
      manifestPath,
      engines: ["firefox"],
      envelope: ENVELOPE,
      routes: ["/"],
    });
    writeFileSync(join(baselineDir, "firefox", "home", "desktop_1440px.png"), "tampered");
    const { stdout, exitCode } = runCli([
      "verify",
      "--json",
      "--baseline-dir", baselineDir,
      "--manifest", manifestPath,
      "--engines", "firefox",
      "--host", "container",
      "--playwright-version", "1.61.1",
      "--image", ENVELOPE.image,
    ]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.statuses["firefox/home/desktop_1440px.png"]).toBe("modified");
  });
});
