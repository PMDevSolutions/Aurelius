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

test("fillTemplate substitutes {placeholders} and passes through the rest", () => {
  assert.deepEqual(fillTemplate(["a", "{x}", "c-{y}"], { x: "B", y: "D" }), ["a", "B", "c-D"]);
  assert.deepEqual(fillTemplate(undefined, {}), []);
  assert.deepEqual(fillTemplate(["{missing}"], {}), [""]); // unknown placeholder → ''
});

test("bashScript descriptor → bash <root>/<script> <args>", async () => {
  const spec = await buildCommandSpec(commands, "/repo", {
    exec: "bashScript",
    script: "scripts/check-prerequisites.sh",
    argsTemplate: [],
  });
  assert.equal(spec.command, "bash");
  assert.ok(spec.args[0].endsWith("check-prerequisites.sh"));
  assert.equal(spec.cwd, "/repo");
});

test("module descriptors are not runnable through buildCommandSpec", async () => {
  await assert.rejects(() =>
    buildCommandSpec(commands, "/repo", { exec: "module", module: "scripts/init" }),
  );
});

// ── Driven by the real Aurelius manifest ─────────────────────────────────────────

test('site "list" step renders `node bin/aurelius.mjs site list`', async () => {
  const step = getStep(getScreen(aureliusManifest, "site"), "list");
  const spec = await buildCommandSpec(commands, "/repo", step.command);
  assert.equal(spec.command, process.execPath);
  assert.ok(spec.args[0].endsWith("aurelius.mjs"));
  assert.deepEqual(spec.args.slice(1), ["site", "list"]);
});

test('site "use" step fills the {siteId} placeholder', async () => {
  const step = getStep(getScreen(aureliusManifest, "site"), "use");
  const spec = await buildCommandSpec(commands, "/repo", step.command, { siteId: "abc-123" });
  assert.deepEqual(spec.args.slice(1), ["site", "use", "abc-123"]);
});

test('site "apply" step fills the {plan} placeholder', async () => {
  const step = getStep(getScreen(aureliusManifest, "site"), "apply");
  const spec = await buildCommandSpec(commands, "/repo", step.command, {
    plan: ".aurelius/plans/my-site/plan.json",
  });
  assert.deepEqual(spec.args.slice(1), ["apply", ".aurelius/plans/my-site/plan.json"]);
});

test('site "publish" step renders `node bin/aurelius.mjs publish`', async () => {
  const step = getStep(getScreen(aureliusManifest, "site"), "publish");
  const spec = await buildCommandSpec(commands, "/repo", step.command);
  assert.deepEqual(spec.args.slice(1), ["publish"]);
});

test('qa "visual:diff" step renders `bash -c "pnpm run visual:diff"`', async () => {
  const step = getStep(getScreen(aureliusManifest, "qa"), "visual:diff");
  const spec = await buildCommandSpec(commands, "/repo", step.command);
  assert.equal(spec.command, "bash");
  assert.deepEqual(spec.args, ["-c", "pnpm run visual:diff"]);
});

test("prereq step targets scripts/check-prerequisites.sh", async () => {
  const step = soleStep(aureliusManifest, "prereq");
  const spec = await buildCommandSpec(commands, "/repo", step.command);
  assert.equal(spec.command, "bash");
  assert.ok(spec.args[0].endsWith("check-prerequisites.sh"));
});

test('pipeline "figma" step renders a `claude -p` prompt with the URL and slug', async () => {
  const step = getStep(getScreen(aureliusManifest, "pipeline"), "figma");
  const spec = await buildCommandSpec(commands, "/repo", step.command, {
    figmaUrl: "https://figma.com/x",
    slug: "my-site",
  });
  assert.equal(spec.command, "claude");
  assert.equal(spec.args[0], "-p");
  assert.match(spec.args[1], /https:\/\/figma\.com\/x/);
  assert.match(spec.args[1], /my-site/);
});

test('pipeline "indesign" step renders the `node bin/aurelius.mjs` CLI', async () => {
  const step = getStep(getScreen(aureliusManifest, "pipeline"), "indesign");
  const spec = await buildCommandSpec(commands, "/repo", step.command, {
    file: "./a.idml",
    slug: "broch",
  });
  assert.equal(spec.command, process.execPath);
  assert.ok(spec.args[0].endsWith("aurelius.mjs"));
  assert.deepEqual(spec.args.slice(1), ["pipeline", "indesign", "./a.idml", "--slug", "broch"]);
});
