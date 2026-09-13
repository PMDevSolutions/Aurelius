import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommandSpec, fillTemplate } from "../../../src/core/product/command-spec";
import { CommandBuilder } from "../../../src/core/shell/command-builder";
import { getScreen, getStep, soleStep } from "../../../src/shared/product";
import { aureliusManifest } from "../../../src/shared/product/aurelius";
import type { ShellResolver } from "../../../src/core/shell/shell-resolver";

// Proves the generic engine renders a concrete command from a manifest's declarative
// CommandDescriptor — no per-product code path. Uses a fake shell so resolution is
// deterministic, then drives the REAL Aurelius manifest steps.
const fakeShell: ShellResolver = {
  resolveBash: async () => "bash",
  resolveTool: async () => null,
};
const commands = new CommandBuilder(fakeShell);

test("fillTemplate substitutes {placeholders} and drops empty placeholder-only parts", () => {
  assert.deepEqual(fillTemplate(["a", "{x}", "c-{y}"], { x: "B", y: "D" }), ["a", "B", "c-D"]);
  assert.deepEqual(fillTemplate(undefined, {}), []);
  assert.deepEqual(fillTemplate(["{missing}"], {}), []); // placeholder-only + empty → dropped
  assert.deepEqual(fillTemplate(["pre-{missing}"], {}), ["pre-"]); // mixed text is kept
});

test("wizard step renders setup-project.sh name --renderer id, omitting dryRun when empty", async () => {
  const step = soleStep(aureliusManifest, "wizard");
  const spec = await buildCommandSpec(commands, "/repo", step.command, {
    name: "my-app",
    renderer: "vite",
    dryRun: "",
  });
  assert.equal(spec.command, "bash");
  assert.ok(spec.args[0].endsWith("setup-project.sh"));
  assert.deepEqual(spec.args.slice(1), ["my-app", "--renderer", "vite"]);
});

test("wizard step appends --dry-run when previewing", async () => {
  const step = soleStep(aureliusManifest, "wizard");
  const spec = await buildCommandSpec(commands, "/repo", step.command, {
    name: "my-app",
    renderer: "expo",
    dryRun: "--dry-run",
  });
  assert.deepEqual(spec.args.slice(1), ["my-app", "--renderer", "expo", "--dry-run"]);
});

test('qa steps pass the app URL; cross-browser prefixes "compare"', async () => {
  const qa = getScreen(aureliusManifest, "qa");
  const regression = await buildCommandSpec(commands, "/repo", getStep(qa, "regression").command, {
    url: "http://localhost:5173",
  });
  assert.ok(regression.args[0].endsWith("regression-test.sh"));
  assert.deepEqual(regression.args.slice(1), ["http://localhost:5173"]);
  const cross = await buildCommandSpec(commands, "/repo", getStep(qa, "cross-browser").command, {
    url: "http://localhost:5173",
  });
  assert.deepEqual(cross.args.slice(1), ["compare", "http://localhost:5173"]);
});

test("prereq + playwright steps target their scripts", async () => {
  const prereq = getScreen(aureliusManifest, "prereq");
  assert.ok(
    (await buildCommandSpec(commands, "/repo", getStep(prereq, "check").command)).args[0].endsWith(
      "check-prerequisites.sh",
    ),
  );
  assert.ok(
    (
      await buildCommandSpec(commands, "/repo", getStep(prereq, "playwright").command)
    ).args[0].endsWith("setup-playwright.sh"),
  );
});

test('pipeline "figma" step renders `claude -p "/build-from-figma <url>"`', async () => {
  const step = getStep(getScreen(aureliusManifest, "pipeline"), "figma");
  const spec = await buildCommandSpec(commands, "/repo", step.command, {
    figmaUrl: "https://figma.com/x",
  });
  assert.equal(spec.command, "claude");
  assert.deepEqual(spec.args, ["-p", "/build-from-figma https://figma.com/x"]);
});
