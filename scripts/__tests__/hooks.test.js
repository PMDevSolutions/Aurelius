import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { classifyCommand } from "../../.claude/hooks/lib/deploy-classify.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const HOOKS_DIR = join(repoRoot, ".claude", "hooks");

/**
 * Tests for the hooks in .claude/hooks/.
 *
 * Contract (https://code.claude.com/docs/en/hooks): Claude Code passes the event
 * as JSON on stdin; a hook replies with JSON on stdout (or nothing) and always
 * exits 0. These tests feed synthetic events and parse the reply.
 */

const temps = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "aurelius-hooks-"));
  temps.push(dir);
  return dir;
}

/** A project with a pipeline config, which is what makes the hooks speak up. */
function aureliusProject(config = {}) {
  const dir = tmp();
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.config.json"),
    JSON.stringify({
      tdd: { coverageThreshold: 85 },
      qualityGate: { lighthouseThresholds: { performance: 90, accessibility: 95 } },
      bundleSize: { enabled: true, maxSizeKb: 50 },
      mutationTesting: { reminder: true },
      darkMode: { enabled: true },
      ...config,
    }),
  );
  return dir;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Hook Test",
  GIT_AUTHOR_EMAIL: "hooks@example.com",
  GIT_COMMITTER_NAME: "Hook Test",
  GIT_COMMITTER_EMAIL: "hooks@example.com",
};

function git(dir, ...args) {
  return execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...GIT_ENV },
    },
  );
}

function gitRepo(dir, branch = "main") {
  git(dir, "init", "-q", "-b", branch);
  git(dir, "commit", "-q", "--allow-empty", "-m", "init");
  return dir;
}

function runHook(name, event, { cwd = repoRoot, projectDir = cwd, args = [] } = {}) {
  const input = typeof event === "string" ? event : JSON.stringify({ cwd, ...event });
  return execFileSync("bash", [join(HOOKS_DIR, name), ...args], {
    cwd,
    encoding: "utf8",
    input,
    timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

const parse = (out) => (out.trim() ? JSON.parse(out) : null);
const decision = (out) => parse(out)?.hookSpecificOutput?.permissionDecision;
const context = (out) => parse(out)?.hookSpecificOutput?.additionalContext ?? "";

const pre = (command, extra = {}) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
  permission_mode: "default",
  ...extra,
});
const post = (command, stdout, stderr = "") => ({
  hook_event_name: "PostToolUse",
  tool_name: "Bash",
  tool_input: { command },
  tool_response: { stdout, stderr, interrupted: false, isImage: false },
});
const SUBAGENT = { agent_id: "a1b2c3", agent_type: "devops-automator" };

const HOOKS = [
  "deploy-guard.sh",
  "agent-no-deploy.sh",
  "pre-commit-token-guard.sh",
  "bundle-size-guard.sh",
  "post-build-qa.sh",
  "lighthouse-ci.sh",
  "regression-reminder.sh",
  "coverage-check.sh",
  "mutation-test-reminder.sh",
  "dark-mode-reminder.sh",
  "session-context.sh",
];

describe("hook contract", () => {
  for (const hook of HOOKS) {
    it(`${hook} exits 0 and stays quiet or returns JSON on an unrelated event`, () => {
      const out = runHook(hook, pre("ls -la"));
      if (out.trim() && hook !== "session-context.sh") expect(() => JSON.parse(out)).not.toThrow();
    });

    it(`${hook} exits 0 on empty stdin`, () => {
      // execFileSync throws on a non-zero exit, so reaching expect() proves exit 0.
      expect(typeof runHook(hook, "")).toBe("string");
    });

    it(`${hook} exits 0 on malformed JSON`, () => {
      expect(typeof runHook(hook, "{not json")).toBe("string");
    });

    it(`${hook} is executable and reads the event from stdin`, () => {
      const file = join(HOOKS_DIR, hook);
      expect(statSync(file).mode & 0o111).not.toBe(0);
      expect(readFileSync(file, "utf8")).not.toMatch(/TOOL_INPUT="\$\{1/);
    });
  }
});

describe("deploy-guard (PreToolUse)", () => {
  it("asks a human before production deploys, publishes, releases and merges", () => {
    for (const cmd of [
      "vercel --prod",
      "npx vercel deploy --prod --yes",
      "netlify deploy --prod --dir dist",
      "pnpm wrangler deploy",
      "npm publish",
      "pnpm exec changeset publish",
      "pnpm release",
      "eas submit -p ios",
      "gh release create v1.2.0 --generate-notes",
      "gh pr merge 12 --squash",
      "gh workflow run release.yml",
      "git push --force-with-lease",
      "git push origin HEAD:main",
      "npx chrome-webstore-upload upload --source extension.zip",
    ]) {
      const out = runHook("deploy-guard.sh", pre(cmd));
      expect(decision(out), cmd).toBe("ask");
      expect(parse(out).hookSpecificOutput.permissionDecisionReason).toMatch(/^Deploy guard:/);
    }
  });

  it("reminds, without a decision, on preview deploys", () => {
    for (const cmd of [
      "vercel",
      "netlify deploy --dir dist",
      "wrangler pages deploy dist --branch feat-x",
    ]) {
      const out = runHook("deploy-guard.sh", pre(cmd));
      expect(decision(out), cmd).toBeUndefined();
      expect(context(out), cmd).toMatch(/preview URL is public/);
    }
  });

  it("denies every tier inside a subagent", () => {
    for (const cmd of [
      "vercel --prod",
      "vercel",
      "git push -u origin feat/x",
      "gh pr create --fill",
    ]) {
      const out = runHook("deploy-guard.sh", pre(cmd, SUBAGENT));
      expect(decision(out), cmd).toBe("deny");
      expect(parse(out).hookSpecificOutput.permissionDecisionReason).toMatch(
        /Deploy guard \(subagent\)/,
      );
    }
  });

  it("turns ask into deny where a hook cannot prompt", () => {
    for (const mode of ["bypassPermissions", "dontAsk"]) {
      const out = runHook("deploy-guard.sh", pre("npm publish", { permission_mode: mode }));
      expect(decision(out)).toBe("deny");
      expect(parse(out).hookSpecificOutput.permissionDecisionReason).toContain(mode);
    }
  });

  it("stays silent on ordinary commands, dry runs and deploy words that are only text", () => {
    for (const cmd of [
      "ls -la",
      "pnpm build",
      "pnpm vitest run",
      "vercel env pull .env.local",
      "npm publish --dry-run",
      "npx wrangler deploy --dry-run",
      'git commit -m "ship it with vercel --prod and npm publish"',
      "git push -u origin feat/x",
      "gh pr create --fill",
    ]) {
      expect(runHook("deploy-guard.sh", pre(cmd)), cmd).toBe("");
    }
  });

  it("asks on a plain push when main is checked out, not on a feature branch", () => {
    const onMain = gitRepo(tmp(), "main");
    expect(decision(runHook("deploy-guard.sh", pre("git push"), { cwd: onMain }))).toBe("ask");
    const onFeature = gitRepo(tmp(), "feat/lanes");
    expect(runHook("deploy-guard.sh", pre("git push"), { cwd: onFeature })).toBe("");
  });

  it("is registered fail-closed on every Bash call, in settings.json and hooks.json", () => {
    for (const file of [
      join(repoRoot, ".claude", "settings.json"),
      join(HOOKS_DIR, "hooks.json"),
    ]) {
      const { hooks } = JSON.parse(readFileSync(file, "utf8"));
      const entry = hooks.PreToolUse.find((e) =>
        e.hooks.some((h) => h.command.includes("deploy-guard.sh")),
      );
      const handler = entry.hooks.find((h) => h.command.includes("deploy-guard.sh"));
      expect(entry.matcher).toBe("Bash");
      expect(handler.onFailure).toBe("block");
      expect(handler.if).toBeUndefined();
    }
  });
});

describe("agent-no-deploy (agent frontmatter)", () => {
  it("denies pushes and deploys even when the event carries no agent_id", () => {
    expect(decision(runHook("agent-no-deploy.sh", pre("git push origin feat/x")))).toBe("deny");
    expect(decision(runHook("agent-no-deploy.sh", pre("vercel --prod")))).toBe("deny");
  });

  it("lets ordinary commands through", () => {
    expect(runHook("agent-no-deploy.sh", pre("pnpm vitest run"))).toBe("");
  });
});

describe("deploy classifier", () => {
  const onFeature = () => ({ current: "feat/x", defaultBranch: "main" });
  const onMain = () => ({ current: "main", defaultBranch: "main" });
  const tier = (cmd, branch = onFeature) =>
    classifyCommand(cmd, { cwd: repoRoot, branch })?.[0] ?? null;

  it("splits compound commands and classifies what actually runs", () => {
    expect(tier('git add -A && git commit -m "x" && git push origin main')).toBe("gate");
    expect(tier("cd app && pnpm build && vercel --prod")).toBe("gate");
    expect(tier('bash -c "npm publish"')).toBe("gate");
    expect(tier("echo $(vercel --prod)")).toBe("gate");
  });

  it("resolves runners, package names and versions to the tool", () => {
    expect(tier("pnpm dlx vercel@latest --prod")).toBe("gate");
    expect(tier("npx @changesets/cli@2 publish")).toBe("gate");
    expect(tier("pnpm --filter web exec vercel --prod")).toBe("gate");
    expect(tier("yarn vercel")).toBe("preview");
  });

  it("tells production from preview and local work", () => {
    expect(tier("wrangler pages deploy dist")).toBe("gate");
    expect(tier("wrangler d1 migrations apply DB --remote")).toBe("gate");
    expect(tier("wrangler d1 migrations apply DB --local")).toBe(null);
    expect(tier("eas update --branch production")).toBe("gate");
    expect(tier("eas update --branch preview")).toBe("preview");
    expect(tier("eas build --profile production")).toBe(null);
    expect(tier("pnpm deploy ./out --filter api")).toBe(null);
    expect(tier("pnpm release:dry")).toBe(null);
    expect(tier("vercel --version")).toBe(null);
  });

  it("classifies pushes by target", () => {
    expect(tier("git push")).toBe("outward");
    expect(tier("git push", onMain)).toBe("gate");
    expect(tier("git push origin v1.2.0")).toBe("gate");
    expect(tier("git push --follow-tags")).toBe("gate");
    expect(tier("git push heroku main")).toBe("gate");
    expect(tier("git push origin :old-branch")).toBe("gate");
    expect(tier("git push -n origin main")).toBe(null);
  });
});

describe("pre-commit-token-guard (PreToolUse)", () => {
  /** A git repo holding an app with a lockfile; the real verify-tokens.sh runs against it. */
  function appRepo() {
    const dir = gitRepo(tmp());
    mkdirSync(join(dir, "src", "styles"), { recursive: true });
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(
      join(dir, "src", "styles", "design-tokens.lock.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    writeFileSync(
      join(dir, "src", "components", "Clean.tsx"),
      'export const Clean = () => <p className="text-primary">ok</p>;\n',
    );
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "app");
    return dir;
  }
  const HEX = 'export const Hot = () => <p style={{ color: "#ff0000" }}>hot</p>;\n';

  it("denies a commit that carries a hardcoded value", () => {
    const dir = appRepo();
    writeFileSync(join(dir, "src", "components", "Hot.tsx"), HEX);
    git(dir, "add", "src/components/Hot.tsx");
    const out = runHook("pre-commit-token-guard.sh", pre('git commit -m "feat: hot"'), {
      cwd: dir,
      projectDir: repoRoot,
    });
    expect(decision(out)).toBe("deny");
    expect(parse(out).hookSpecificOutput.permissionDecisionReason).toMatch(
      /Token guard: \d+ hardcoded value/,
    );
    expect(parse(out).hookSpecificOutput.permissionDecisionReason).toContain(
      "src/components/Hot.tsx",
    );
  });

  it("looks at untracked files when the same command runs git add", () => {
    const dir = appRepo();
    writeFileSync(join(dir, "src", "components", "Hot.tsx"), HEX);
    const out = runHook(
      "pre-commit-token-guard.sh",
      pre('git add -A && git commit -m "feat: hot"'),
      { cwd: dir, projectDir: repoRoot },
    );
    expect(decision(out)).toBe("deny");
  });

  it("stays silent when the violation sits in a file the commit does not carry", () => {
    const dir = appRepo();
    writeFileSync(join(dir, "src", "components", "Hot.tsx"), HEX);
    writeFileSync(
      join(dir, "src", "components", "Clean.tsx"),
      'export const Clean = () => <p className="text-muted">ok</p>;\n',
    );
    git(dir, "add", "src/components/Clean.tsx");
    expect(
      runHook("pre-commit-token-guard.sh", pre('git commit -m "fix: copy"'), {
        cwd: dir,
        projectDir: repoRoot,
      }),
    ).toBe("");
  });

  it("finds the app from a leading cd", () => {
    const root = tmp();
    const app = join(root, "my-app");
    mkdirSync(app);
    gitRepo(app);
    mkdirSync(join(app, "src", "styles"), { recursive: true });
    writeFileSync(join(app, "src", "styles", "design-tokens.lock.json"), "{}");
    writeFileSync(join(app, "src", "Hot.tsx"), HEX);
    git(app, "add", "-A");
    const out = runHook("pre-commit-token-guard.sh", pre('cd my-app && git commit -m "feat"'), {
      cwd: root,
      projectDir: repoRoot,
    });
    expect(decision(out)).toBe("deny");
  });

  it("stays silent without a lockfile or outside a commit", () => {
    const dir = gitRepo(tmp());
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "Hot.tsx"), HEX);
    git(dir, "add", "-A");
    expect(
      runHook("pre-commit-token-guard.sh", pre('git commit -m "x"'), {
        cwd: dir,
        projectDir: repoRoot,
      }),
    ).toBe("");
    expect(
      runHook("pre-commit-token-guard.sh", pre("git status"), {
        cwd: appRepo(),
        projectDir: repoRoot,
      }),
    ).toBe("");
  });
});

describe("bundle-size-guard (PreToolUse)", () => {
  it("returns a reminder when the build exceeds bundleSize.maxSizeKb", () => {
    const dir = aureliusProject();
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "big.js"), "x".repeat(60 * 1024));
    const out = runHook("bundle-size-guard.sh", pre("git commit -m feat"), { cwd: dir });
    expect(decision(out)).toBeUndefined();
    expect(context(out)).toMatch(/\[bundle-guard\] dist\/ holds 60KB .* above the 50KB limit/);
  });

  it("counts only JavaScript and CSS", () => {
    const dir = aureliusProject();
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "hero.png"), "x".repeat(200 * 1024));
    expect(runHook("bundle-size-guard.sh", pre("git commit -m feat"), { cwd: dir })).toBe("");
  });

  it("stays silent without a build, outside a commit, when disabled, or outside an Aurelius project", () => {
    expect(
      runHook("bundle-size-guard.sh", pre("git commit -m feat"), { cwd: aureliusProject() }),
    ).toBe("");
    const built = aureliusProject();
    mkdirSync(join(built, "dist"), { recursive: true });
    writeFileSync(join(built, "dist", "big.js"), "x".repeat(60 * 1024));
    expect(runHook("bundle-size-guard.sh", pre("pnpm test"), { cwd: built })).toBe("");
    const off = aureliusProject({ bundleSize: { enabled: false, maxSizeKb: 50 } });
    mkdirSync(join(off, "dist"), { recursive: true });
    writeFileSync(join(off, "dist", "big.js"), "x".repeat(60 * 1024));
    expect(runHook("bundle-size-guard.sh", pre("git commit -m feat"), { cwd: off })).toBe("");
    const plain = tmp();
    mkdirSync(join(plain, "dist"), { recursive: true });
    writeFileSync(join(plain, "dist", "big.js"), "x".repeat(60 * 1024));
    expect(runHook("bundle-size-guard.sh", pre("git commit -m feat"), { cwd: plain })).toBe("");
  });
});

describe("post-build reminders (PostToolUse)", () => {
  const VITE_OK =
    "vite v6.4.4 building for production...\n✓ 42 modules transformed.\n✓ built in 1.24s";

  it("post-build-qa reminds after a successful build only", () => {
    const dir = aureliusProject();
    expect(context(runHook("post-build-qa.sh", post("pnpm build", VITE_OK), { cwd: dir }))).toMatch(
      /\[post-build-qa\].*pnpm vitest run/,
    );
    expect(
      context(
        runHook("post-build-qa.sh", post("pnpm run build", "✓ Compiled successfully"), {
          cwd: dir,
        }),
      ),
    ).toMatch(/\[post-build-qa\]/);
    expect(
      runHook("post-build-qa.sh", post("pnpm build", "error during build:\nELIFECYCLE"), {
        cwd: dir,
      }),
    ).toBe("");
    expect(
      runHook("post-build-qa.sh", post("pnpm build-storybook --quiet", VITE_OK), { cwd: dir }),
    ).toBe("");
    expect(runHook("post-build-qa.sh", post("pnpm dev", "ready"), { cwd: dir })).toBe("");
  });

  it("post-build-qa stays silent outside an Aurelius project", () => {
    expect(runHook("post-build-qa.sh", post("pnpm build", VITE_OK), { cwd: tmp() })).toBe("");
  });

  it("lighthouse-ci carries the configured thresholds", () => {
    const out = runHook("lighthouse-ci.sh", post("pnpm build", VITE_OK), {
      cwd: aureliusProject(),
    });
    expect(context(out)).toContain("performance=90");
    expect(context(out)).toContain("accessibility=95");
    expect(
      runHook("lighthouse-ci.sh", post("pnpm build", "compiling..."), { cwd: aureliusProject() }),
    ).toBe("");
  });

  it("regression-reminder speaks only when baselines exist", () => {
    const dir = aureliusProject();
    expect(runHook("regression-reminder.sh", post("pnpm build", VITE_OK), { cwd: dir })).toBe("");
    mkdirSync(join(dir, ".claude", "visual-qa", "baselines", "chromium"), { recursive: true });
    writeFileSync(join(dir, ".claude", "visual-qa", "baselines", "chromium", "home.png"), "fake");
    expect(
      context(runHook("regression-reminder.sh", post("pnpm build", VITE_OK), { cwd: dir })),
    ).toContain("1 baselines");
  });
});

describe("test-run reminders (PostToolUse)", () => {
  const table = (pct) =>
    [
      " % Coverage report from v8",
      "-----------|---------|----------|---------|---------|",
      "File       | % Stmts | % Branch | % Funcs | % Lines |",
      "-----------|---------|----------|---------|---------|",
      `All files  |   ${pct} |    80.00 |   90.00 |   ${pct} |`,
    ].join("\n");

  it("coverage-check names both numbers when coverage is below the threshold", () => {
    const out = runHook("coverage-check.sh", post("pnpm vitest run --coverage", table("72.40")), {
      cwd: aureliusProject(),
    });
    expect(context(out)).toMatch(/72\.40%, below the 85% threshold/);
  });

  it("coverage-check is silent at or above the threshold", () => {
    expect(
      runHook("coverage-check.sh", post("pnpm vitest run --coverage", table("91.00")), {
        cwd: aureliusProject(),
      }),
    ).toBe("");
  });

  it("coverage-check falls back to a reminder, and to 80%, when it cannot read the table", () => {
    expect(
      context(
        runHook("coverage-check.sh", post("pnpm vitest run --coverage", "Coverage report: ..."), {
          cwd: aureliusProject(),
        }),
      ),
    ).toContain("85% threshold");
    const bare = aureliusProject({ tdd: {} });
    expect(
      context(
        runHook("coverage-check.sh", post("pnpm vitest run --coverage", "Coverage report: ..."), {
          cwd: bare,
        }),
      ),
    ).toContain("80% threshold");
  });

  it("mutation-test-reminder suggests Stryker after a fully passing run", () => {
    const dir = aureliusProject();
    expect(
      context(
        runHook("mutation-test-reminder.sh", post("pnpm vitest run", " Tests  42 passed (42)"), {
          cwd: dir,
        }),
      ),
    ).toMatch(/\[mutation-test\]/);
    expect(
      runHook(
        "mutation-test-reminder.sh",
        post("pnpm vitest run", " Tests  3 failed | 39 passed (42)"),
        { cwd: dir },
      ),
    ).toBe("");
    const off = aureliusProject({ mutationTesting: { reminder: false } });
    expect(
      runHook("mutation-test-reminder.sh", post("pnpm vitest run", " Tests  10 passed (10)"), {
        cwd: off,
      }),
    ).toBe("");
  });

  it("dark-mode-reminder follows a passing visual diff", () => {
    const dir = aureliusProject();
    expect(
      context(
        runHook(
          "dark-mode-reminder.sh",
          post("node scripts/visual-diff.js a.png b.png", "Overall: PASS"),
          { cwd: dir },
        ),
      ),
    ).toMatch(/\[dark-mode-reminder\]/);
    expect(
      runHook(
        "dark-mode-reminder.sh",
        post("node scripts/visual-diff.js --batch a b", "  FAIL  home — 5.00% diff\nOverall: FAIL"),
        { cwd: dir },
      ),
    ).toBe("");
    const off = aureliusProject({ darkMode: { enabled: false } });
    expect(
      runHook(
        "dark-mode-reminder.sh",
        post("node scripts/visual-diff.js a.png b.png", "Overall: PASS"),
        { cwd: off },
      ),
    ).toBe("");
  });
});

describe("session-context (SessionStart)", () => {
  const start = { hook_event_name: "SessionStart", source: "startup" };

  it("stays silent outside an Aurelius checkout", () => {
    expect(runHook("session-context.sh", start, { cwd: tmp() })).toBe("");
  });

  it("reports the run in flight and where it resumes", () => {
    const dir = aureliusProject();
    mkdirSync(join(dir, ".claude", "plans"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "plans", "pipeline-state.json"),
      JSON.stringify({
        pipeline: "figma",
        renderer: "vite",
        appType: "web-app",
        updatedAt: "2026-10-24T15:00:00Z",
        phase: "5",
        phases: {
          3: { name: "tdd-scaffold", status: "done" },
          4: { name: "component-build", status: "done" },
          5: { name: "visual-diff", status: "running" },
        },
        components: {
          Button: { build: "green" },
          Card: { build: "green" },
          Hero: { build: "needs-review" },
        },
        pages: { home: { visual: "pass" }, pricing: { visual: "pending" } },
      }),
    );
    const out = runHook("session-context.sh", start, { cwd: dir });
    expect(out).toMatch(/^Aurelius status/);
    expect(out).toContain(
      "Pipeline run in flight: /build-from-figma (vite, web-app), phase 5 visual-diff [running]",
    );
    expect(out).toContain("components: 2/3 green, 1 need review");
    expect(out).toContain("pages: 1/2 visually verified");
    expect(out).toContain("continues from phase 5");
  });

  it("orders /build-from-conversation's C0 and C1 before the numbered phases", () => {
    const dir = aureliusProject();
    mkdirSync(join(dir, ".claude", "plans"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "plans", "pipeline-state.json"),
      JSON.stringify({
        pipeline: "figma",
        phase: "C1",
        phases: {
          2: { name: "token-lock", status: "pending" },
          C1: { name: "design-brief-to-figma", status: "running" },
          C0: { name: "conversation-intake", status: "done" },
          1: { name: "intake", status: "pending" },
        },
      }),
    );
    expect(runHook("session-context.sh", start, { cwd: dir })).toContain("continues from phase C1");
  });

  it("finds the lockfile of an app that lives beside the framework", () => {
    const dir = aureliusProject();
    mkdirSync(join(dir, "my-app", "src", "styles"), { recursive: true });
    writeFileSync(
      join(dir, "my-app", "src", "styles", "design-tokens.lock.json"),
      JSON.stringify({
        version: "1.0.0",
        generatedAt: "2026-10-20T10:00:00Z",
        figmaFileKey: "abc",
      }),
    );
    expect(runHook("session-context.sh", start, { cwd: dir })).toContain(
      "Token lockfile: my-app/src/styles/design-tokens.lock.json v1.0.0 (figma, 2026-10-20)",
    );
  });
});

describe("registration", () => {
  const settings = JSON.parse(
    readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8"),
  ).hooks;
  const plugin = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8")).hooks;
  const flatten = (hooks, root) =>
    Object.entries(hooks).flatMap(([event, groups]) =>
      groups.flatMap((g) =>
        g.hooks.map((h) => ({
          event,
          matcher: g.matcher,
          script: h.command.match(/\.claude\/hooks\/([\w.-]+\.sh)/)?.[1],
          root: h.command.includes(root),
          if: h.if,
          timeout: h.timeout,
          onFailure: h.onFailure,
        })),
      ),
    );

  it("hooks.json mirrors settings.json with ${CLAUDE_PLUGIN_ROOT} paths", () => {
    const a = flatten(settings, '"$CLAUDE_PROJECT_DIR"');
    const b = flatten(plugin, "${CLAUDE_PLUGIN_ROOT}");
    expect(a.every((h) => h.root)).toBe(true);
    expect(b.every((h) => h.root)).toBe(true);
    expect(b.map(({ root: _root, ...h }) => h)).toEqual(a.map(({ root: _root, ...h }) => h));
  });

  it("registers every hook script under .claude/hooks except the agent frontmatter one", () => {
    const registered = new Set(flatten(settings, "").map((h) => h.script));
    for (const hook of HOOKS.filter((h) => h !== "agent-no-deploy.sh"))
      expect(registered, hook).toContain(hook);
    expect(registered).not.toContain("agent-no-deploy.sh");
  });
});
