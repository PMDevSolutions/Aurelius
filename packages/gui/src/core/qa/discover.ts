import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { QaArtifacts, QaGallery, QaReport } from "../../shared/types/qa";

/** Reports the visual-QA scripts write (regression-test.sh, cross-browser-baseline.sh). */
export const QA_REPORTS: readonly QaReport[] = [
  { title: "Regression report", relPath: ".claude/visual-qa/regression-report.md" },
  { title: "Cross-browser report", relPath: ".claude/visual-qa/cross-browser-report.md" },
];

/** PNG directories the scripts write, in display order. */
export const QA_GALLERIES: readonly { title: string; relDir: string }[] = [
  { title: "Regression diffs", relDir: ".claude/visual-qa/diffs/regression" },
  { title: "Regression screenshots", relDir: ".claude/visual-qa/screenshots/regression" },
  { title: "Responsive screenshots", relDir: ".claude/visual-qa/screenshots/responsive" },
  { title: "Dark mode screenshots", relDir: ".claude/visual-qa/screenshots/dark" },
  { title: "Dark vs light diffs", relDir: ".claude/visual-qa/diffs/dark-vs-light" },
  { title: "Cross-browser diffs", relDir: ".claude/visual-qa/diffs/cross-browser" },
  { title: "Cross-browser screenshots", relDir: ".claude/visual-qa/screenshots/cross-browser" },
  { title: "Baselines", relDir: ".claude/visual-qa/baselines" },
];

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function listPngs(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  } catch {
    return [];
  }
}

/** Discover whatever QA artifacts exist on disk for the project (repo-relative paths). */
export async function discoverQaArtifacts(repoRoot: string): Promise<QaArtifacts> {
  const reports: QaReport[] = [];
  for (const r of QA_REPORTS) {
    if (await exists(join(repoRoot, ...r.relPath.split("/")))) reports.push(r);
  }
  const galleries: QaGallery[] = [];
  for (const g of QA_GALLERIES) {
    const images = (await listPngs(join(repoRoot, ...g.relDir.split("/")))).map(
      (f) => `${g.relDir}/${f}`,
    );
    if (images.length > 0) galleries.push({ title: g.title, images });
  }
  return { reports, galleries };
}
