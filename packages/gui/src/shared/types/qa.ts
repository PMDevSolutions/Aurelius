/** Visual-QA steps (manifest step ids on the qa screen) and the artifacts the GUI renders. */
export type QaStepId = "baselines" | "regression" | "responsive" | "dark-mode" | "cross-browser";

/** A markdown report under .claude/visual-qa/ (repo-relative path). */
export interface QaReport {
  title: string;
  relPath: string;
}

/** A directory of PNGs under .claude/visual-qa/ (repo-relative image paths, sorted). */
export interface QaGallery {
  title: string;
  images: string[];
}

export interface QaArtifacts {
  /** Reports that exist on disk, in display order. */
  reports: QaReport[];
  /** Galleries that have at least one PNG, in display order. */
  galleries: QaGallery[];
}
