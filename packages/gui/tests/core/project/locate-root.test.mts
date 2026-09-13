import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateRepoRoot, validateRepoRoot } from "../../../src/core/project/locate-root";
import { aureliusManifest } from "../../../src/shared/product/aurelius";

const project = aureliusManifest.project;

async function makeAureliusRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aurelius-gui-test-"));
  await mkdir(join(root, "bin"), { recursive: true });
  await writeFile(join(root, "bin", "aurelius.mjs"), "// cli\n");
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "scripts", "check-prerequisites.sh"), "#!/bin/bash\n");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "aurelius" }));
  return root;
}

test("locateRepoRoot walks up to find the project root", async () => {
  const root = await makeAureliusRoot();
  try {
    const nested = join(root, "a", "b", "c");
    await mkdir(nested, { recursive: true });
    const ref = await locateRepoRoot(nested, project);
    assert.equal(ref.valid, true);
    assert.equal(ref.root, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateRepoRoot rejects a non-Aurelius directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "not-aurelius-"));
  try {
    const ref = await validateRepoRoot(dir, project);
    assert.equal(ref.valid, false);
    assert.ok(ref.reason);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
