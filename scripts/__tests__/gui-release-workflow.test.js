import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const RELEASE = join(repoRoot, ".github", "workflows", "release.yml");
const GUI_RELEASE = join(repoRoot, ".github", "workflows", "gui-release.yml");
const BUILDER_CONFIG = join(repoRoot, "packages", "gui", "electron-builder.yml");

/**
 * Guards for .github/workflows/gui-release.yml and its hand-off from release.yml
 * (issue #139).
 *
 * Flavian's and Vespasian's gui-release.yml build installers `on: release:
 * published`. Their releases are published with GITHUB_TOKEN, and GitHub never
 * starts a workflow for an event that GITHUB_TOKEN itself created, so that
 * trigger has never fired in either repo and their Release pages carry no
 * installers. Aurelius publishes the same way (softprops/action-gh-release with
 * GITHUB_TOKEN in release.yml), so here the installer build is a reusable
 * workflow that release.yml calls from the same run as its publish job.
 * `on: release` stays only for a release someone publishes by hand.
 *
 * As in release-workflow.test.js there is no YAML parser in the dev
 * dependencies, so these are textual invariants over the files.
 */

const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const releaseSource = read(RELEASE);
const guiSource = read(GUI_RELEASE);
const builderSource = read(BUILDER_CONFIG);

/** Lines nested under `header` (an exact line, e.g. "  workflow_call:"). */
function block(source, header) {
  const lines = source.split("\n");
  const start = lines.indexOf(header);
  if (start === -1) return null;
  const indent = header.match(/^ */)[0].length;
  const nested = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && line.match(/^ */)[0].length <= indent) break;
    nested.push(line);
  }
  return nested.join("\n");
}

/** The step (a `- name:` / `- uses:` list item) whose text contains `needle`. */
function step(source, needle) {
  return source.split(/\n {6}- /).find((s) => s.includes(needle)) ?? null;
}

/** `{ os: artifactsGlob }` from the build job's matrix. */
function matrixArtifacts(source) {
  const out = {};
  for (const entry of source.split(/\n\s+- os: /).slice(1)) {
    const os = entry.split("\n")[0].trim();
    const glob = entry.match(/^\s+artifacts:\s*(\S+)/m)?.[1];
    out[os] = glob;
  }
  return out;
}

describe("gui-release.yml — how it is triggered", () => {
  it("is a reusable workflow that takes the release tag as a required input", () => {
    const call = block(guiSource, "  workflow_call:");
    expect(call).not.toBeNull();
    expect(call).toMatch(/^\s+tag:\n/m);
    expect(call).toMatch(/required: true/);
  });

  it("can be dispatched by hand with the tag optional, so a dry run only builds", () => {
    const dispatch = block(guiSource, "  workflow_dispatch:");
    expect(dispatch).not.toBeNull();
    expect(dispatch).toMatch(/^\s+tag:\n/m);
    expect(dispatch).toMatch(/required: false/);
  });

  it("still builds for a release that was published by hand", () => {
    const release = block(guiSource, "  release:");
    expect(release).not.toBeNull();
    expect(release).toMatch(/types:\s*\[published\]/);
  });

  it("can write release assets", () => {
    expect(guiSource).toMatch(/^permissions:\n(?: {2}.*\n)*? {2}contents:\s*write/m);
  });
});

describe("gui-release.yml — build matrix", () => {
  it("builds one installer per platform, matching electron-builder.yml's targets", () => {
    const target = (platform) =>
      block(builderSource, `${platform}:`)?.match(/target:\s*(\S+)/)?.[1];
    const extension = { nsis: "exe", dmg: "dmg", AppImage: "AppImage" };
    expect(matrixArtifacts(guiSource)).toEqual({
      "macos-latest": `packages/gui/dist/*.${extension[target("mac")]}`,
      "windows-latest": `packages/gui/dist/*.${extension[target("win")]}`,
      "ubuntu-latest": `packages/gui/dist/*.${extension[target("linux")]}`,
    });
  });

  it("keeps building the other platforms when one of them fails", () => {
    expect(guiSource).toMatch(/fail-fast:\s*false/);
  });

  it("has a timeout so a hung runner cannot hold the release open", () => {
    expect(guiSource).toMatch(/timeout-minutes:\s*\d+/);
  });

  it("targets @aurelius/gui, not the sibling packages it was forked from", () => {
    expect(guiSource).toMatch(/--filter @aurelius\/gui/);
    expect(guiSource).not.toMatch(/@(flavian|vespasian)\//);
  });

  it("lets package.json's packageManager pin pnpm (no version: on pnpm/action-setup)", () => {
    const setup = step(guiSource, "pnpm/action-setup");
    expect(setup).not.toBeNull();
    expect(setup).not.toMatch(/^\s+version:/m);
  });
});

describe("gui-release.yml — build, smoke, package, attach", () => {
  it("checks out the tagged commit so the installers match the release", () => {
    const checkout = step(guiSource, "actions/checkout");
    expect(checkout).not.toBeNull();
    expect(checkout).toMatch(/ref:\s*\$\{\{\s*inputs\.tag/);
  });

  it("builds, then smoke-tests the bundle, then packages it", () => {
    // Command lines only: the header comment mentions electron-builder.yml.
    const commands = guiSource
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    const build = commands.indexOf("--filter @aurelius/gui build");
    const smoke = commands.indexOf("--filter @aurelius/gui smoke");
    const pack = commands.indexOf("exec electron-builder");
    expect(build).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(build);
    expect(pack).toBeGreaterThan(smoke);
  });

  it("runs the Linux smoke test under Xvfb", () => {
    expect(guiSource).toMatch(/xvfb-run[^\n]*--filter @aurelius\/gui smoke/);
  });

  it("packages unsigned installers and never lets electron-builder publish on its own", () => {
    expect(guiSource).toMatch(/electron-builder[^\n]*--publish never/);
    expect(guiSource).toMatch(/CSC_IDENTITY_AUTO_DISCOVERY:\s*"?false"?/);
  });

  it("keeps the installers as workflow artifacts and fails if none were produced", () => {
    const upload = step(guiSource, "actions/upload-artifact@v4");
    expect(upload).not.toBeNull();
    expect(upload).toMatch(/if-no-files-found:\s*error/);
  });

  it("attaches the installers to the release only when a tag is known, replacing stale assets", () => {
    const attach = step(guiSource, "gh release upload");
    expect(attach).not.toBeNull();
    expect(attach).toMatch(/^\s+if:[^\n]*RELEASE_TAG/m);
    expect(attach).toMatch(/gh release upload[^\n]*--clobber/);
  });
});

describe("release.yml — hands the new tag to the installer build in the same run", () => {
  it("exposes whether a release happened, and its tag, as outputs of the publish job", () => {
    const outputs = block(releaseSource, "    outputs:");
    expect(outputs).not.toBeNull();
    expect(outputs).toMatch(/^\s+release:\s*\$\{\{\s*steps\.version\.outputs\.release\s*\}\}/m);
    expect(outputs).toMatch(/^\s+tag:\s*\$\{\{\s*steps\.version\.outputs\.tag\s*\}\}/m);
  });

  it("calls gui-release.yml after publish, only when a release was actually created", () => {
    const installers = block(releaseSource, "  installers:");
    expect(installers).not.toBeNull();
    expect(installers).toMatch(/uses:\s*\.\/\.github\/workflows\/gui-release\.yml/);
    expect(installers).toMatch(/needs:\s*publish/);
    expect(installers).toMatch(/if:[^\n]*needs\.publish\.outputs\.release == 'true'/);
    expect(installers).toMatch(/tag:\s*\$\{\{\s*needs\.publish\.outputs\.tag\s*\}\}/);
  });

  it("keeps publishing the release with GITHUB_TOKEN (the reason `on: release` cannot be relied on)", () => {
    const create = step(releaseSource, "softprops/action-gh-release");
    expect(create).not.toBeNull();
    expect(create).toMatch(/GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  });
});
