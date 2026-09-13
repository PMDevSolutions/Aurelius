/** The design-to-app pipelines the GUI can launch (Canva/screenshot/conversation are follow-ups). */
export type PipelineKind = "figma";

export interface PipelineInput {
  kind: PipelineKind;
  /** Figma file/design URL, optionally with ?node-id=. */
  figmaUrl: string;
}

export interface PipelineResult {
  ok: boolean;
  kind: PipelineKind;
  error?: string;
}
