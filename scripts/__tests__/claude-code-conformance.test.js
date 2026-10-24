import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "claude-code-conformance.js");

function run(root) {
  try {
    const out = execFileSync("node", [SCRIPT, "--root", root, "--json"], { encoding: "utf8" });
    return { code: 0, result: JSON.parse(out) };
  } catch (err) {
    return { code: err.status, result: JSON.parse(String(err.stdout)) };
  }
}

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "cc-conformance-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

const messages = (r) => r.result.findings.map((f) => `${f.severity}:${f.file}:${f.message}`);

describe("claude-code-conformance", () => {
  it("passes on this repository", () => {
    const r = run(repoRoot);
    expect(r.result.errors).toBe(0);
    expect(r.code).toBe(0);
    expect(r.result.agents).toBeGreaterThan(0);
    expect(r.result.skills).toBeGreaterThan(0);
  });

  it("flags retired tools, invalid colors, and subagent-unavailable tools on agents", () => {
    const root = fixture({
      ".claude/agents/writer.md":
        "---\nname: writer\ndescription: Writes things\ntools: Read, MultiEdit, Task, AskUserQuestion, TodoWrite\ncolor: gold\n---\nBody\n",
    });
    try {
      const r = run(root);
      expect(r.code).toBe(1);
      const m = messages(r);
      expect(m.some((x) => x.includes('"MultiEdit" is retired'))).toBe(true);
      expect(m.some((x) => x.includes('"Task" is retired'))).toBe(true);
      expect(
        m.some((x) => x.includes('"AskUserQuestion" is never available inside a subagent')),
      ).toBe(true);
      expect(m.some((x) => x.includes('color: "gold"'))).toBe(true);
      expect(m.some((x) => x.startsWith("warning") && x.includes("TodoWrite"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags name/filename mismatches, unknown fields, and dangling skill references", () => {
    const root = fixture({
      ".claude/agents/alpha.md":
        "---\nname: beta\ndescription: d\ntools: Read\nfoo: bar\nskills:\n  - nope\n---\nBody\n",
    });
    try {
      const m = messages(run(root));
      expect(m.some((x) => x.includes('name "beta" does not match'))).toBe(true);
      expect(m.some((x) => x.includes('unknown field "foo"'))).toBe(true);
      expect(m.some((x) => x.includes('skills: "nope" is not a skill'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags globs on skills, legacy command files, and shadowed commands", () => {
    const root = fixture({
      ".claude/skills/thing/SKILL.md":
        '---\nname: thing\ndescription: d\nglobs:\n  - "src/**"\n---\nBody\n',
      ".claude/commands/thing.md": "---\ndescription: old\n---\nBody\n",
      ".claude/commands/other.md": "---\ndescription: old\n---\nBody\n",
    });
    try {
      const r = run(root);
      const m = messages(r);
      expect(m.some((x) => x.includes('"globs" is not a field'))).toBe(true);
      expect(m.some((x) => x.includes('shadowed: a skill named "thing"'))).toBe(true);
      expect(m.some((x) => x.includes("legacy custom command"))).toBe(true);
      expect(r.code).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags hooks that use the retired $TOOL_INPUT contract or missing scripts", () => {
    const root = fixture({
      ".claude/settings.json": JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: 'bash .claude/hooks/old.sh "$TOOL_INPUT" "$TOOL_OUTPUT"',
                },
              ],
            },
          ],
          BogusEvent: [{ hooks: [{ type: "command", command: "true" }] }],
        },
      }),
      ".claude/hooks/old.sh":
        "#!/usr/bin/env bash\nset -u\ntrap 'exit 0' ERR\nTOOL_INPUT=\"${1:-}\"\necho hi\n",
    });
    try {
      const m = messages(run(root));
      expect(m.some((x) => x.includes('"$TOOL_INPUT" is not part of the hook contract'))).toBe(
        true,
      );
      expect(m.some((x) => x.includes('unknown event "BogusEvent"'))).toBe(true);
      expect(m.some((x) => x.includes("reads TOOL_INPUT/TOOL_OUTPUT from positional args"))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts onFailure on a hook handler and range-checks autoCompactWindow (2.1.295, 2.1.296)", () => {
    const root = fixture({
      ".claude/settings.json": JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: 'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh',
                  timeout: 10,
                  onFailure: "block",
                },
              ],
            },
          ],
        },
      }),
      ".claude/hooks/guard.sh": "#!/usr/bin/env bash\nset -u\ntrap 'exit 0' ERR\ncat >/dev/null\n",
      ".claude/agents/fine.md":
        "---\nname: fine\ndescription: Fine agent\nautoCompactWindow: 150000\n---\nBody\n",
      ".claude/agents/tiny.md":
        "---\nname: tiny\ndescription: Tiny window\nautoCompactWindow: 5000\n---\nBody\n",
    });
    try {
      const m = messages(run(root));
      expect(m.some((x) => x.includes('handler field "onFailure"'))).toBe(false);
      expect(m.some((x) => x.includes("tiny.md") && x.includes("autoCompactWindow"))).toBe(true);
      expect(m.some((x) => x.includes("fine.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves dated audit records and retirement notes out of the retired-tool scan", () => {
    const root = fixture({
      "docs/audits/2026-10-03-audit.md": "| 1 | Agents listed `MultiEdit` | fixed |\n",
      "docs/guide.md":
        "| `TaskStop` | Stop a background task (replaces `KillShell`) |\n| `Edit` | Edit files; the old `MultiEdit` is gone |\n",
    });
    try {
      const r = run(root);
      expect(r.result.warnings).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips dangling symlinks instead of crashing (Chrome profile locks)", () => {
    const root = fixture({ "docs/guide.md": "Use the `MultiEdit` tool here.\n" });
    try {
      mkdirSync(join(root, ".auth", "profile"), { recursive: true });
      symlinkSync(join(root, "missing-target"), join(root, ".auth", "profile", "SingletonLock"));
      symlinkSync(join(root, "missing-dir"), join(root, ".claude-skill-link"));
      const r = run(root);
      expect(r.code).toBe(0);
      expect(
        messages(r).some((x) => x.includes("docs/guide.md") && x.includes('"MultiEdit"')),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves gitignored directories out of the live-docs scan in a git repo", () => {
    const root = fixture({
      ".gitignore": "tmp/\n",
      "tmp/scratch.md": "Use the `MultiEdit` tool here.\n",
      "docs/guide.md": "Use the `MultiEdit` tool here.\n",
    });
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      const m = messages(run(root));
      expect(m.some((x) => x.includes("docs/guide.md"))).toBe(true);
      expect(m.some((x) => x.includes("tmp/scratch.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets metadata.excludedAgents keep an agent out of the plugin, and only those", () => {
    const agent = (n) => `---\nname: ${n}\ndescription: ${n} agent\n---\nBody\n`;
    const manifest = (agents, excluded) =>
      JSON.stringify({
        name: "demo",
        agents: agents.map((a) => `./.claude/agents/${a}.md`),
        metadata: { excludedAgents: excluded },
      });
    const files = {
      ".claude/agents/keep.md": agent("keep"),
      ".claude/agents/skip.md": agent("skip"),
      ".claude/agents/other.md": agent("other"),
    };
    const ok = fixture({
      ...files,
      ".claude-plugin/plugin.json": manifest(["keep", "other"], ["skip"]),
    });
    const listedAnyway = fixture({
      ...files,
      ".claude-plugin/plugin.json": manifest(["keep", "other", "skip"], ["skip"]),
    });
    const missing = fixture({
      ...files,
      ".claude-plugin/plugin.json": manifest(["keep"], ["skip"]),
    });
    try {
      expect(run(ok).result.errors).toBe(0);
      expect(
        messages(run(listedAnyway)).some((x) =>
          x.includes("metadata.excludedAgents keeps out of the plugin"),
        ),
      ).toBe(true);
      expect(messages(run(missing)).some((x) => x.includes("other.md is not listed"))).toBe(true);
    } finally {
      for (const root of [ok, listedAnyway, missing])
        rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a clean minimal project", () => {
    const root = fixture({
      ".claude/agents/good.md":
        "---\nname: good\ndescription: Good agent\ntools: Read, Write, Edit, mcp__gsc__*\nmodel: sonnet\ncolor: blue\nmemory: project\n---\nBody\n",
      ".claude/skills/neat/SKILL.md":
        "---\nname: neat\ndescription: Neat skill\nargument-hint: <x>\ncontext: fork\nagent: good\nbackground: false\n---\nBody\n",
      ".claude/rules/style.md": '---\npaths:\n  - "src/**"\n---\nRule\n',
    });
    try {
      const r = run(root);
      expect(r.result.errors).toBe(0);
      expect(r.code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
