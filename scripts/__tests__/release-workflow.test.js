import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const WORKFLOW = join(repoRoot, ".github", "workflows", "release.yml");

/**
 * Regression guards for .github/workflows/release.yml (issue #121).
 *
 * The workflow is plain YAML with inline bash; there is no YAML parser in the
 * dev dependencies, so these are textual invariants over the file. Each one
 * pins a specific failure mode observed while cutting v2.0.0:
 *
 *   1. `pnpm release -- --release-as <type>` — pnpm forwards the `--` to
 *      commit-and-tag-version, whose parser then treats every following flag
 *      as a positional and silently falls back to auto-detection (and even
 *      ignores --dry-run).
 *   2. `git push … main` from GITHUB_TOKEN is rejected by the branch ruleset
 *      (GH013), after the tag ref has already been accepted.
 */

const source = readFileSync(WORKFLOW, "utf8");
// Command lines only — YAML/bash comments may legitimately describe the bug.
const lines = source.split("\n").filter((l) => !/^\s*#/.test(l));

describe("release.yml — flag forwarding (issue #121, bug 1)", () => {
  it("never routes commit-and-tag-version flags through `pnpm run … --`", () => {
    const offenders = lines.filter((l) => /pnpm (run )?release\b.*\s--(\s|$)/.test(l));
    expect(offenders).toEqual([]);
  });

  it("invokes commit-and-tag-version directly with --release-as for explicit types", () => {
    expect(source).toMatch(/pnpm exec commit-and-tag-version[^\n]*--release-as/);
  });

  it("still honours the auto-detect path without --release-as", () => {
    const autoLine = lines.find(
      (l) => /pnpm exec commit-and-tag-version/.test(l) && !/--release-as/.test(l),
    );
    expect(autoLine).toBeDefined();
  });
});

describe("release.yml — no direct push to the protected branch (issue #121, bug 2)", () => {
  it("does not push commits to main / the dispatching ref", () => {
    const pushes = lines.filter((l) => /git push/.test(l));
    expect(pushes.length).toBeGreaterThan(0);
    for (const l of pushes) {
      expect(l).not.toMatch(/--follow-tags/);
      expect(l).not.toMatch(/origin\s+main\b/);
      expect(l).not.toMatch(/github\.ref_name/);
    }
  });

  it("opens a release pull request instead", () => {
    expect(source).toMatch(/pull-requests:\s*write/);
    expect(source).toMatch(/pulls\.create|gh pr create/);
  });

  it("publishes the tag + GitHub Release from main after the PR merges", () => {
    // A push trigger on main is what turns the merged bump into a release.
    expect(source).toMatch(/^on:[\s\S]*?\n {2}push:\n(?: {4}.*\n)*? {4}branches:\s*\[main\]/m);
    // The publish path must be idempotent: skip when the tag already exists.
    expect(source).toMatch(
      /git ls-remote[^\n]*--tags|git rev-parse[^\n]*refs\/tags|gh release view/,
    );
    expect(source).toMatch(/softprops\/action-gh-release|gh release create/);
  });

  it("lets a maintainer-supplied token stand in for GITHUB_TOKEN so CI runs on the release PR", () => {
    expect(source).toMatch(/secrets\.RELEASE_TOKEN \|\| secrets\.GITHUB_TOKEN/);
  });
});
