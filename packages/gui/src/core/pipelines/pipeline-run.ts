import type { CommandDescriptor } from "../../shared/product/manifest";
import type { PipelineInput, PipelineResult } from "../../shared/types/pipeline";
import type { ProcessEvent, ProcessRunner, RunHandle } from "../process/runner-types";
import type { CommandBuilder } from "../shell/command-builder";
import { buildCommandSpec } from "../product/command-spec";

export interface PipelineDeps {
  repoRoot: string;
  input: PipelineInput;
  runner: ProcessRunner;
  commands: CommandBuilder;
  /** The pipeline step's command descriptor, from the manifest. */
  command: CommandDescriptor;
}

export interface PipelineRun {
  run: (onEvent: (event: ProcessEvent) => void) => RunHandle;
  result: Promise<PipelineResult>;
}

/**
 * Prepare a conversion run from a manifest-declared command descriptor:
 *   - `claude`  (Figma, Canva) → a headless `claude -p "<prompt>"` session driving
 *     the figma/canva-to-wix autonomous workflow (BuildPlan → apply → QA);
 *   - `nodeBin` (InDesign)     → the deterministic `node bin/aurelius.mjs pipeline
 *     indesign …`, which compiles a plan under .aurelius/plans/<slug>/.
 * Required-input validation runs first and throws before any task is created.
 */
export async function createPipelineRun(deps: PipelineDeps): Promise<PipelineRun> {
  const { kind, slug } = deps.input;

  if (kind === "figma" && !deps.input.figmaUrl?.trim())
    throw new Error("A Figma file URL is required.");
  if (kind === "canva" && !deps.input.canvaExport?.trim())
    throw new Error("A Canva export directory is required.");
  if (kind === "indesign" && !deps.input.indesignFile?.trim())
    throw new Error("An .idml or .pdf file is required.");

  // One vars bag for every conversion descriptor; fillTemplate uses whichever
  // placeholders the manifest's argsTemplate actually references.
  const vars = {
    figmaUrl: deps.input.figmaUrl?.trim() ?? "",
    canvaExport: deps.input.canvaExport?.trim() ?? "",
    file: deps.input.indesignFile?.trim() ?? "",
    slug,
  };
  const spec = await buildCommandSpec(deps.commands, deps.repoRoot, deps.command, vars);

  let resolveResult!: (result: PipelineResult) => void;
  const result = new Promise<PipelineResult>((resolve) => {
    resolveResult = resolve;
  });

  const run = (onEvent: (event: ProcessEvent) => void): RunHandle => {
    const handle = deps.runner.run(spec, onEvent);
    void handle.done.then((res) => {
      resolveResult({
        ok: res.code === 0,
        kind,
        slug,
        error: res.code === 0 ? undefined : "Conversion failed — see the log for details.",
      });
    });
    return handle;
  };

  return { run, result };
}
