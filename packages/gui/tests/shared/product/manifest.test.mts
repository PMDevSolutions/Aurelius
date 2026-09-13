import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ACTIVE_PRODUCT_ID,
  PRODUCTS,
  activeManifest,
  getScreen,
  getStep,
  soleStep,
} from "../../../src/shared/product";
import { aureliusManifest } from "../../../src/shared/product/aurelius";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..", "..");

test("the active product is Aurelius", () => {
  assert.equal(ACTIVE_PRODUCT_ID, "aurelius");
  assert.equal(activeManifest, PRODUCTS.aurelius);
  assert.equal(activeManifest.displayName, "Aurelius");
});

test("Aurelius exposes the four screens, in order, with their nav labels", () => {
  assert.deepEqual(
    aureliusManifest.screens.map((s) => s.id),
    ["prereq", "wizard", "pipeline", "qa"],
  );
  assert.deepEqual(
    aureliusManifest.screens.map((s) => s.navLabel),
    ["Prerequisites", "Setup wizard", "Build from Figma", "Visual QA"],
  );
});

test("prereq screen: check (parsed, exit 0|1 ok) + Playwright installer", () => {
  const prereq = getScreen(aureliusManifest, "prereq");
  assert.deepEqual(
    prereq.steps.map((s) => s.id),
    ["check", "playwright"],
  );
  const check = soleStep(aureliusManifest, "prereq");
  assert.equal(check.parser, "prereq");
  assert.deepEqual(check.successExitCodes, [0, 1]);
  assert.equal(check.taskKind, "prereq-check");
  assert.equal(getStep(prereq, "playwright").taskKind, "prereq:playwright");
});

test("wizard runs setup-project.sh with name/renderer/dryRun placeholders", () => {
  const create = soleStep(aureliusManifest, "wizard");
  assert.equal(create.taskKind, "init");
  assert.equal(create.command.exec, "bashScript");
  if (create.command.exec === "bashScript") {
    assert.equal(create.command.script, "scripts/setup-project.sh");
    assert.deepEqual(create.command.argsTemplate, [
      "{name}",
      "--renderer",
      "{renderer}",
      "{dryRun}",
    ]);
  }
  assert.deepEqual(
    getScreen(aureliusManifest, "wizard").extras?.frameworks?.map((f) => f.id),
    ["nextjs", "vite", "astro", "sveltekit", "expo"],
  );
});

test("pipeline screen drives /build-from-figma through headless Claude Code", () => {
  const figma = getStep(getScreen(aureliusManifest, "pipeline"), "figma");
  assert.equal(figma.taskKind, "pipeline:figma");
  assert.equal(figma.command.exec, "claude");
  if (figma.command.exec === "claude") {
    assert.deepEqual(figma.command.argsTemplate, ["-p", "/build-from-figma {figmaUrl}"]);
  }
  assert.equal(
    getScreen(aureliusManifest, "pipeline").extras?.docs?.figma,
    "docs/figma-to-react/README.md",
  );
});

test("qa screen lists the five visual-QA scripts with a {url} argument", () => {
  const qa = getScreen(aureliusManifest, "qa");
  assert.deepEqual(
    qa.steps.map((s) => s.id),
    ["baselines", "regression", "responsive", "dark-mode", "cross-browser"],
  );
  for (const step of qa.steps) {
    assert.equal(step.command.exec, "bashScript");
    assert.equal(step.taskKind, `qa:${step.id}`);
    if (step.command.exec === "bashScript") {
      assert.ok(step.command.argsTemplate?.includes("{url}"), `${step.id} takes {url}`);
    }
  }
});

test("every bashScript step points at a script that exists in this repo", async () => {
  for (const screen of aureliusManifest.screens) {
    for (const step of screen.steps) {
      if (step.command.exec !== "bashScript") continue;
      await assert.doesNotReject(
        () => access(join(repoRoot, ...step.command.script.split("/"))),
        `${screen.id}/${step.id}: ${step.command.script} missing`,
      );
    }
  }
});

test("project identity carries the Aurelius checkout markers", () => {
  assert.deepEqual(aureliusManifest.project.markers, [
    "scripts/setup-project.sh",
    ".claude/pipeline.config.json",
  ]);
  assert.equal(aureliusManifest.project.packageName, "aurelius");
  assert.match(aureliusManifest.project.selectTitle, /Aurelius/);
});

test("selectors throw on unknown ids", () => {
  assert.throws(() => getScreen(aureliusManifest, "site"));
  assert.throws(() => getStep(getScreen(aureliusManifest, "qa"), "nope"));
});
