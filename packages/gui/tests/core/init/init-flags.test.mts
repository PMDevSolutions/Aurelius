import { test } from "node:test";
import assert from "node:assert/strict";
import { toSetupVars, validateInitInput } from "../../../src/core/init/init-flags";

const frameworks = [{ id: "nextjs" }, { id: "vite" }];

test("maps a real run to name/renderer with an empty dryRun", () => {
  assert.deepEqual(toSetupVars({ name: " my-app ", renderer: "vite", preview: false }), {
    name: "my-app",
    renderer: "vite",
    dryRun: "",
  });
});

test("preview maps to --dry-run", () => {
  assert.equal(toSetupVars({ name: "x", renderer: "vite", preview: true }).dryRun, "--dry-run");
});

test("validateInitInput enforces the create-app.js name rule and a known renderer", () => {
  assert.equal(
    validateInitInput({ name: "my-app", renderer: "vite", preview: false }, frameworks),
    null,
  );
  assert.match(
    validateInitInput({ name: "", renderer: "vite", preview: false }, frameworks) ?? "",
    /name/i,
  );
  assert.match(
    validateInitInput({ name: "My App", renderer: "vite", preview: false }, frameworks) ?? "",
    /lowercase/,
  );
  assert.match(
    validateInitInput({ name: "ok", renderer: "rails", preview: false }, frameworks) ?? "",
    /framework/i,
  );
});
