import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "..", ".claude", "workflows", "component-lanes.js");

/**
 * Control-flow tests for .claude/workflows/component-lanes.js.
 *
 * The Workflow runtime runs the script body as plain async JavaScript with
 * agent(), pipeline(), parallel(), phase(), log() and args as globals. These
 * tests run the same body with stubs that follow the documented semantics:
 * pipeline() runs every item through its stages independently, each stage gets
 * (prevResult, originalItem, index), and a throwing stage drops the item to
 * null. The stub agent() answers by label, so each test scripts the agents.
 */

const source = readFileSync(SCRIPT, "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const body = source.replace(/^export const meta =/m, "const meta =");

function run(args, answer) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, agentType: opts.agentType, phase: opts.phase, prompt });
    return answer(opts.label || "", prompt, calls);
  };
  const pipeline = (items, ...stages) =>
    Promise.all(
      items.map(async (item, i) => {
        let prev = item;
        for (const stage of stages) {
          try {
            prev = await stage(prev, item, i);
          } catch {
            return null;
          }
        }
        return prev;
      }),
    );
  const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)));
  const fn = new AsyncFunction("args", "agent", "pipeline", "parallel", "phase", "log", body);
  return fn(
    args,
    agent,
    pipeline,
    parallel,
    () => {},
    (m) => logs.push(m),
  ).then((result) => ({ result, calls, logs }));
}

const SHA = "a".repeat(64);
const comp = (name, tier, extra = {}) => ({
  name,
  tier,
  dir: `src/components/${name}`,
  testFile: `src/components/${name}/${name}.test.tsx`,
  testSha256: SHA,
  ...extra,
});
const BUILT = { files: ["x.tsx"], testsPassed: true, summary: "built" };
const GREEN = { testSha256: SHA, passed: true, failing: [] };
const TESTS_OK = { passed: true, total: 3, failed: 0, failing: [] };

/** Answers every agent with success unless a test overrides a label prefix. */
function happy(overrides = {}) {
  return (label, prompt, calls) => {
    for (const [prefix, fn] of Object.entries(overrides)) {
      if (label.startsWith(prefix)) return fn(label, prompt, calls);
    }
    if (label.startsWith("build:") || label.startsWith("fix:") || label.startsWith("shared:"))
      return BUILT;
    if (label.startsWith("check:")) return GREEN;
    if (label.startsWith("diff:"))
      return { results: [{ width: 1440, mismatchPct: 0.01 }], fixes: [] };
    if (label.startsWith("tests:")) return TESTS_OK;
    return null;
  };
}

describe("component-lanes workflow", () => {
  it("keeps meta a pure literal as the first statement", () => {
    const first = source.replace(/^((\s*\/\/.*)?\n)+/, "").split("\n")[0];
    expect(first).toBe("export const meta = {");
    const meta = source.slice(source.indexOf("export const meta"), source.indexOf("\n}\n") + 2);
    // No calls, spreads, variables or template literals outside the string values.
    expect(meta.replace(/'[^']*'/g, "''")).not.toMatch(/`|\.\.\.|\(/);
    for (const title of ["Build", "Shared files", "Visual", "Tests"]) {
      expect(meta).toContain(`title: '${title}'`);
      expect(source).toContain(`phase: '${title}'`);
    }
  });

  it("uses none of the APIs the runtime forbids", () => {
    expect(source).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(\)|\bimport\(|require\(/);
  });

  it("builds tier by tier and reports every component green", async () => {
    const { result, calls } = await run(
      { components: [comp("Card", 1), comp("Button", 0), comp("Badge", 0)], pages: [] },
      happy(),
    );
    const builds = calls.filter((c) => c.label.startsWith("build:")).map((c) => c.label);
    expect(builds.indexOf("build:Card:a1")).toBeGreaterThan(builds.indexOf("build:Button:a1"));
    expect(builds.indexOf("build:Card:a1")).toBeGreaterThan(builds.indexOf("build:Badge:a1"));
    expect(result.summary.green).toBe(3);
    expect(calls.find((c) => c.label === "build:Button:a1").agentType).toBe(
      "figma-react-converter",
    );
  });

  it("stops at maxBuildAttempts and marks the component for review", async () => {
    const { result, calls } = await run(
      { components: [comp("Button", 0)], pages: [], maxBuildAttempts: 2 },
      happy({
        "check:": () => ({
          testSha256: SHA,
          passed: false,
          failing: ["renders label: expected 'Go'"],
        }),
      }),
    );
    expect(calls.filter((c) => c.label.startsWith("build:")).length).toBe(2);
    expect(result.components[0]).toMatchObject({
      name: "Button",
      status: "NEEDS_REVIEW",
      attempts: 2,
    });
    expect(calls.find((c) => c.label === "build:Button:a2").prompt).toContain("expected 'Go'");
  });

  it("fails a lane whose test file changed, without retrying", async () => {
    const { result, calls } = await run(
      { components: [comp("Button", 0)], pages: [] },
      happy({ "check:": () => ({ testSha256: "b".repeat(64), passed: true, failing: [] }) }),
    );
    expect(result.components[0].status).toBe("TEST_TAMPERED");
    expect(calls.filter((c) => c.label.startsWith("build:")).length).toBe(1);
  });

  it("applies the shared-file changes a tier asked for once, after the tier", async () => {
    const { calls } = await run(
      { components: [comp("Button", 0), comp("Badge", 0)], pages: [] },
      happy({
        "build:": () => ({ ...BUILT, sharedChanges: ["export it from src/components/index.ts"] }),
      }),
    );
    const shared = calls.filter((c) => c.label.startsWith("shared:"));
    expect(shared.length).toBe(1);
    expect(shared[0].prompt).toContain("Button: export it from src/components/index.ts");
    expect(shared[0].prompt).toContain("Badge: export it from src/components/index.ts");
  });

  it("gives each component one fixer per visual round and re-checks every page", async () => {
    const pages = [
      { name: "home", url: "http://localhost:5173/", references: { 1440: "ref/home.png" } },
      {
        name: "pricing",
        url: "http://localhost:5173/pricing",
        references: { 1440: "ref/pricing.png" },
      },
    ];
    const { result, calls } = await run(
      { components: [comp("Button", 0), comp("Hero", 2)], pages },
      happy({
        "diff:": (label) =>
          label.endsWith(":r1")
            ? {
                results: [{ width: 1440, mismatchPct: 0.08 }],
                fixes: [
                  { component: "Button", issue: "padding", fix: "use p-4" },
                  { component: "Hero", issue: "heading size", fix: "use text-5xl" },
                ],
              }
            : { results: [{ width: 1440, mismatchPct: 0.01 }], fixes: [] },
      }),
    );
    const fixes = calls.filter((c) => c.label.startsWith("fix:"));
    expect(fixes.map((c) => c.label).sort()).toEqual(["fix:Button:r1", "fix:Hero:r1"]);
    expect(fixes.find((c) => c.label === "fix:Button:r1").prompt).toMatch(
      /home[\s\S]*pricing|pricing[\s\S]*home/,
    );
    expect(calls.filter((c) => c.label.endsWith(":r2") && c.label.startsWith("diff:")).length).toBe(
      2,
    );
    expect(result.pages.home).toMatchObject({ status: "PASS", rounds: 2 });
    expect(result.summary.pagesPassed).toBe(2);
  });

  it("stops at maxVisualIterations and leaves the failing pages for review", async () => {
    const pages = [
      { name: "home", url: "http://localhost:5173/", references: { 1440: "ref/home.png" } },
    ];
    const { result, calls, logs } = await run(
      { components: [comp("Hero", 2)], pages, maxVisualIterations: 3 },
      happy({
        "diff:": () => ({
          results: [{ width: 1440, mismatchPct: 0.2 }],
          fixes: [{ component: "Hero", issue: "layout", fix: "grid" }],
        }),
      }),
    );
    expect(calls.filter((c) => c.label.startsWith("diff:")).length).toBe(3);
    expect(calls.filter((c) => c.label.startsWith("fix:")).length).toBe(2);
    expect(result.pages.home.status).toBe("NEEDS_REVIEW");
    expect(logs.some((l) => l.includes("iteration bound (3)"))).toBe(true);
  });

  it("decides a pass from the numbers, not from the agent", async () => {
    const pages = [
      { name: "home", url: "http://localhost:5173/", references: { 1440: "ref/home.png" } },
    ];
    const { result } = await run(
      { components: [comp("Hero", 2)], pages, maxVisualIterations: 1, diffPassThreshold: 0.02 },
      happy({
        "diff:": () => ({ results: [{ width: 1440, mismatchPct: 0.03 }], fixes: [], pass: true }),
      }),
    );
    expect(result.pages.home.status).toBe("NEEDS_REVIEW");
  });

  it("skips pages without references and honors skipVisual", async () => {
    const pages = [
      { name: "home", url: "http://localhost:5173/", references: { 1440: "ref/home.png" } },
      { name: "about", url: "http://localhost:5173/about" },
    ];
    const { result, calls } = await run(
      { components: [comp("Hero", 2)], pages, skipVisual: true },
      happy(),
    );
    expect(calls.some((c) => c.label.startsWith("diff:"))).toBe(false);
    expect(result.pages.home.status).toBe("SKIPPED");
    expect(result.pages.about.status).toBe("SKIPPED");
  });

  it("refuses to start without components", async () => {
    await expect(run({ components: [] }, happy())).rejects.toThrow(/args\.components/);
  });
});
