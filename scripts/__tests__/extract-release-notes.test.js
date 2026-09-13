import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "extract-release-notes.js");

const CHANGELOG = `# Changelog

All notable changes are documented here.

## [2.1.0](https://example.com/compare/v2.0.0...v2.1.0) (2026-09-13)

### Features

* newest thing

## [2.0.0](https://example.com/compare/v1.1.0...v2.0.0) (2026-08-15)

### Bug Fixes

* older fix

## [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2026-07-01)

### Features

* oldest feature
`;

let counter = 0;
const dirs = [];

function fixture(changelog = CHANGELOG) {
  counter++;
  const dir = join(__dirname, "fixtures", `release-notes-${counter}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "CHANGELOG.md"), changelog);
  dirs.push(dir);
  return dir;
}

function run(cwd, args = []) {
  return execFileSync("node", [SCRIPT, ...args], { cwd, encoding: "utf8" });
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("extract-release-notes.js", () => {
  it("defaults to the latest (first) version section", () => {
    const dir = fixture();
    run(dir);
    const notes = readFileSync(join(dir, "RELEASE_NOTES.md"), "utf8");
    expect(notes).toContain("newest thing");
    expect(notes).not.toContain("older fix");
    expect(notes).not.toMatch(/^## /m);
  });

  it("extracts a specific version when asked (used by the publish job after merge)", () => {
    const dir = fixture();
    run(dir, ["--version", "2.0.0"]);
    const notes = readFileSync(join(dir, "RELEASE_NOTES.md"), "utf8");
    expect(notes).toContain("older fix");
    expect(notes).not.toContain("newest thing");
    expect(notes).not.toContain("oldest feature");
  });

  it("accepts the tag form (v-prefixed) of the version", () => {
    const dir = fixture();
    run(dir, ["--version", "v1.1.0"]);
    const notes = readFileSync(join(dir, "RELEASE_NOTES.md"), "utf8");
    expect(notes).toContain("oldest feature");
  });

  it("fails loudly when the requested version is not in the changelog", () => {
    const dir = fixture();
    expect(() => run(dir, ["--version", "9.9.9"])).toThrow();
  });
});
