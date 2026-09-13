import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverQaArtifacts } from "../../../src/core/qa/discover";

async function tree(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aurelius-qa-"));
  for (const f of files) {
    await mkdir(join(root, ...f.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...f.split("/")), "x");
  }
  return root;
}

test("discovers only the reports and galleries that exist, in display order", async () => {
  const root = await tree([
    ".claude/visual-qa/regression-report.md",
    ".claude/visual-qa/diffs/regression/home-desktop.png",
    ".claude/visual-qa/diffs/regression/about-desktop.png",
    ".claude/visual-qa/diffs/regression/notes.txt",
    ".claude/visual-qa/screenshots/responsive/home-mobile-375px.png",
  ]);
  try {
    const a = await discoverQaArtifacts(root);
    assert.deepEqual(a.reports, [
      { title: "Regression report", relPath: ".claude/visual-qa/regression-report.md" },
    ]);
    assert.deepEqual(
      a.galleries.map((g) => g.title),
      ["Regression diffs", "Responsive screenshots"],
    );
    assert.deepEqual(a.galleries[0].images, [
      ".claude/visual-qa/diffs/regression/about-desktop.png",
      ".claude/visual-qa/diffs/regression/home-desktop.png",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an empty project yields no reports and no galleries", async () => {
  const root = await tree([]);
  try {
    assert.deepEqual(await discoverQaArtifacts(root), { reports: [], galleries: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
