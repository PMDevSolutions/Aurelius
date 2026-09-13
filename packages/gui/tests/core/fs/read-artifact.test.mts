import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readImageDataUrl, readTextArtifact } from "../../../src/core/fs/read-artifact";

test("readImageDataUrl reads a PNG under .claude/visual-qa and rejects everything else", async () => {
  const root = await mkdtemp(join(tmpdir(), "aurelius-qa-"));
  try {
    const diffs = join(root, ".claude", "visual-qa", "diffs", "regression");
    await mkdir(diffs, { recursive: true });
    await writeFile(join(diffs, "diff-home.png"), Buffer.from("png-bytes"));

    const dataUrl = await readImageDataUrl(
      root,
      ".claude/visual-qa/diffs/regression/diff-home.png",
    );
    assert.ok(dataUrl?.startsWith("data:image/png;base64,"));

    // outside the allowlisted dir
    await writeFile(join(root, "secret.png"), Buffer.from("x"));
    assert.equal(await readImageDataUrl(root, "secret.png"), null);
    await mkdir(join(root, "tests", "visual"), { recursive: true });
    await writeFile(join(root, "tests", "visual", "x.png"), Buffer.from("x"));
    assert.equal(await readImageDataUrl(root, "tests/visual/x.png"), null);
    // path traversal
    assert.equal(await readImageDataUrl(root, "../evil.png"), null);
    // wrong extension within the allowed dir
    await writeFile(join(root, ".claude", "visual-qa", "note.txt"), "hi");
    assert.equal(await readImageDataUrl(root, ".claude/visual-qa/note.txt"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readTextArtifact reads allowlisted markdown and rejects traversal and secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "aurelius-qa2-"));
  try {
    await mkdir(join(root, ".claude", "visual-qa"), { recursive: true });
    await writeFile(join(root, ".claude", "visual-qa", "regression-report.md"), "# Report");
    assert.equal(
      await readTextArtifact(root, ".claude/visual-qa/regression-report.md"),
      "# Report",
    );
    assert.equal(await readTextArtifact(root, "../../etc/passwd"), null);
    await writeFile(join(root, ".env"), "SECRET=1");
    assert.equal(await readTextArtifact(root, ".env"), null);
    await writeFile(join(root, "README.md"), "# not an artifact");
    assert.equal(await readTextArtifact(root, "README.md"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
