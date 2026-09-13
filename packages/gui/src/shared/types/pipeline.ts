/** The three design-to-Wix conversion pipelines the GUI can launch. */
export type PipelineKind = "figma" | "canva" | "indesign";

export interface PipelineInput {
  kind: PipelineKind;
  /** Target site/plan slug (names the plan dir .aurelius/plans/<slug>; a hint for Claude runs). */
  slug: string;
  /** Figma file URL (kind === 'figma'). */
  figmaUrl?: string;
  /** Canva HTML/CSS export directory (kind === 'canva'). */
  canvaExport?: string;
  /** Path to an .idml or .pdf (kind === 'indesign'). */
  indesignFile?: string;
}

export interface PipelineResult {
  ok: boolean;
  kind: PipelineKind;
  slug: string;
  error?: string;
}
