import { test } from "node:test";
import assert from "node:assert/strict";
import { createPipelineRun } from "../../../src/core/pipelines/pipeline-run";
import { CommandBuilder } from "../../../src/core/shell/command-builder";
import { getScreen, getStep } from "../../../src/shared/product";
import { aureliusManifest } from "../../../src/shared/product/aurelius";
import type { ShellResolver } from "../../../src/core/shell/shell-resolver";
import type {
  ProcessEvent,
  ProcessResult,
  ProcessRunner,
  RunHandle,
  RunSpec,
} from "../../../src/core/process/runner-types";

const fakeShell: ShellResolver = {
  resolveBash: async () => "bash",
  resolveTool: async () => null,
};
const commands = new CommandBuilder(fakeShell);
const figmaCommand = getStep(getScreen(aureliusManifest, "pipeline"), "figma").command;

/** A ProcessRunner that records the spec it was handed, then exits with a code. */
class CaptureRunner implements ProcessRunner {
  lastSpec: RunSpec | null = null;
  constructor(private readonly code = 0) {}
  run(spec: RunSpec, onEvent: (e: ProcessEvent) => void): RunHandle {
    this.lastSpec = spec;
    let settle!: (r: ProcessResult) => void;
    const done = new Promise<ProcessResult>((resolve) => {
      settle = resolve;
    });
    queueMicrotask(() => {
      onEvent({ type: "exit", code: this.code, signal: null });
      settle({ code: this.code, signal: null });
    });
    return { pid: 1, done, cancel: () => {} };
  }
}

test('figma pipeline renders `claude -p "/build-from-figma <url>"` and reports success', async () => {
  const runner = new CaptureRunner(0);
  const run = await createPipelineRun({
    repoRoot: "/repo",
    input: { kind: "figma", figmaUrl: " https://figma.com/x " },
    runner,
    commands,
    command: figmaCommand,
  });
  run.run(() => {});
  const result = await run.result;
  assert.deepEqual(result, { ok: true, kind: "figma", error: undefined });
  assert.equal(runner.lastSpec?.command, "claude");
  assert.deepEqual(runner.lastSpec?.args, ["-p", "/build-from-figma https://figma.com/x"]);
  assert.equal(runner.lastSpec?.cwd, "/repo");
});

test("a non-zero exit yields ok:false with an error message", async () => {
  const run = await createPipelineRun({
    repoRoot: "/repo",
    input: { kind: "figma", figmaUrl: "https://figma.com/x" },
    runner: new CaptureRunner(1),
    commands,
    command: figmaCommand,
  });
  run.run(() => {});
  const result = await run.result;
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /failed/i);
});

test("figma rejects without a URL (before any task is created)", async () => {
  await assert.rejects(() =>
    createPipelineRun({
      repoRoot: "/repo",
      input: { kind: "figma", figmaUrl: "   " },
      runner: new CaptureRunner(0),
      commands,
      command: figmaCommand,
    }),
  );
});
