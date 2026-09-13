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
 * Prepare a pipeline run from a manifest-declared command descriptor:
 *   - `claude` (Figma) → a headless `claude -p "/build-from-figma <url>"` session
 *     that runs the autonomous pipeline (intake → token lock → TDD → build →
 *     visual diff → E2E → quality gate → report).
 * Required-input validation runs first and throws before any task is created.
 */
export async function createPipelineRun(deps: PipelineDeps): Promise<PipelineRun> {
  const { kind } = deps.input;
  const figmaUrl = deps.input.figmaUrl?.trim() ?? "";
  if (!figmaUrl) throw new Error("A Figma file URL is required.");

  const spec = await buildCommandSpec(deps.commands, deps.repoRoot, deps.command, { figmaUrl });

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
        error: res.code === 0 ? undefined : "Pipeline failed — see the log for details.",
      });
    });
    return handle;
  };

  return { run, result };
}
