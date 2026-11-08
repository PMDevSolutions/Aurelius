import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const WORKFLOW = join(repoRoot, ".github", "workflows", "release.yml");

/**
 * Regression guards for .github/workflows/release.yml (issues #121 and #144).
 *
 * The workflow is plain YAML with inline bash; there is no YAML parser in the
 * dev dependencies, so the first two groups are textual invariants over the
 * file. Each one pins a specific failure mode observed while cutting v2.0.0:
 *
 *   1. `pnpm release -- --release-as <type>` — pnpm forwards the `--` to
 *      commit-and-tag-version, whose parser then treats every following flag
 *      as a positional and silently falls back to auto-detection (and even
 *      ignores --dry-run).
 *   2. `git push … main` from GITHUB_TOKEN is rejected by the branch ruleset
 *      (GH013), after the tag ref has already been accepted.
 *
 * The third group executes the "Open release PR" step's script against a stub
 * `gh`, for the failure seen while cutting v2.1.0 (issue #144):
 *
 *   3. With the repository setting "Allow GitHub Actions to create and approve
 *      pull requests" off and no RELEASE_TOKEN, `gh pr create` is refused
 *      outright. The branch is already pushed by then, so the step must hand
 *      the human the compare link and the exact command instead of failing red.
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

/**
 * The bash of the step called `name` (its `run: |` block, de-indented), so the
 * exact script the runner executes can be run here against a stub `gh`.
 */
function stepScript(name) {
  const all = source.split("\n");
  const start = all.findIndex((l) => l.trim() === `- name: ${name}`);
  if (start === -1) return null;
  let runIndex = -1;
  for (let i = start + 1; i < all.length; i++) {
    if (/^\s*- (name|uses):/.test(all[i])) break;
    if (/^\s*run: \|\s*$/.test(all[i])) {
      runIndex = i;
      break;
    }
  }
  if (runIndex === -1) return null;
  const keyIndent = all[runIndex].match(/^ */)[0].length;
  const body = [];
  for (const line of all.slice(runIndex + 1)) {
    if (line.trim() !== "" && line.match(/^ */)[0].length <= keyIndent) break;
    body.push(line);
  }
  const contentIndent = body.find((l) => l.trim() !== "").match(/^ */)[0].length;
  return body.map((l) => l.slice(contentIndent)).join("\n");
}

const REPO = "PMDevSolutions/Aurelius";
const CREATED_PR = `https://github.com/${REPO}/pull/150`;
const REFUSED =
  "pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)";
const RELEASE_NOTES =
  "### Features\n\n* **gui:** a feature ([abc1234](https://github.com/PMDevSolutions/Aurelius/commit/abc1234))\n";

// Stand-in for the GitHub CLI: records every call, answers from GH_STUB_* variables.
const GH_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_STUB_LOG"
case "$1 $2" in
  "pr list") printf '%s' "\${GH_STUB_EXISTING_PR:-}" ;;
  "pr edit") exit 0 ;;
  "pr create")
    if [ -n "\${GH_STUB_CREATE_ERROR:-}" ]; then
      echo "\${GH_STUB_CREATE_ERROR}" >&2
      exit 1
    fi
    echo "${CREATED_PR}"
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 99
    ;;
esac
`;

/** Runs the "Open release PR" step as the runner would, with `gh` stubbed. */
function runOpenReleasePr(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "aurelius-release-pr-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), GH_STUB, { mode: 0o755 });
  writeFileSync(join(dir, "RELEASE_NOTES.md"), RELEASE_NOTES);
  const summary = join(dir, "step-summary.md");
  writeFileSync(summary, "");
  const log = join(dir, "gh-calls.log");
  writeFileSync(log, "");
  const script = join(dir, "open-release-pr.sh");
  writeFileSync(script, stepScript("Open release PR"));
  try {
    const result = spawnSync("bash", [script], {
      cwd: dir,
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: dir,
        GH_TOKEN: "stub-token",
        GH_STUB_LOG: log,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_REPOSITORY: REPO,
        GITHUB_SERVER_URL: "https://github.com",
        RUNNER_TEMP: dir,
        BRANCH: "release/v9.9.9",
        VERSION: "9.9.9",
        TAG: "v9.9.9",
        RELEASE_TYPE: "auto",
        HAS_RELEASE_TOKEN: "false",
        ...env,
      },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      summary: readFileSync(summary, "utf8"),
      calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("release.yml — opening the release PR (issue #144, bug 3)", () => {
  const script = stepScript("Open release PR");

  it("is valid bash that takes every input from env, never from a ${{ }} expression", () => {
    expect(script).not.toBeNull();
    expect(script).not.toMatch(/\$\{\{/);
    const syntax = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
    expect(syntax.stderr).toBe("");
    expect(syntax.status).toBe(0);
  });

  it("opens the PR from the pushed branch against main and records its URL in the summary", () => {
    const run = runOpenReleasePr();
    expect(run.status).toBe(0);
    expect(run.calls).toContainEqual(
      expect.stringMatching(
        /^pr create .*--base main .*--head release\/v9\.9\.9 .*--title chore\(release\): v9\.9\.9/,
      ),
    );
    expect(run.summary).toContain(`Release PR: ${CREATED_PR}`);
  });

  it("refreshes an already-open release PR instead of opening a second one", () => {
    const existing = `https://github.com/${REPO}/pull/149`;
    const run = runOpenReleasePr({ GH_STUB_EXISTING_PR: existing });
    expect(run.status).toBe(0);
    expect(run.calls.some((c) => c.startsWith("pr create"))).toBe(false);
    expect(run.calls).toContainEqual(expect.stringMatching(`^pr edit ${existing} `));
    expect(run.summary).toContain(`Release PR: ${existing}`);
  });

  it("notes that a PR opened with GITHUB_TOKEN starts no CI, unless RELEASE_TOKEN was used", () => {
    expect(runOpenReleasePr().stdout).toMatch(/::notice::.*close and reopen/i);
    expect(runOpenReleasePr({ HAS_RELEASE_TOKEN: "true" }).stdout).not.toMatch(/::notice::/);
  });

  it("exits 0 with a warning when Actions may not create pull requests: the branch is pushed", () => {
    const run = runOpenReleasePr({ GH_STUB_CREATE_ERROR: REFUSED });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^::warning::.*release\/v9\.9\.9/m);
    // There is no PR to close and reopen.
    expect(run.stdout).not.toMatch(/::notice::/);
  });

  it("then puts the compare link, the exact gh pr create command and the PR body in the summary", () => {
    const { summary } = runOpenReleasePr({ GH_STUB_CREATE_ERROR: REFUSED });
    expect(summary).toContain(`https://github.com/${REPO}/compare/main...release/v9.9.9`);
    expect(summary).toMatch(/gh pr create[^\n]*--repo PMDevSolutions\/Aurelius/);
    expect(summary).toMatch(/gh pr create[\s\S]*--base main/);
    expect(summary).toMatch(/gh pr create[\s\S]*--head release\/v9\.9\.9/);
    expect(summary).toMatch(/gh pr create[\s\S]*--title "chore\(release\): v9\.9\.9"/);
    expect(summary).toContain("Merging this PR tags the merge commit as `v9.9.9`");
    expect(summary).toContain(RELEASE_NOTES.trim());
    expect(summary).toContain(REFUSED);
  });

  it("names both permanent fixes when the refusal is the Actions permission", () => {
    const { summary } = runOpenReleasePr({ GH_STUB_CREATE_ERROR: REFUSED });
    expect(summary).toContain("RELEASE_TOKEN");
    expect(summary).toContain("Allow GitHub Actions to create and approve pull requests");
  });

  it("degrades the same way for any other gh pr create failure, without the permission advice", () => {
    const error = "HTTP 502: Bad Gateway (https://api.github.com/graphql)";
    const run = runOpenReleasePr({ GH_STUB_CREATE_ERROR: error });
    expect(run.status).toBe(0);
    expect(run.summary).toContain(error);
    expect(run.summary).toContain(`https://github.com/${REPO}/compare/main...release/v9.9.9`);
    expect(run.summary).not.toContain("RELEASE_TOKEN");
  });
});
